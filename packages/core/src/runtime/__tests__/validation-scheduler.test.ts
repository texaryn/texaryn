import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createValidationScheduler } from '../validation-scheduler.js'
import type { SchedulerCallbacks } from '../validation-scheduler.js'
import type { ValidationResult } from '../../types.js'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function thenable<T>(value: T) {
  return {
    then: (onFulfill: (v: T) => void) => {
      onFulfill(value)
    },
  }
}

const validResult: ValidationResult = { valid: true, errors: [] }
const invalidResult: ValidationResult = {
  valid: false,
  errors: [{ instancePointer: '/name', keyword: 'required', params: {} }],
}

function makeCallbacks(overrides: Partial<SchedulerCallbacks> = {}): {
  callbacks: SchedulerCallbacks
  runValidation: ReturnType<typeof vi.fn>
  onPending: ReturnType<typeof vi.fn>
  onResult: ReturnType<typeof vi.fn>
  onError: ReturnType<typeof vi.fn>
} {
  const runValidation = vi.fn(overrides.runValidation ?? (() => validResult))
  const onPending = vi.fn(overrides.onPending)
  const onResult = vi.fn(overrides.onResult)
  const onError = vi.fn(overrides.onError)
  return {
    callbacks: { runValidation, onPending, onResult, onError },
    runValidation,
    onPending,
    onResult,
    onError,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createValidationScheduler', () => {
  it('schedule("blur") calls runValidation and onResult synchronously for sync validators', () => {
    const { callbacks, runValidation, onResult } = makeCallbacks({
      runValidation: () => validResult,
    })
    const scheduler = createValidationScheduler(callbacks)

    scheduler.schedule('blur')

    expect(runValidation).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenCalledExactlyOnceWith(validResult, 'blur')
  })

  it('schedule("submit") calls runValidation and onResult synchronously for sync validators', () => {
    const { callbacks, runValidation, onResult } = makeCallbacks({
      runValidation: () => invalidResult,
    })
    const scheduler = createValidationScheduler(callbacks)

    scheduler.schedule('submit')

    expect(runValidation).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenCalledExactlyOnceWith(invalidResult, 'submit')
  })

  it('schedule("change") debounces and fires after debounceMs', () => {
    const { callbacks, runValidation, onResult } = makeCallbacks()
    const scheduler = createValidationScheduler(callbacks, 300)

    scheduler.schedule('change')
    expect(runValidation).not.toHaveBeenCalled()

    vi.advanceTimersByTime(299)
    expect(runValidation).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(runValidation).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenCalledExactlyOnceWith(validResult, 'change')
  })

  it('schedule("change") resets timer on subsequent calls (only one validation fires)', () => {
    const { callbacks, runValidation } = makeCallbacks()
    const scheduler = createValidationScheduler(callbacks, 300)

    scheduler.schedule('change')
    vi.advanceTimersByTime(200)
    scheduler.schedule('change')
    vi.advanceTimersByTime(200)
    scheduler.schedule('change')
    vi.advanceTimersByTime(299)
    expect(runValidation).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(runValidation).toHaveBeenCalledTimes(1)
  })

  it('custom debounceMs is respected', () => {
    const { callbacks, runValidation } = makeCallbacks()
    const scheduler = createValidationScheduler(callbacks, 50)

    scheduler.schedule('change')
    vi.advanceTimersByTime(49)
    expect(runValidation).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(runValidation).toHaveBeenCalledTimes(1)
  })

  it('sync validation never calls onPending', () => {
    const { callbacks, onPending } = makeCallbacks({ runValidation: () => validResult })
    const scheduler = createValidationScheduler(callbacks)

    scheduler.schedule('blur')

    expect(onPending).not.toHaveBeenCalled()
  })

  it('async validation calls onPending then onResult', async () => {
    const def = deferred<ValidationResult>()
    const { callbacks, onPending, onResult } = makeCallbacks({
      runValidation: () => def.promise,
    })
    const scheduler = createValidationScheduler(callbacks)

    scheduler.schedule('blur')

    expect(onPending).toHaveBeenCalledTimes(1)
    expect(onResult).not.toHaveBeenCalled()

    def.resolve(validResult)
    await def.promise

    expect(onResult).toHaveBeenCalledExactlyOnceWith(validResult, 'blur')
  })

  it('invalidate() drops in-flight async result (epoch mismatch)', async () => {
    const def = deferred<ValidationResult>()
    const { callbacks, onResult } = makeCallbacks({ runValidation: () => def.promise })
    const scheduler = createValidationScheduler(callbacks)

    scheduler.schedule('blur')
    scheduler.invalidate()
    def.resolve(validResult)
    await def.promise.catch(() => {})
    // allow the .then microtask queued by runValidationNow to flush
    await Promise.resolve()

    expect(onResult).not.toHaveBeenCalled()
  })

  it('invalidate() lets queued debounce timer fire with current epoch', () => {
    const { callbacks, runValidation, onResult } = makeCallbacks()
    const scheduler = createValidationScheduler(callbacks, 300)

    scheduler.schedule('change')
    scheduler.invalidate()
    vi.advanceTimersByTime(300)

    expect(runValidation).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenCalledTimes(1)
  })

  it('an immediate blur/submit does not orphan a queued change debounce timer', () => {
    const { callbacks, runValidation } = makeCallbacks()
    const scheduler = createValidationScheduler(callbacks, 300)

    // Queue a debounced change, then an immediate blur runs synchronously
    // without touching the change timer.
    scheduler.schedule('change')
    scheduler.schedule('blur')
    expect(runValidation).toHaveBeenCalledTimes(1)

    // invalidate() no longer cancels the still-pending change timer; it
    // fires against current data and is gated by epoch at fire time via
    // runValidationNow, not by being cancelled here.
    scheduler.invalidate()
    vi.advanceTimersByTime(300)

    expect(runValidation).toHaveBeenCalledTimes(2)
  })

  it('cancelScheduled() cancels a queued debounce timer', () => {
    const { callbacks, runValidation } = makeCallbacks()
    const scheduler = createValidationScheduler(callbacks, 300)

    scheduler.schedule('change')
    scheduler.cancelScheduled()
    vi.advanceTimersByTime(1000)

    expect(runValidation).not.toHaveBeenCalled()
  })

  it('invalidate() does not cancel queued debounce timer but destroy() does', () => {
    const { callbacks, runValidation } = makeCallbacks()
    const scheduler = createValidationScheduler(callbacks, 300)

    scheduler.schedule('change')
    scheduler.invalidate()
    scheduler.destroy()
    vi.advanceTimersByTime(1000)

    expect(runValidation).not.toHaveBeenCalled()
  })

  it('destroy() prevents in-flight async result from calling back', async () => {
    const def = deferred<ValidationResult>()
    const { callbacks, onResult, onError } = makeCallbacks({ runValidation: () => def.promise })
    const scheduler = createValidationScheduler(callbacks)

    scheduler.schedule('blur')
    scheduler.destroy()
    def.resolve(validResult)
    await Promise.resolve()
    await Promise.resolve()

    expect(onResult).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('destroy() clears debounce timer', () => {
    const { callbacks, runValidation } = makeCallbacks()
    const scheduler = createValidationScheduler(callbacks, 300)

    scheduler.schedule('change')
    scheduler.destroy()
    vi.advanceTimersByTime(1000)

    expect(runValidation).not.toHaveBeenCalled()
  })

  it('rejected async validation calls onError', async () => {
    const def = deferred<ValidationResult>()
    const error = new Error('boom')
    const { callbacks, onError, onResult } = makeCallbacks({ runValidation: () => def.promise })
    const scheduler = createValidationScheduler(callbacks)

    scheduler.schedule('submit')
    def.reject(error)
    await def.promise.catch(() => {})

    expect(onError).toHaveBeenCalledExactlyOnceWith(error, 'submit')
    expect(onResult).not.toHaveBeenCalled()
  })

  it('stale rejected async validation is ignored', async () => {
    const def = deferred<ValidationResult>()
    const { callbacks, onError } = makeCallbacks({ runValidation: () => def.promise })
    const scheduler = createValidationScheduler(callbacks)

    scheduler.schedule('submit')
    scheduler.invalidate()
    def.reject(new Error('stale'))
    await def.promise.catch(() => {})
    await Promise.resolve()

    expect(onError).not.toHaveBeenCalled()
  })

  it('runValidation throwing synchronously calls onError', () => {
    const error = new Error('sync failure')
    const { callbacks, onError, onResult, onPending } = makeCallbacks({
      runValidation: () => {
        throw error
      },
    })
    const scheduler = createValidationScheduler(callbacks)

    scheduler.schedule('blur')

    expect(onError).toHaveBeenCalledExactlyOnceWith(error, 'blur')
    expect(onResult).not.toHaveBeenCalled()
    expect(onPending).not.toHaveBeenCalled()
  })

  it('thenable (non-Promise) objects are handled as async', () => {
    const { callbacks, onPending, onResult } = makeCallbacks({
      runValidation: () => thenable(validResult) as unknown as ValidationResult,
    })
    const scheduler = createValidationScheduler(callbacks)

    scheduler.schedule('blur')

    expect(onPending).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenCalledExactlyOnceWith(validResult, 'blur')
  })
})

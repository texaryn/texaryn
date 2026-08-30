import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import {
  createSignal,
  createComputed,
  batch,
  subscribeToSignal,
} from '../signal.js'

describe('Signal', () => {
  it('get returns initial value', () => {
    const s = createSignal(10)
    expect(s.get()).toBe(10)
  })

  it('set updates get', () => {
    const s = createSignal(0)
    s.set(5)
    expect(s.get()).toBe(5)
  })

  it('subscribe fires on change', () => {
    const s = createSignal(0)
    const listener = vi.fn()
    subscribeToSignal(s, listener)
    s.set(1)
    expect(listener).toHaveBeenCalledOnce()
  })

  it('no notification for identical value', () => {
    const s = createSignal(1)
    const listener = vi.fn()
    subscribeToSignal(s, listener)
    s.set(1)
    expect(listener).not.toHaveBeenCalled()
  })
})

describe('Computed', () => {
  it('derives from a signal', () => {
    const a = createSignal(2)
    const doubled = createComputed(() => a.get() * 2)
    expect(doubled.get()).toBe(4)
  })

  it('updates when dependency changes', () => {
    const a = createSignal(1)
    const doubled = createComputed(() => a.get() * 2)
    a.set(5)
    expect(doubled.get()).toBe(10)
  })

  it('chains through multiple computeds', () => {
    const a = createSignal(1)
    const b = createComputed(() => a.get() + 1)
    const c = createComputed(() => b.get() * 10)
    expect(c.get()).toBe(20)
    a.set(3)
    expect(c.get()).toBe(40)
  })

  it('drops stale dependencies on recompute', () => {
    const a = createSignal(true)
    const b = createSignal('yes')
    const c = createSignal('no')
    const result = createComputed(() => (a.get() ? b.get() : c.get()))
    expect(result.get()).toBe('yes')
    const listener = vi.fn()
    subscribeToSignal(result, listener)

    c.set('NO')
    expect(listener).not.toHaveBeenCalled()

    a.set(false)
    expect(result.get()).toBe('NO')
  })
})

describe('batch', () => {
  it('defers notifications until batch completes', () => {
    const a = createSignal(0)
    const b = createSignal(0)
    const listener = vi.fn()
    subscribeToSignal(a, listener)
    subscribeToSignal(b, listener)

    batch(() => {
      a.set(1)
      b.set(2)
      expect(listener).not.toHaveBeenCalled()
    })

    expect(listener).toHaveBeenCalledOnce()
  })

  it('nested batch defers to outermost', () => {
    const s = createSignal(0)
    const listener = vi.fn()
    subscribeToSignal(s, listener)

    batch(() => {
      batch(() => {
        s.set(1)
      })
      expect(listener).not.toHaveBeenCalled()
    })

    expect(listener).toHaveBeenCalledOnce()
  })
})

describe('property-based', () => {
  it('signal always reflects last set value', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { minLength: 1 }), (values) => {
        const s = createSignal(0)
        for (const v of values) s.set(v)
        expect(s.get()).toBe(values[values.length - 1])
      }),
    )
  })

  it('computed is consistent with source after any sequence of sets', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { minLength: 1 }), (values) => {
        const s = createSignal(0)
        const doubled = createComputed(() => s.get() * 2)
        for (const v of values) s.set(v)
        expect(doubled.get()).toBe(s.get() * 2)
      }),
    )
  })

  it('subscriber call count equals number of distinct set values', () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (values) => {
        const s = createSignal<number | undefined>(undefined)
        const listener = vi.fn()
        subscribeToSignal(s, listener)
        let expectedCalls = 0
        let prev: number | undefined = undefined
        for (const v of values) {
          if (!Object.is(v, prev)) expectedCalls++
          s.set(v)
          prev = v
        }
        expect(listener).toHaveBeenCalledTimes(expectedCalls)
      }),
    )
  })
})

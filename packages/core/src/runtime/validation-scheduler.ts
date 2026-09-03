import type { MaybePromise, ValidationResult } from '../types.js'

export type ValidationTrigger = 'blur' | 'change' | 'submit'

export interface SchedulerCallbacks {
  runValidation: (trigger: ValidationTrigger) => MaybePromise<ValidationResult>
  onPending: () => void
  onResult: (result: ValidationResult, trigger: ValidationTrigger) => void
  onError: (error: unknown, trigger: ValidationTrigger) => void
}

export interface ValidationScheduler {
  /** Schedule a validation run. Change triggers are debounced. */
  schedule(trigger: ValidationTrigger): void
  /** Increment the epoch, invalidating in-flight and future-stale results. */
  invalidate(): void
  /** Cancel queued debounce timers without touching the epoch. */
  cancelScheduled(): void
  /** Clean up all timers and prevent in-flight results from calling back. */
  destroy(): void
}

const DEFAULT_DEBOUNCE_MS = 300

function isThenable(value: unknown): value is PromiseLike<ValidationResult> {
  return value != null && typeof (value as { then?: unknown }).then === 'function'
}

export function createValidationScheduler(
  callbacks: SchedulerCallbacks,
  debounceMs: number = DEFAULT_DEBOUNCE_MS,
): ValidationScheduler {
  let epoch = 0
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let destroyed = false

  function clearDebounceTimer(): void {
    if (debounceTimer != null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  }

  function runValidationNow(trigger: ValidationTrigger): void {
    if (destroyed) return
    const capturedEpoch = epoch

    let result: MaybePromise<ValidationResult>
    try {
      result = callbacks.runValidation(trigger)
    } catch (err) {
      callbacks.onError(err, trigger)
      return
    }

    if (isThenable(result)) {
      callbacks.onPending()
      result.then(
        (r) => {
          if (!destroyed && capturedEpoch === epoch) callbacks.onResult(r, trigger)
        },
        (err) => {
          if (!destroyed && capturedEpoch === epoch) callbacks.onError(err, trigger)
        },
      )
    } else {
      callbacks.onResult(result, trigger)
    }
  }

  return {
    schedule(trigger: ValidationTrigger): void {
      if (destroyed) return
      if (trigger === 'change') {
        clearDebounceTimer()
        debounceTimer = setTimeout(() => {
          debounceTimer = null
          runValidationNow('change')
        }, debounceMs)
      } else {
        runValidationNow(trigger)
      }
    },

    invalidate(): void {
      epoch += 1
      // No longer cancels debounce timer. The timer fires against current
      // data and captures the current epoch, so stale results are still gated.
    },

    cancelScheduled(): void {
      clearDebounceTimer()
    },

    destroy(): void {
      destroyed = true
      clearDebounceTimer()
    },
  }
}

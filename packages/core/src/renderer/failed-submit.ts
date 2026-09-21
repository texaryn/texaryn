import type { SubmissionState } from '../ir/runtime-state.js'
import type { VisibleError } from '../types.js'

export interface FailedSubmitTracker {
  /** True once per accepted attempt that settles invalid: the summary focuses now. */
  settle(submission: SubmissionState, visibleErrors: readonly VisibleError[]): boolean
}

export function createFailedSubmitTracker(initial: SubmissionState): FailedSubmitTracker {
  let handled = initial.attempts
  return {
    settle(submission, visibleErrors) {
      if (submission.attempts < handled) handled = submission.attempts
      if (submission.attempts === handled) return false
      if (submission.status === 'validating' || submission.status === 'submitting') return false
      handled = submission.attempts
      return submission.status === 'idle' && submission.error === undefined && submission.cancelled === undefined && visibleErrors.length > 0
    },
  }
}

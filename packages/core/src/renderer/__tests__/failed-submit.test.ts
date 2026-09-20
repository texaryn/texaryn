import { describe, expect, it } from 'vitest'
import type { SubmissionState } from '../../ir/runtime-state.js'
import type { JsonPointer, NodeId, VisibleError } from '../../types.js'
import { createFailedSubmitTracker } from '../failed-submit.js'

const error: VisibleError = {
  nodeId: 'node_2' as NodeId,
  fieldTitle: 'Name',
  pointer: '/name' as JsonPointer,
  errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }],
}
const idle = (attempts: number, error?: unknown): SubmissionState =>
  error === undefined ? { status: 'idle', attempts } : { status: 'idle', attempts, error }
const validating = (attempts: number): SubmissionState => ({ status: 'validating', attempts })

describe('createFailedSubmitTracker', () => {
  it('focuses once when an attempt settles invalid, whether or not validating was observed', () => {
    const seen = createFailedSubmitTracker(idle(0))
    expect(seen.settle(validating(1), [])).toBe(false)
    expect(seen.settle(idle(1), [error])).toBe(true)
    expect(seen.settle(idle(1), [error])).toBe(false)

    const unseen = createFailedSubmitTracker(idle(0))
    expect(unseen.settle(idle(1), [error])).toBe(true)
  })

  it('consumes a successful submit and a validation exception without focusing', () => {
    const tracker = createFailedSubmitTracker(idle(0))
    expect(tracker.settle({ status: 'submitting', attempts: 1 }, [])).toBe(false)
    expect(tracker.settle({ status: 'submitted', attempts: 1 }, [])).toBe(false)
    expect(tracker.settle(idle(1), [error])).toBe(false)

    const failing = createFailedSubmitTracker(idle(0))
    expect(failing.settle(idle(1, new Error('evaluator down')), [error])).toBe(false)
    expect(failing.settle(idle(1), [error])).toBe(false)
  })

  it('ignores errors that appear without a new attempt', () => {
    const tracker = createFailedSubmitTracker(idle(0))
    expect(tracker.settle(idle(0), [error])).toBe(false)
  })

  it('starts from the attempts it was created at, so an old failure never focuses', () => {
    const tracker = createFailedSubmitTracker(idle(3))
    expect(tracker.settle(idle(3), [error])).toBe(false)
    expect(tracker.settle(idle(4), [error])).toBe(true)
  })

  it('reseeds after a Reset lowers attempts', () => {
    const tracker = createFailedSubmitTracker(idle(0))
    expect(tracker.settle(idle(1), [error])).toBe(true)
    expect(tracker.settle(idle(0), [])).toBe(false)
    expect(tracker.settle(idle(1), [error])).toBe(true)
  })

  it('consumes a cancelled attempt without focusing', () => {
    const tracker = createFailedSubmitTracker(idle(0))
    expect(tracker.settle(validating(1), [error])).toBe(false)
    expect(tracker.settle({ status: 'idle', attempts: 1, cancelled: true }, [error])).toBe(false)
    expect(tracker.settle(idle(1), [error])).toBe(false)
    expect(tracker.settle(idle(2), [error])).toBe(true)
  })
})

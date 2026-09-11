import { describe, it, expect } from 'vitest'
import { createFormRuntime } from '../runtime.js'
import type { SchemaEvaluationPort, SchemaProjection, NodeProjection } from '../../schema/port.js'
import type { JsonPointer, NodeId, ValidationResult } from '../../types.js'

const at = (s: string) => s as JsonPointer

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

/** A root object with two string children, validated by a promise we control. */
function port(validate: () => Promise<ValidationResult>): SchemaEvaluationPort {
  const nodes = new Map<JsonPointer, NodeProjection>()
  nodes.set(at(''), {
    type: 'object',
    constraints: {},
    active: true,
    annotations: {},
    children: [
      { pointer: at('/a'), key: 'a', required: false },
      { pointer: at('/b'), key: 'b', required: false },
    ],
  })
  nodes.set(at('/a'), { type: 'string', constraints: {}, active: true, annotations: {} })
  nodes.set(at('/b'), { type: 'string', constraints: {}, active: true, annotations: {} })
  return { project: (): SchemaProjection => ({ nodes }), validate }
}

function idFor(runtime: ReturnType<typeof createFormRuntime>, pointer: string): NodeId {
  const doc = runtime.document.getSnapshot()
  const found = Object.keys(doc.nodes).find((id) => doc.nodes[id]?.dataPointer === pointer)
  if (found === undefined) throw new Error(`no node for pointer ${pointer}`)
  return found as NodeId
}

const settle = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((r) => setTimeout(r, 20))
}

/**
 * A command that throws must leave nothing behind.
 *
 * `dispatch` used to invalidate the validation scheduler before running the
 * command, on the assumption that a dispatched command always happens. Since
 * #124 one does not: `setAtPointer` refuses to write through a value that
 * cannot hold a property, which is reachable whenever the caller's data
 * contradicts its schema.
 *
 * The two steps then disagree. `invalidate` bumps the epoch, which is how an
 * in-flight validation result is recognised as stale and dropped without
 * calling back, and everything that would repair the state afterwards runs
 * past the throw. The result was not a lost update but a wedged form: the
 * submission stayed at `validating` and its nodes at `pending`, with no writer
 * left to move them.
 *
 * The invariant is the ordering rather than any one line: nothing observable
 * happens until the handler has returned. A refused write changed no data, so
 * the validation already running against that unchanged data is still the
 * right answer and is left alone.
 */
describe('a command that throws', () => {
  it('leaves an in-flight validation able to finish', async () => {
    const d = deferred<ValidationResult>()
    const runtime = createFormRuntime(port(() => d.promise), {
      initialData: 'plain',
      validationDebounceMs: 0,
    })
    const a = idFor(runtime, '/a')

    runtime.dispatch({ type: 'Submit' })
    await Promise.resolve()
    expect(runtime.getNodeState(a)?.validationStatus.getSnapshot()).toBe('pending')

    expect(() => runtime.dispatch({ type: 'SetValue', nodeId: a, value: 'x' })).toThrow()

    d.resolve({ valid: true, errors: [] })
    await settle()

    expect(runtime.getNodeState(a)?.validationStatus.getSnapshot()).not.toBe('pending')
  })

  it('leaves a submit validation able to finish', async () => {
    const d = deferred<ValidationResult>()
    const runtime = createFormRuntime(port(() => d.promise), {
      initialData: 'plain',
      validationDebounceMs: 0,
    })
    const a = idFor(runtime, '/a')

    runtime.dispatch({ type: 'Submit' })
    await Promise.resolve()
    expect(runtime.submission.getSnapshot().status).toBe('validating')

    expect(() => runtime.dispatch({ type: 'SetValue', nodeId: a, value: 'x' })).toThrow()

    d.resolve({ valid: true, errors: [] })
    await settle()

    expect(runtime.submission.getSnapshot().status).not.toBe('validating')
  })

  /**
   * The same, from a refusal deeper than the root, so the pin does not rest on
   * one shape of offending data.
   */
  it('leaves the form usable when the refusal is below the root', async () => {
    const d = deferred<ValidationResult>()
    const nodes = new Map<JsonPointer, NodeProjection>()
    nodes.set(at(''), {
      type: 'object',
      constraints: {},
      active: true,
      annotations: {},
      children: [{ pointer: at('/owner'), key: 'owner', required: false }],
    })
    nodes.set(at('/owner'), {
      type: 'object',
      constraints: {},
      active: true,
      annotations: {},
      children: [{ pointer: at('/owner/name'), key: 'name', required: false }],
    })
    nodes.set(at('/owner/name'), {
      type: 'string',
      constraints: {},
      active: true,
      annotations: {},
    })
    const runtime = createFormRuntime(
      { project: (): SchemaProjection => ({ nodes }), validate: () => d.promise },
      { initialData: { owner: 'plain' }, validationDebounceMs: 0 },
    )
    const name = idFor(runtime, '/owner/name')

    runtime.dispatch({ type: 'Submit' })
    await Promise.resolve()
    expect(runtime.submission.getSnapshot().status).toBe('validating')

    expect(() => runtime.dispatch({ type: 'SetValue', nodeId: name, value: 'x' })).toThrow()

    d.resolve({ valid: true, errors: [] })
    await settle()

    expect(runtime.submission.getSnapshot().status).not.toBe('validating')
    expect(runtime.getNodeState(name)?.validationStatus.getSnapshot()).not.toBe('pending')
  })

  it('still changes nothing about the data itself', async () => {
    const runtime = createFormRuntime(port(async () => ({ valid: true, errors: [] })), {
      initialData: 'plain',
    })
    const a = idFor(runtime, '/a')

    expect(() => runtime.dispatch({ type: 'SetValue', nodeId: a, value: 'x' })).toThrow()

    expect(runtime.data.getSnapshot()).toBe('plain')
    runtime.dispatch({ type: 'Reset', data: { a: 'ok' } })
    expect(runtime.data.getSnapshot()).toEqual({ a: 'ok' })
  })
})

import { describe, it, expect } from 'vitest'
import { createFormRuntime } from '../runtime.js'
import type { SchemaEvaluationPort, SchemaProjection, NodeProjection } from '../../schema/port.js'
import type { JsonPointer, NodeId } from '../../types.js'

const at = (s: string) => s as JsonPointer

/** `/owner/address/city`: two object levels above a string field. */
function nestedThreeDeep(): SchemaEvaluationPort {
  const nodes = new Map<JsonPointer, NodeProjection>()
  const object = (children: { pointer: JsonPointer; key: string; required: boolean }[]) => ({
    type: 'object' as const,
    constraints: {},
    active: true,
    annotations: {},
    children,
  })
  nodes.set(at(''), object([{ pointer: at('/owner'), key: 'owner', required: false }]))
  nodes.set(
    at('/owner'),
    object([{ pointer: at('/owner/address'), key: 'address', required: false }]),
  )
  nodes.set(
    at('/owner/address'),
    object([{ pointer: at('/owner/address/city'), key: 'city', required: false }]),
  )
  nodes.set(at('/owner/address/city'), {
    type: 'string',
    constraints: {},
    active: true,
    annotations: {},
  })
  return {
    project: (): SchemaProjection => ({ nodes }),
    validate: () => ({ valid: true, errors: [] }),
  }
}

function nodeIdFor(runtime: ReturnType<typeof createFormRuntime>, pointer: string): NodeId {
  const doc = runtime.document.getSnapshot()
  const found = Object.keys(doc.nodes).find((id) => doc.nodes[id]?.dataPointer === pointer)
  if (found === undefined) throw new Error(`no node for pointer ${pointer}`)
  return found as NodeId
}

/**
 * The first keystroke in a field two levels below absent data.
 *
 * This is #129 as a form rather than as a helper call, and it is why the defect
 * mattered: `dispatch` returns `void` and is called from an event handler, so
 * the `TypeError` landed in the host's render with nothing able to handle it.
 * A schema with a nested object and `initialData: {}` is an ordinary starting
 * state, not an edge case.
 */
describe('typing into a field below two absent levels', () => {
  it('creates the levels rather than throwing', () => {
    const runtime = createFormRuntime(nestedThreeDeep(), { initialData: {} })
    const nodeId = nodeIdFor(runtime, '/owner/address/city')

    runtime.dispatch({ type: 'SetValue', nodeId, value: 'Lyon' })

    expect(runtime.data.getSnapshot()).toEqual({ owner: { address: { city: 'Lyon' } } })
  })

  it('creates them from an omitted initialData too', () => {
    const runtime = createFormRuntime(nestedThreeDeep())
    const nodeId = nodeIdFor(runtime, '/owner/address/city')

    runtime.dispatch({ type: 'SetValue', nodeId, value: 'Lyon' })

    expect(runtime.data.getSnapshot()).toEqual({ owner: { address: { city: 'Lyon' } } })
  })

  it('leaves a sibling that was already there alone', () => {
    const runtime = createFormRuntime(nestedThreeDeep(), {
      initialData: { owner: { name: 'kept' } },
    })
    const nodeId = nodeIdFor(runtime, '/owner/address/city')

    runtime.dispatch({ type: 'SetValue', nodeId, value: 'Lyon' })

    expect(runtime.data.getSnapshot()).toEqual({
      owner: { name: 'kept', address: { city: 'Lyon' } },
    })
  })
})

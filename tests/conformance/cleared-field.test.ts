import { describe, it, expect } from 'vitest'
import { createFormRuntime, type NodeId } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createHyperjumpAdapter } from '@texaryn/schema-json-hyperjump'

/**
 * The interaction that found #147, at the level a user meets it rather than at
 * the port's.
 *
 * A number input cleared to empty becomes `undefined` in the binding, so the
 * runtime dispatches `SetValue(nodeId, undefined)` and hands the adapter an
 * instance holding a value that is not JSON. `dispatch` returns void, so an
 * adapter that throws on it throws into the host's render on a keystroke.
 *
 * Asserted through the runtime and not only through `validate`, because the
 * port suite would keep passing if the runtime stopped reaching it, and the
 * whole defect was that the two disagreed about data the runtime produces by
 * design.
 */
describe.each([
  ['json-schema-library', createJsonSchemaAdapter],
  ['@hyperjump/json-schema', createHyperjumpAdapter],
])('clearing a required number field (%s)', (_name, createAdapter) => {
  const schema = {
    type: 'object',
    properties: { age: { type: 'number' } },
    required: ['age'],
  }

  const clearedRuntime = async () => {
    const port = await (createAdapter as typeof createJsonSchemaAdapter)(schema)
    const runtime = createFormRuntime(port, { initialData: { age: 3 } })
    const nodes = runtime.document.getSnapshot().nodes
    const ageId = Object.values(nodes).find(
      (node) => (node as { dataPointer?: string }).dataPointer === '/age',
    )!.id as NodeId
    // Threw here, synchronously: the recompile calls `project` inside dispatch,
    // so this landed in the caller rather than in a rejected promise.
    runtime.dispatch({ type: 'SetValue', nodeId: ageId, value: undefined })
    // Then settle the debounced validation, which is the second entry point and
    // would throw into nothing at all.
    await new Promise((resolve) => setTimeout(resolve, 400))
    return runtime
  }

  it('does not throw', async () => {
    await expect(clearedRuntime()).resolves.toBeDefined()
  })

  // The key stays, holding `undefined`. ADR-003 rule 5 depends on it: a filled
  // location that became absent again would be eligible for its schema default,
  // so a cleared field would refill itself and could not be cleared at all.
  it('keeps the property present rather than removing it', async () => {
    const runtime = await clearedRuntime()
    const data = runtime.data.getSnapshot() as Record<string, unknown>
    expect(Object.keys(data)).toEqual(['age'])
    expect(data.age).toBeUndefined()
  })
})

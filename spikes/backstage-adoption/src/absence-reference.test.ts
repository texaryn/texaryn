import { describe, it, expect } from 'vitest'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createFormRuntime } from '@texaryn/core'
import type { FormRuntime } from '@texaryn/core'

/**
 * Whether a location that has been filled can ever become absent again, which
 * is the one behaviour the defaults contract in `docs/adr/003` depends on and
 * does not itself introduce.
 *
 * The contract fills only absent locations, and a filled location therefore
 * cannot be filled twice exactly while nothing removes a key. If either of the
 * first two tests starts failing, that consequence is gone and the ADR's rule 5
 * has to take one of the two answers it names: carry an explicit set of
 * materialised locations, keyed on stable item identity rather than a JSON
 * pointer, or accept that a deleted property becomes eligible again.
 *
 * The third test is about a different dependency: whether the port can carry
 * the information the contract's conflict rule needs.
 *
 * Measured against the published `@texaryn/core` 0.11.0 and
 * `@texaryn/schema-json` 0.6.0, not the workspace.
 */
function pointerId(runtime: FormRuntime, pointer: string): never {
  const nodes = Object.values(runtime.document.getSnapshot().nodes) as {
    id: string
    dataPointer: string | null
  }[]
  const found = nodes.find((node) => node.dataPointer === pointer)
  if (!found) throw new Error(`no node at ${pointer}`)
  return found.id as never
}

describe('a filled location never becomes absent', () => {
  it('clearing a field keeps its key, holding undefined', async () => {
    const port = await createJsonSchemaAdapter(
      { type: 'object', properties: { a: { type: 'string' } } },
      { defaultDialect: 'draft-07' },
    )
    const runtime = createFormRuntime(port, { initialData: { a: 'x' } })

    runtime.dispatch({ type: 'SetValue', nodeId: pointerId(runtime, '/a'), value: undefined })

    const data = runtime.data.getSnapshot() as Record<string, unknown>
    expect(Object.keys(data)).toEqual(['a'])
    expect('a' in data).toBe(true)
    expect(data.a).toBeUndefined()
    runtime.destroy()
  })

  /**
   * An insert with no value puts `null` in the data, because an array cannot
   * hold a hole and `undefined` is not JSON. Without a policy the row keeps it,
   * so the element is a value the defaults rule never overwrites. Under
   * `initialization: 'schema-defaults'` the command reports the row as a
   * location nobody stated a value for, and the pass fills it from the item
   * default before it is observable. Both halves pinned, since the first is the
   * behaviour an adopter who does not opt in submits.
   */
  it('an insert with no value writes null, filled only by an initialization policy', async () => {
    const port = await createJsonSchemaAdapter(
      {
        type: 'object',
        properties: { list: { type: 'array', items: { type: 'string', default: 'seed' } } },
      },
      { defaultDialect: 'draft-07' },
    )

    const bare = createFormRuntime(port, { initialData: { list: [] } })
    bare.dispatch({ type: 'InsertItem', containerId: pointerId(bare, '/list'), index: 0 })
    expect(bare.data.getSnapshot()).toEqual({ list: [null] })
    bare.destroy()

    const initialized = createFormRuntime(port, {
      initialData: { list: [] },
      initialization: 'schema-defaults',
    })
    initialized.dispatch({
      type: 'InsertItem',
      containerId: pointerId(initialized, '/list'),
      index: 0,
    })
    expect(initialized.data.getSnapshot()).toEqual({ list: ['seed'] })
    initialized.destroy()
  })

  it('deactivating a branch keeps the data it held', async () => {
    const port = await createJsonSchemaAdapter(
      {
        type: 'object',
        properties: { flag: { type: 'boolean' } },
        allOf: [
          {
            if: { properties: { flag: { const: true } }, required: ['flag'] },
            then: { properties: { revealed: { type: 'string' } } },
          },
        ],
      },
      { defaultDialect: 'draft-07' },
    )
    const runtime = createFormRuntime(port, {
      initialData: { flag: true, revealed: 'typed' },
    })

    runtime.dispatch({ type: 'SetValue', nodeId: pointerId(runtime, '/flag'), value: false })

    expect(runtime.data.getSnapshot()).toEqual({ flag: false, revealed: 'typed' })
    runtime.destroy()
  })
})

/**
 * The contract says two equally applicable declarations that disagree are a
 * diagnostic rather than a guess, and the port carries what that rule needs:
 * the annotation is omitted, the node names the schema positions that
 * disagreed in `defaultConflict`, and `SchemaProjection.diagnostics` reports
 * `ambiguous-default` with the same sources. Nothing picks a winner by
 * traversal order. Measured against the published 0.6.0 this directory
 * resolves.
 */
describe('what the port says about two disagreeing defaults', () => {
  it('omits the annotation and names both declarations', async () => {
    const port = await createJsonSchemaAdapter(
      {
        type: 'object',
        allOf: [
          { properties: { x: { type: 'string', default: 'a' } } },
          { properties: { x: { type: 'string', default: 'b' } } },
        ],
      },
      { defaultDialect: 'draft-07' },
    )

    const projection = port.project({})
    const declared = ['/allOf/0/properties/x', '/allOf/1/properties/x']

    const node = projection.nodes.get('/x' as never)
    expect(node?.annotations.default).toBeUndefined()
    expect(node?.defaultConflict).toEqual(declared)
    const reported = (projection.diagnostics ?? []).map(({ pointer, code, sources }) => ({
      pointer,
      code,
      sources,
    }))
    expect(reported).toEqual([{ pointer: '/x', code: 'ambiguous-default', sources: declared }])
  })
})

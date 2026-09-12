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
 * Measured against the published `@texaryn/core` 0.7.0 and
 * `@texaryn/schema-json` 0.3.0, not the workspace.
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
   * The prerequisite the defaults contract found rather than introduced.
   * `handleInsertItem` writes `cmd.value ?? null`, so an insert with no value
   * is indistinguishable from an insert of an explicit `null`, and the row
   * arrives holding `null`. Since the contract treats `null` as a value that is
   * never defaulted over, a newly inserted row could never receive its item
   * default. Tracked as its own defect; the contract records it as a
   * precondition rather than working around it.
   */
  it('an insert with no value writes null, which the defaults rule may not overwrite', async () => {
    const port = await createJsonSchemaAdapter(
      {
        type: 'object',
        properties: { list: { type: 'array', items: { type: 'string', default: 'seed' } } },
      },
      { defaultDialect: 'draft-07' },
    )
    const runtime = createFormRuntime(port, { initialData: { list: [] } })

    runtime.dispatch({ type: 'InsertItem', containerId: pointerId(runtime, '/list'), index: 0 })

    expect(runtime.data.getSnapshot()).toEqual({ list: [null] })
    runtime.destroy()
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
 * diagnostic rather than a guess. This is what the port can currently express
 * about that case, and the answer is nothing: `AnnotationSet.default` is one
 * value, `extractAnnotations` reads it from the already-reduced schema, and the
 * evaluator has merged the `allOf` branches by then. So the projection reports
 * the later branch's value with no record that there were two, which is the
 * traversal-order resolution the rule exists to forbid. Nothing reports it
 * either: `SchemaProjection.diagnostics` does not exist in the published 0.7.0
 * at all, since it is part of the held release, so this cannot even be asserted
 * against here.
 *
 * Measured against the published 0.3.0 this directory resolves, and left
 * asserting exactly that. #128 has since changed it: the adapter omits the
 * annotation and reports `ambiguous-default` instead, for declarations that
 * apply to every instance. Bumping this dependency is what should update the
 * assertion, since the point of the row is what a released version does.
 */
describe('what the port can say about two disagreeing defaults', () => {
  it('collapses them to the later one, silently, as of 0.3.0', async () => {
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

    expect(projection.nodes.get('/x' as never)?.annotations.default).toBe('b')
  })
})

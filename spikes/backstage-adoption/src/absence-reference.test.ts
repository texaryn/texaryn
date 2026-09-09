import { describe, it, expect } from 'vitest'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createFormRuntime } from '@texaryn/core'
import type { FormRuntime } from '@texaryn/core'

/**
 * Whether a location that has been filled can ever become absent again, which
 * is the one behaviour the defaults contract in `docs/adr/003` depends on and
 * does not itself introduce.
 *
 * The contract fills only absent locations and claims that gives it
 * once-per-location for free. That holds exactly while nothing removes a key.
 * If either of these tests starts failing, rule 5 of that ADR needs an explicit
 * set of materialised locations, and for array rows it cannot be keyed by JSON
 * pointer.
 *
 * Measured against the published `@texaryn/core` 0.7.0, not the workspace.
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

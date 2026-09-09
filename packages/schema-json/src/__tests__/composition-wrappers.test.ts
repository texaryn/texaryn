import { describe, it, expect } from 'vitest'
import { createJsonSchemaAdapter } from '../index.js'
import type { JsonPointer } from '@texaryn/core'

/**
 * Composition wrappers that carry no `type` of their own.
 *
 * `allOf`, `anyOf` and `oneOf` are applicators rather than type-specific
 * keywords, so none of them decides a shape. What changed is that a wrapper
 * which cannot be given one is now reported instead of vanishing, and these
 * pin which of those cases produce a node and which produce a diagnostic.
 */
async function projectWith(schema: unknown, data: unknown) {
  const adapter = await createJsonSchemaAdapter(schema, { defaultDialect: 'draft-07' })
  const projection = adapter.project(data)
  return {
    pointers: [...projection.nodes.keys()],
    codes: (projection.diagnostics ?? []).map((d) => `${d.pointer}:${d.code}`),
  }
}

describe('typeless composition wrappers', () => {
  /**
   * The wrapper resolves once the data picks a branch, which is the ordinary
   * case and stays untouched.
   */
  it('resolves a wrapper whose branch the data selects', async () => {
    const { pointers, codes } = await projectWith(
      { anyOf: [{ type: 'object' }, { type: 'string' }] },
      { a: 1 },
    )
    expect(pointers).toEqual([''])
    expect(codes).toEqual([])
  })

  /**
   * `allOf` never selects: it applies every branch at once, and a branch's
   * `properties` do not make the wrapper an object any more than they would
   * inside `not`. Unchanged behaviour, now with a diagnostic naming it, which
   * is the point: an author who wrote this got no form and no explanation.
   */
  it('reports an allOf wrapper carrying only branch properties', async () => {
    const { pointers, codes } = await projectWith(
      { allOf: [{ properties: { a: { type: 'string' } } }] },
      { a: 'x' },
    )
    expect(pointers).toEqual([])
    expect(codes).toEqual([':unresolved-projection-shape'])
  })

  /**
   * Data-dependent, and correctly so: `project` takes data, and "no branch
   * applies to this value" is a true statement about what can be rendered
   * right now. Declaring `type` on the wrapper is what resolves it, which is
   * what the message says.
   */
  it('reports a wrapper whose branches the data does not select', async () => {
    const { pointers, codes } = await projectWith(
      { anyOf: [{ type: 'object', required: ['a'] }, { type: 'string' }] },
      42,
    )
    expect(pointers).toEqual([])
    expect(codes).toEqual([':unresolved-projection-shape'])
  })

  it('stops reporting the same wrapper once the data selects a branch', async () => {
    const schema = { anyOf: [{ type: 'object', required: ['a'] }, { type: 'string' }] }
    expect((await projectWith(schema, 42)).codes).toEqual([':unresolved-projection-shape'])
    expect((await projectWith(schema, { a: 1 })).codes).toEqual([])
  })

  /**
   * A wrapper that does declare a type keeps working exactly as before, and
   * the branch candidates still appear for the inactive-node contract.
   */
  it('leaves a typed wrapper alone', async () => {
    const adapter = await createJsonSchemaAdapter(
      {
        type: 'object',
        properties: { kind: { type: 'string' } },
        oneOf: [
          { properties: { kind: { const: 'a' }, onlyA: { type: 'string' } } },
          { properties: { kind: { const: 'b' }, onlyB: { type: 'string' } } },
        ],
      },
      { defaultDialect: 'draft-07' },
    )
    const projection = adapter.project({ kind: 'a' })
    expect(projection.nodes.get('/onlyA' as JsonPointer)?.active).toBe(true)
    expect(projection.nodes.get('/onlyB' as JsonPointer)?.active).toBe(false)
    expect(projection.diagnostics).toEqual([])
  })
})

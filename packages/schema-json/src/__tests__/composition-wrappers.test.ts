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
   * The line between the two channels, and the reason this is silent.
   *
   * A projection diagnostic describes a schema this adapter cannot turn into a
   * shape. A wrapper whose branches the current value happens not to match is
   * not that: the same schema projects fine for a value that does match one,
   * so nothing is wrong with the schema and the only thing wrong is the value.
   * Validation already owns that, and reports it.
   *
   * An earlier version of this file asserted the opposite and called it
   * "correctly so", on the grounds that `project` takes data. That reasoning
   * was wrong in a way worth recording: a form's data is in this state for
   * most of the time someone is filling it in, so the diagnostic would appear
   * and disappear on each keystroke, and a channel that flaps is a channel a
   * caller learns to ignore.
   */
  it('stays silent when the data merely matches no branch', async () => {
    const { pointers, codes } = await projectWith(
      { anyOf: [{ type: 'object', required: ['a'] }, { type: 'string' }] },
      42,
    )
    expect(pointers).toEqual([])
    expect(codes).toEqual([])
  })

  it('reports nothing for the same wrapper in either data state', async () => {
    const schema = { anyOf: [{ type: 'object', required: ['a'] }, { type: 'string' }] }
    expect((await projectWith(schema, 42)).codes).toEqual([])
    expect((await projectWith(schema, { a: 1 })).codes).toEqual([])
  })

  /**
   * The contrast that shows the rule is about the schema and not the data: an
   * `allOf` wrapper has no branch to select, so it is unprojectable whatever
   * the value is, and it reports in every data state.
   */
  it('reports an unprojectable wrapper in every data state', async () => {
    const schema = { allOf: [{ properties: { a: { type: 'string' } } }] }
    for (const data of [undefined, {}, { a: 'x' }, 42, null]) {
      expect((await projectWith(schema, data)).codes, JSON.stringify(data)).toEqual([
        ':unresolved-projection-shape',
      ])
    }
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

/**
 * The distinction the first version of this got wrong: entering a composition
 * says nothing on its own about whose fault the missing shape is.
 *
 * A branch can be selected and still supply no shape, because scalar shapes
 * are deliberately not inferred. That schema is unprojectable by this adapter
 * whatever the value, so suppressing its diagnostic hid a real limitation
 * behind a rule meant for transient data.
 */
describe('whose fault a missing shape is', () => {
  it('reports branches that match but describe no renderable shape', async () => {
    // Both branches match "abc", and neither says anything this adapter can
    // draw. Nothing is wrong with the value; the schema is the problem.
    const { pointers, codes } = await projectWith(
      { anyOf: [{ minLength: 1 }, { pattern: '^a' }] },
      'abc',
    )
    expect(pointers).toEqual([])
    expect(codes).toEqual([':unresolved-projection-shape'])
  })

  it('reports an enum-only composition, whose members match', async () => {
    const { codes } = await projectWith({ anyOf: [{ enum: ['a'] }, { enum: ['b'] }] }, 'a')
    expect(codes).toEqual([':unresolved-projection-shape'])
  })

  it('reports a composition with no renderable branch even when nothing matches', async () => {
    // Nothing matches, but there was never a branch worth rendering either, so
    // this is a limitation rather than a passing data state.
    const { codes } = await projectWith({ anyOf: [{ minLength: 5 }] }, 'ab')
    expect(codes).toEqual([':unresolved-projection-shape'])
  })

  it('reports the selected branch even when a sibling branch is renderable', async () => {
    // The object branch could render; the string branch is the one the value
    // selected, and it cannot. The renderable sibling does not excuse it.
    const { codes } = await projectWith({ anyOf: [{ type: 'object' }, { minLength: 1 }] }, 'abc')
    expect(codes).toEqual([':unresolved-projection-shape'])
  })

  it('stays silent only when a renderable branch exists and none matched', async () => {
    const schema = { anyOf: [{ type: 'object', required: ['a'] }, { type: 'string' }] }
    expect((await projectWith(schema, 42)).codes).toEqual([])
    expect((await projectWith(schema, {})).codes).toEqual([])
  })
})

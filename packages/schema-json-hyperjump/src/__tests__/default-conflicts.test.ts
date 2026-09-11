import { describe, it, expect } from 'vitest'
import { collectDefaultConflicts } from '../default-conflicts.js'

/**
 * The traversal's own bound, tested here rather than in the shared conformance
 * suite because `@texaryn/schema-json` cannot host the fixture: an `allOf`
 * anywhere inside a recursive `$ref` cycle overflows json-schema-library
 * 11.6.2 while it compiles, before any projection runs. Measured on `main`
 * with the adapter's conflict detection reverted, so it is not this change's.
 */
describe('collectDefaultConflicts, recursive $ref', () => {
  const schema = {
    type: 'object',
    properties: { child: { $ref: '#' } },
    allOf: [
      { properties: { x: { type: 'string', default: 'a' } } },
      { properties: { x: { type: 'string', default: 'b' } } },
    ],
  }

  // One depth per level the data provides, and one more, which is `staticWalk`'s
  // boundary rather than a separate rule: a recursive `$ref` is projected one
  // level past the data so its direct properties render as unfilled fields.
  // Those nodes exist, so their omitted defaults have to be reported too.
  it('reports one conflict per depth the projection reaches', () => {
    const conflicts = collectDefaultConflicts(schema, { child: { child: {} } })
    expect([...conflicts.keys()].sort()).toEqual([
      '/child/child/child/x',
      '/child/child/x',
      '/child/x',
      '/x',
    ])
  })

  // The guard that makes the case above terminate: past the instance boundary
  // the instance pointer keeps growing, so pairing it with the schema pointer
  // would never repeat a key and the walk would not return.
  it('stops one level past the data rather than descending forever', () => {
    const conflicts = collectDefaultConflicts(schema, {})
    expect([...conflicts.keys()]).toEqual(['/x', '/child/x'])
  })

  it('reports the schema positions that disagree, not the reference to them', () => {
    const conflicts = collectDefaultConflicts(schema, { child: {} })
    expect(conflicts.get('/child/x')).toEqual([
      '/allOf/0/properties/x',
      '/allOf/1/properties/x',
    ])
  })
})

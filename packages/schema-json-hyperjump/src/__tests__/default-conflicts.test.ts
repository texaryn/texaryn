import { describe, it, expect } from 'vitest'
import { createHyperjumpAdapter } from '../index.js'
import { collectDefaultConflicts } from '../default-conflicts.js'

describe('collectDefaultConflicts, recursive $ref', () => {
  const schema = {
    type: 'object',
    properties: { child: { $ref: '#' } },
    allOf: [
      { properties: { x: { type: 'string', default: 'a' } } },
      { properties: { x: { type: 'string', default: 'b' } } },
    ],
  }
  const collect = async (data: unknown) =>
    collectDefaultConflicts(schema, data, undefined, (await createHyperjumpAdapter(schema)).project(data).nodes)

  // One depth per level the data provides, and one more, which is `staticWalk`'s
  // boundary rather than a separate rule: a recursive `$ref` is projected one
  // level past the data so its direct properties render as unfilled fields.
  // Those nodes exist, so their omitted defaults have to be reported too.
  it('reports one conflict per depth the projection reaches', async () => {
    const conflicts = await collect({ child: { child: {} } })
    expect([...conflicts.keys()].sort()).toEqual([
      '/child/child/child/x',
      '/child/child/x',
      '/child/x',
      '/x',
    ])
  })

  it('stops one level past the data rather than descending forever', async () => {
    const conflicts = await collect({})
    expect([...conflicts.keys()]).toEqual(['/x', '/child/x'])
  })

  it('reports the schema positions that disagree, not the reference to them', async () => {
    const conflicts = await collect({ child: {} })
    expect(conflicts.get('/child/x')).toEqual([
      '/allOf/0/properties/x',
      '/allOf/1/properties/x',
    ])
  })
})

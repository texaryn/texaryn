import { describe, it, expect } from 'vitest'
import { viewFromProjection } from './view.js'
import type { JsonPointer } from '../types.js'
import type { AnnotationSet, NodeProjection, SchemaProjection } from '../schema/port.js'

function node(partial: Partial<NodeProjection> & { annotations?: AnnotationSet }): NodeProjection {
  return {
    type: 'string',
    constraints: {},
    active: true,
    annotations: {},
    ...partial,
  }
}

function projection(
  nodes: Record<string, NodeProjection>,
  diagnostics?: SchemaProjection['diagnostics'],
): SchemaProjection {
  return {
    nodes: new Map(Object.entries(nodes) as [JsonPointer, NodeProjection][]),
    diagnostics,
  }
}

describe('what counts as reachable', () => {
  it('takes an active node', () => {
    const view = viewFromProjection(projection({ '/a': node({ active: true }) }))
    expect([...view.reachable]).toEqual(['/a'])
  })

  /**
   * Exposure, not activity, which is rule 5 as #120 settled it. A `oneOf` branch
   * the data identifies but has not yet satisfied does not apply, so `active` is
   * false, and the projection exposes it so the user can finish it. Filling only
   * the active locations would leave that branch's own defaults unwritten, which
   * is the defect ADR-003 exists to remove, one branch deeper.
   */
  it('takes a provisionally exposed node', () => {
    const view = viewFromProjection(
      projection({ '/a': node({ active: false, provisional: true }) }),
    )
    expect([...view.reachable]).toEqual(['/a'])
  })

  it('leaves out a node that is neither', () => {
    const view = viewFromProjection(projection({ '/a': node({ active: false }) }))
    expect([...view.reachable]).toEqual([])
  })
})

describe('what counts as a declaration', () => {
  it('takes the annotation where the schema declares one', () => {
    const view = viewFromProjection(
      projection({ '/a': node({ annotations: { default: 'seed' } }) }),
    )
    expect(view.defaults.get('/a' as JsonPointer)).toBe('seed')
  })

  it('declares nothing where the annotation is absent', () => {
    const view = viewFromProjection(projection({ '/a': node({ annotations: { title: 'A' } }) }))
    expect(view.defaults.has('/a' as JsonPointer)).toBe(false)
  })

  // Presence rather than truthiness, the same distinction the pass makes about
  // the data. A truthiness test would drop every one of these.
  it.each([
    ['false', false],
    ['zero', 0],
    ['an empty string', ''],
    ['null', null],
  ])('takes a declared %s', (_label, value) => {
    const view = viewFromProjection(
      projection({ '/a': node({ annotations: { default: value } }) }),
    )
    expect(view.defaults.has('/a' as JsonPointer)).toBe(true)
    expect(view.defaults.get('/a' as JsonPointer)).toBe(value)
  })

  it('does not read a declaration off an unreachable node', () => {
    const view = viewFromProjection(
      projection({ '/a': node({ active: false, annotations: { default: 'seed' } }) }),
    )
    expect(view.defaults.has('/a' as JsonPointer)).toBe(false)
  })
})

describe('what counts as a conflict', () => {
  it('takes the node own conflict and the positions it names', () => {
    const view = viewFromProjection(
      projection({
        '/a': node({ defaultConflict: ['/allOf/0/properties/a', '/properties/a'] }),
      }),
    )
    expect(view.conflicts.get('/a' as JsonPointer)).toEqual([
      '/allOf/0/properties/a',
      '/properties/a',
    ])
  })

  /**
   * The node rather than `projection.diagnostics`, which is #142's answer.
   * Diagnostics describe the schema, so they carry only the disagreements that
   * hold whatever the instance is; a `oneOf` branch competing with the base
   * applies exactly while its branch is selected, and the pass has to see that
   * one too. An adapter puts every conflict on the node, so reading the one
   * channel loses nothing.
   */
  it('does not read the conflict off the diagnostics channel', () => {
    const view = viewFromProjection(
      projection({ '/a': node({}) }, [
        {
          pointer: '/a' as JsonPointer,
          code: 'ambiguous-default',
          message: 'two disagree',
          sources: ['/allOf/0/properties/a', '/properties/a'],
        },
      ]),
    )
    expect(view.conflicts.size).toBe(0)
  })

  it('reads no conflicts from an adapter that reports none', () => {
    expect(viewFromProjection(projection({ '/a': node({}) })).conflicts.size).toBe(0)
  })

  // The same rule the declarations follow: an unreachable node states nothing
  // the pass acts on, and reporting a conflict there would explain a location
  // it was never going to fill.
  it('does not read a conflict off an unreachable node', () => {
    const view = viewFromProjection(
      projection({ '/a': node({ active: false, defaultConflict: ['/properties/a'] }) }),
    )
    expect(view.conflicts.size).toBe(0)
  })
})

import { describe, it, expect } from 'vitest'
import { initializeDefaults } from './kernel.js'
import type { DefaultCandidate, InitializationView, Location, ProjectView } from './kernel.js'

function one(value: unknown, sourceId = 's'): DefaultCandidate[] {
  return [{ value, sourceId }]
}

/** Everything declared is reachable, whatever the data says. */
function fixed(declarations: Record<string, DefaultCandidate[]>): ProjectView {
  const entries = Object.entries(declarations) as [Location, DefaultCandidate[]][]
  const view: InitializationView = {
    reachable: new Set(entries.map(([location]) => location)),
    defaults: new Map(entries),
  }
  return () => view
}

function initialized(result: ReturnType<typeof initializeDefaults>) {
  if (result.outcome !== 'initialized') throw new Error(`expected initialized, got ${result.outcome}`)
  return result
}

describe('what counts as absent', () => {
  it('fills a location that is not there', () => {
    const result = initialized(initializeDefaults({}, fixed({ '/replicas': one(3) })))
    expect(result.data).toEqual({ replicas: 3 })
  })

  it.each([
    ['false', { flag: false }],
    ['zero', { flag: 0 }],
    ['an empty string', { flag: '' }],
    ['null', { flag: null }],
  ])('never defaults over %s', (_label, data) => {
    const result = initialized(initializeDefaults(data, fixed({ '/flag': one('replaced') })))
    expect(result.data).toEqual(data)
  })

  /**
   * The case the whole third reading of the reference turned on. A key present
   * holding `undefined` is a value, and `getAtPointer` cannot tell it from a
   * missing key, which is why this pass does not use it.
   */
  it('never defaults over a key present holding undefined', () => {
    const result = initialized(
      initializeDefaults({ flag: undefined }, fixed({ '/flag': one('replaced') })),
    )
    const data = result.data as Record<string, unknown>
    expect('flag' in data).toBe(true)
    expect(data.flag).toBeUndefined()
  })

  it('creates the parent object a child default needs', () => {
    const result = initialized(initializeDefaults({}, fixed({ '/owner/team': one('platform') })))
    expect(result.data).toEqual({ owner: { team: 'platform' } })
  })

  /**
   * Refusing to write through a scalar is the guard issue #124 records at the
   * root: `setAtPointer` would spread `'plain'` into character keys.
   */
  it('refuses to write through an ancestor that cannot hold a property', () => {
    const result = initialized(
      initializeDefaults({ owner: 'plain' }, fixed({ '/owner/team': one('platform') })),
    )
    expect(result.data).toEqual({ owner: 'plain' })
  })

  it('creates every parent a deeply nested child default needs', () => {
    const result = initialized(initializeDefaults({}, fixed({ '/a/b/c': one(1) })))
    expect(result.data).toEqual({ a: { b: { c: 1 } } })
  })

  it('refuses to write through a scalar several levels up', () => {
    const result = initialized(
      initializeDefaults({ a: 'plain' }, fixed({ '/a/b/c': one(1) })),
    )
    expect(result.data).toEqual({ a: 'plain' })
  })

  /**
   * Creating a missing level whose child is an array index would mean choosing
   * between `{}` and `[]`, and ADR-003 leaves array rows to whatever #120 and
   * identity keys settle. The pass refuses rather than guessing.
   */
  it('refuses to create a missing level that would have to be an array', () => {
    const result = initialized(initializeDefaults({}, fixed({ '/rows/0/name': one('x') })))
    expect(result.data).toEqual({})
  })

  it('fills into an array the caller already supplied', () => {
    const result = initialized(
      initializeDefaults({ rows: [{}] }, fixed({ '/rows/0/name': one('x') })),
    )
    expect(result.data).toEqual({ rows: [{ name: 'x' }] })
  })

  it('fills a root default only when the root is absent', () => {
    expect(initialized(initializeDefaults(undefined, fixed({ '': one({ a: 1 }) }))).data).toEqual({
      a: 1,
    })
    expect(initialized(initializeDefaults({}, fixed({ '': one({ a: 1 }) }))).data).toEqual({})
  })

  it('leaves the object the caller passed untouched', () => {
    const data = { keep: 1 }
    initialized(initializeDefaults(data, fixed({ '/added': one(2) })))
    expect(data).toEqual({ keep: 1 })
  })
})

describe('a container default is materialised whole', () => {
  it('does not let a property declaration override a key the container supplied', () => {
    const result = initialized(
      initializeDefaults(
        {},
        fixed({ '/owner': one({ team: 'a', extra: 'x' }), '/owner/team': one('b') }),
      ),
    )
    expect(result.data).toEqual({ owner: { team: 'a', extra: 'x' } })
  })

  it('still applies a property declaration for a key the container left absent', () => {
    const result = initialized(
      initializeDefaults({}, fixed({ '/owner': one({ extra: 'x' }), '/owner/team': one('b') })),
    )
    expect(result.data).toEqual({ owner: { extra: 'x', team: 'b' } })
    expect(result.passes).toBe(3)
  })

  it('shadows a descendant whichever order the locations arrive in', () => {
    const declarations: Record<string, DefaultCandidate[]> = {
      '/owner/team': one('b'),
      '/owner': one({ team: 'a' }),
    }
    const result = initialized(initializeDefaults({}, fixed(declarations)))
    expect(result.data).toEqual({ owner: { team: 'a' } })
  })
})

describe('declarations that agree and declarations that do not', () => {
  it('uses several declarations that agree', () => {
    const result = initialized(
      initializeDefaults(
        {},
        fixed({
          '/x': [
            { value: { deep: [1, 2] }, sourceId: 'first' },
            { value: { deep: [1, 2] }, sourceId: 'second' },
          ],
        }),
      ),
    )
    expect(result.data).toEqual({ x: { deep: [1, 2] } })
    expect(result.conflicts).toEqual([])
  })

  it('leaves a location absent when declarations disagree, and names them', () => {
    const result = initialized(
      initializeDefaults(
        {},
        fixed({
          '/x': [
            { value: 'a', sourceId: 'first' },
            { value: 'b', sourceId: 'second' },
          ],
        }),
      ),
    )
    expect(result.data).toEqual({})
    expect(result.conflicts).toEqual([{ location: '/x', sourceIds: ['first', 'second'] }])
  })

  /**
   * The barrier. Descendant shadowing keys on surviving writes and a conflict
   * removes one, so without this the parent-creation rule would create `/owner`
   * to hold `/owner/region` and materialise the location the conflict said to
   * leave absent.
   */
  it('does not create a conflicted location to hold a descendant default', () => {
    const result = initialized(
      initializeDefaults(
        {},
        fixed({
          '/owner': [
            { value: { team: 'a' }, sourceId: 'first' },
            { value: { team: 'b' }, sourceId: 'second' },
          ],
          '/owner/region': one('eu'),
          '/name': one('unrelated'),
        }),
      ),
    )
    expect(result.data).toEqual({ name: 'unrelated' })
    expect(result.conflicts).toEqual([{ location: '/owner', sourceIds: ['first', 'second'] }])
  })

  it('fills beneath a conflicted location once the caller supplied it', () => {
    const result = initialized(
      initializeDefaults(
        { owner: {} },
        fixed({
          '/owner': [
            { value: { team: 'a' }, sourceId: 'first' },
            { value: { team: 'b' }, sourceId: 'second' },
          ],
          '/owner/region': one('eu'),
        }),
      ),
    )
    expect(result.data).toEqual({ owner: { region: 'eu' } })
    expect(result.conflicts).toEqual([])
  })
})

describe('more than one pass', () => {
  /**
   * `a` defaults to true, which reveals `b`, which defaults to true, which
   * reveals `c`. One pass after the unconditional defaults reaches `b` and not
   * `c`, which is why this is a fixpoint rather than a single pass.
   */
  const chained: ProjectView = (data) => {
    const d = (data ?? {}) as Record<string, unknown>
    const reachable = new Set<Location>(['/a' as Location])
    const defaults = new Map<Location, DefaultCandidate[]>([['/a' as Location, one(true)]])
    if (d.a === true) {
      reachable.add('/b' as Location)
      defaults.set('/b' as Location, one(true))
    }
    if (d.b === true) {
      reachable.add('/c' as Location)
      defaults.set('/c' as Location, one('x'))
    }
    return { reachable, defaults }
  }

  it('reaches a location revealed by a default two levels down', () => {
    const result = initialized(initializeDefaults({}, chained))
    expect(result.data).toEqual({ a: true, b: true, c: 'x' })
    expect(result.passes).toBe(4)
  })

  it('does not reach it in one pass', () => {
    const afterOnePass = initializeDefaults({}, chained, { maxPasses: 1 })
    expect(afterOnePass.outcome).toBe('budget-exhausted')
  })
})

describe('the budget is transactional', () => {
  /** A schema that keeps revealing one more location, as a recursive one can. */
  const endless: ProjectView = (data) => {
    const d = (data ?? {}) as Record<string, unknown>
    const next = Object.keys(d).length
    const location = `/n${next}` as Location
    return { reachable: new Set([location]), defaults: new Map([[location, one(next)]]) }
  }

  it('discards every write rather than returning data that depends on the budget', () => {
    const result = initializeDefaults({}, endless, { maxPasses: 4 })
    expect(result.outcome).toBe('budget-exhausted')
    if (result.outcome !== 'budget-exhausted') throw new Error('unreachable')
    expect(result.passes).toBe(4)
    expect(result).not.toHaveProperty('data')
  })

  it('reports the same outcome whatever the budget was, so the data cannot leak', () => {
    for (const maxPasses of [2, 4, 9]) {
      expect(initializeDefaults({}, endless, { maxPasses }).outcome).toBe('budget-exhausted')
    }
  })
})

describe('values are copied, and taken as declared', () => {
  it('gives two locations filled from one declaration no shared identity', () => {
    const shape = { team: 'x' }
    const result = initialized(
      initializeDefaults(
        {},
        fixed({ '/first': [{ value: shape, sourceId: 's' }], '/second': [{ value: shape, sourceId: 's' }] }),
      ),
    )
    const data = result.data as { first: Record<string, unknown>; second: Record<string, unknown> }
    expect(data.first).not.toBe(shape)
    expect(data.second).not.toBe(shape)
    expect(data.first).not.toBe(data.second)

    data.first.team = 'changed'
    expect(data.second.team).toBe('x')
    expect(shape.team).toBe('x')
  })

  it('copies nested arrays and objects rather than the top level alone', () => {
    const shape = { rows: [{ id: 1 }] }
    const result = initialized(initializeDefaults({}, fixed({ '/a': one(shape) })))
    const written = (result.data as { a: typeof shape }).a
    expect(written).toEqual(shape)
    expect(written.rows).not.toBe(shape.rows)
    expect(written.rows[0]).not.toBe(shape.rows[0])
  })

  /**
   * JSON Schema does not require a `default` to satisfy its own schema, and
   * initialization is not a second validator: the declared value goes in and
   * ordinary validation reports it.
   */
  it('inserts a declared value that does not match its own schema', () => {
    const result = initialized(initializeDefaults({}, fixed({ '/count': one('oops') })))
    expect(result.data).toEqual({ count: 'oops' })
  })
})

describe('nothing reachable, nothing declared', () => {
  it('returns the data unchanged in one pass', () => {
    const data = { a: 1 }
    const result = initialized(initializeDefaults(data, fixed({})))
    expect(result.data).toBe(data)
    expect(result.passes).toBe(1)
  })

  it('ignores a declared location that is not reachable', () => {
    const view: ProjectView = () => ({
      reachable: new Set<Location>(),
      defaults: new Map([['/hidden' as Location, one('x')]]),
    })
    expect(initialized(initializeDefaults({}, view)).data).toEqual({})
  })

  it('ignores a reachable location with an empty declaration list', () => {
    const view: ProjectView = () => ({
      reachable: new Set(['/x' as Location]),
      defaults: new Map([['/x' as Location, [] as DefaultCandidate[]]]),
    })
    expect(initialized(initializeDefaults({}, view)).data).toEqual({})
  })
})

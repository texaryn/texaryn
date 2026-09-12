import { describe, it, expect } from 'vitest'
import { initializeDefaults } from './kernel.js'
import type { InitializationView, Location, ProjectView } from './kernel.js'

/**
 * Everything named is reachable, whatever the data says.
 *
 * `conflicts` is a second argument rather than a value in the first, because
 * the two are what the port reports separately: a location has either a value
 * or a disagreement, never both, and a disagreement carries no value at all.
 */
function fixed(
  defaults: Record<string, unknown>,
  conflicts: Record<string, readonly string[]> = {},
): ProjectView {
  const view: InitializationView = {
    reachable: new Set([...Object.keys(defaults), ...Object.keys(conflicts)] as Location[]),
    defaults: new Map(Object.entries(defaults) as [Location, unknown][]),
    conflicts: new Map(Object.entries(conflicts) as [Location, readonly string[]][]),
  }
  return () => view
}

function initialized(result: ReturnType<typeof initializeDefaults>) {
  if (result.outcome !== 'initialized') throw new Error(`expected initialized, got ${result.outcome}`)
  return result
}

describe('what counts as absent', () => {
  it('fills a location that is not there', () => {
    const result = initialized(initializeDefaults({}, fixed({ '/replicas': 3 })))
    expect(result.data).toEqual({ replicas: 3 })
  })

  it.each([
    ['false', { flag: false }],
    ['zero', { flag: 0 }],
    ['an empty string', { flag: '' }],
    ['null', { flag: null }],
  ])('never defaults over %s', (_label, data) => {
    const result = initialized(initializeDefaults(data, fixed({ '/flag': 'replaced' })))
    expect(result.data).toEqual(data)
  })

  /**
   * The case the whole third reading of the reference turned on. A key present
   * holding `undefined` is a value, and `getAtPointer` cannot tell it from a
   * missing key, which is why this pass does not use it.
   */
  it('never defaults over a key present holding undefined', () => {
    const result = initialized(
      initializeDefaults({ flag: undefined }, fixed({ '/flag': 'replaced' })),
    )
    const data = result.data as Record<string, unknown>
    expect('flag' in data).toBe(true)
    expect(data.flag).toBeUndefined()
  })

  it('creates the parent object a child default needs', () => {
    const result = initialized(initializeDefaults({}, fixed({ '/owner/team': 'platform' })))
    expect(result.data).toEqual({ owner: { team: 'platform' } })
  })

  /**
   * Refusing to write through a scalar is the guard issue #124 records at the
   * root: `setAtPointer` would spread `'plain'` into character keys.
   */
  it('refuses to write through an ancestor that cannot hold a property, and says so', () => {
    const result = initialized(
      initializeDefaults({ owner: 'plain' }, fixed({ '/owner/team': 'platform' })),
    )
    expect(result.data).toEqual({ owner: 'plain' })
    expect(result.refusals).toEqual([
      { location: '/owner/team', reason: 'non-container-ancestor' },
    ])
  })

  it('creates every parent a deeply nested child default needs', () => {
    const result = initialized(initializeDefaults({}, fixed({ '/a/b/c': 1 })))
    expect(result.data).toEqual({ a: { b: { c: 1 } } })
  })

  it('refuses to write through a scalar several levels up', () => {
    const result = initialized(initializeDefaults({ a: 'plain' }, fixed({ '/a/b/c': 1 })))
    expect(result.data).toEqual({ a: 'plain' })
    expect(result.refusals).toEqual([{ location: '/a/b/c', reason: 'non-container-ancestor' }])
  })

  /**
   * Creating a missing level whose child is an array index would mean choosing
   * between `{}` and `[]`, and ADR-003 leaves array rows to whatever #120 and
   * identity keys settle. The pass refuses rather than guessing.
   */
  it('refuses to create a missing level whose kind the pointer does not give, and says so', () => {
    const result = initialized(initializeDefaults({}, fixed({ '/rows/0/name': 'x' })))
    expect(result.data).toEqual({})
    expect(result.refusals).toEqual([
      { location: '/rows/0/name', reason: 'unknown-container-kind' },
    ])
  })

  it('fills into an array the caller already supplied', () => {
    const result = initialized(
      initializeDefaults({ rows: [{}] }, fixed({ '/rows/0/name': 'x' })),
    )
    expect(result.data).toEqual({ rows: [{ name: 'x' }] })
  })

  it('fills a root default only when the root is absent', () => {
    expect(initialized(initializeDefaults(undefined, fixed({ '': { a: 1 } }))).data).toEqual({
      a: 1,
    })
    expect(initialized(initializeDefaults({}, fixed({ '': { a: 1 } }))).data).toEqual({})
  })

  it('leaves the object the caller passed untouched', () => {
    const data = { keep: 1 }
    initialized(initializeDefaults(data, fixed({ '/added': 2 })))
    expect(data).toEqual({ keep: 1 })
  })
})

describe('pointer segments that need escaping', () => {
  /**
   * `parsePointer` decodes `~1` to `/`, so anything that rebuilds a pointer by
   * joining segments with `/` turns one property into two. Everything internal
   * travels as segments for this reason.
   */
  it('treats a property whose name contains a slash as one level', () => {
    const result = initialized(initializeDefaults({}, fixed({ '/a/b~1c': 1 })))
    expect(result.data).toEqual({ a: { 'b/c': 1 } })
  })

  it('treats a property whose name contains a tilde as one level', () => {
    const result = initialized(initializeDefaults({}, fixed({ '/a/b~0c': 1 })))
    expect(result.data).toEqual({ a: { 'b~c': 1 } })
  })

  it('shadows a descendant of a container whose name needs escaping', () => {
    const result = initialized(
      initializeDefaults(
        {},
        fixed({ '/a~1b': { team: 'whole' }, '/a~1b/team': 'part' }),
      ),
    )
    expect(result.data).toEqual({ 'a/b': { team: 'whole' } })
  })

  it('barriers a descendant of a conflicted container whose name needs escaping', () => {
    const result = initialized(
      initializeDefaults(
        {},
        fixed({ '/a~1b/team': 'part' }, { '/a~1b': ['/first', '/second'] }),
      ),
    )
    expect(result.data).toEqual({})
    expect(result.conflicts).toEqual([{ location: '/a~1b', sources: ['/first', '/second'] }])
  })
})

describe('a container default is materialised whole', () => {
  it('does not let a property declaration override a key the container supplied', () => {
    const result = initialized(
      initializeDefaults(
        {},
        fixed({ '/owner': { team: 'a', extra: 'x' }, '/owner/team': 'b' }),
      ),
    )
    expect(result.data).toEqual({ owner: { team: 'a', extra: 'x' } })
  })

  it('still applies a property declaration for a key the container left absent', () => {
    const result = initialized(
      initializeDefaults({}, fixed({ '/owner': { extra: 'x' }, '/owner/team': 'b' })),
    )
    expect(result.data).toEqual({ owner: { extra: 'x', team: 'b' } })
    expect(result.passes).toBe(3)
  })

  it('shadows a descendant whichever order the locations arrive in', () => {
    const declarations: Record<string, unknown> = {
      '/owner/team': 'b',
      '/owner': { team: 'a' },
    }
    const result = initialized(initializeDefaults({}, fixed(declarations)))
    expect(result.data).toEqual({ owner: { team: 'a' } })
  })
})

/**
 * Whether declarations agree is not decided here any more. The port omits
 * `AnnotationSet.default` and reports `ambiguous-default` where they disagree,
 * which is where the rule belongs: only the adapter still has the declarations
 * before its evaluator merges them, and the two adapters do not merge alike, so
 * there is no value to compare here in the first place. Those rows now live in
 * `tests/conformance/default-conflict.suite.ts`.
 *
 * What stays is what a conflict does to this pass.
 */
describe('what a conflict does to the pass', () => {
  it('leaves a conflicted location absent, and names the positions that disagreed', () => {
    const result = initialized(
      initializeDefaults({}, fixed({}, { '/x': ['/allOf/0/properties/x', '/properties/x'] })),
    )
    expect(result.data).toEqual({})
    expect(result.conflicts).toEqual([
      { location: '/x', sources: ['/allOf/0/properties/x', '/properties/x'] },
    ])
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
        fixed(
          { '/owner/region': 'eu', '/name': 'unrelated' },
          { '/owner': ['/first', '/second'] },
        ),
      ),
    )
    expect(result.data).toEqual({ name: 'unrelated' })
    expect(result.conflicts).toEqual([{ location: '/owner', sources: ['/first', '/second'] }])
  })

  /**
   * The root is an ancestor of everything, so a conflict there has to stop the
   * pass reaching through it. Leaving the root out of the ancestor walk let any
   * child default defeat a root conflict and manufacture the root.
   */
  it('does not create a conflicted root to hold a descendant default', () => {
    const result = initialized(
      initializeDefaults(undefined, fixed({ '/x': 1 }, { '': ['/allOf/0', '/allOf/1'] })),
    )
    expect(result.data).toBeUndefined()
    expect(result.conflicts).toEqual([{ location: '', sources: ['/allOf/0', '/allOf/1'] }])
  })

  it('fills beneath a conflicted location once the caller supplied it', () => {
    const result = initialized(
      initializeDefaults(
        { owner: {} },
        fixed({ '/owner/region': 'eu' }, { '/owner': ['/first', '/second'] }),
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
    const defaults = new Map<Location, unknown>([['/a' as Location, true]])
    if (d.a === true) {
      reachable.add('/b' as Location)
      defaults.set('/b' as Location, true)
    }
    if (d.b === true) {
      reachable.add('/c' as Location)
      defaults.set('/c' as Location, 'x')
    }
    return { reachable, defaults, conflicts: new Map() }
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
    return {
      reachable: new Set([location]),
      defaults: new Map([[location, next]]),
      conflicts: new Map(),
    }
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
        fixed({ '/first': shape, '/second': shape }),
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
    const result = initialized(initializeDefaults({}, fixed({ '/a': shape })))
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
    const result = initialized(initializeDefaults({}, fixed({ '/count': 'oops' })))
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
      defaults: new Map([['/hidden' as Location, 'x']]),
      conflicts: new Map(),
    })
    expect(initialized(initializeDefaults({}, view)).data).toEqual({})
  })

  it('ignores a reachable location that declares nothing', () => {
    const view: ProjectView = () => ({
      reachable: new Set(['/x' as Location]),
      defaults: new Map(),
      conflicts: new Map(),
    })
    expect(initialized(initializeDefaults({}, view)).data).toEqual({})
  })

  // Whether a location declares a default is a question about the map's keys,
  // never about the value, which is the same distinction as absent versus
  // `null` one level up. A truthiness test here would silently drop every
  // declaration of `false`, `0` or `''`.
  it.each([
    ['false', false],
    ['zero', 0],
    ['an empty string', ''],
    ['null', null],
  ])('writes a declared %s', (_label, value) => {
    const result = initialized(initializeDefaults({}, fixed({ '/flag': value })))
    expect(result.data).toEqual({ flag: value })
  })
})

/**
 * A location the caller created without stating a value for it. The data holds
 * `null` there, because an array cannot hold a hole, and the pass has to read
 * past that to the absence it stands for.
 */
describe('a provisional location', () => {
  const provisional = { provisional: ['/rows/0' as Location] }

  it('reads as absent even though the data holds null', () => {
    const result = initialized(
      initializeDefaults({ rows: [null] }, fixed({ '/rows/0': { seeded: true } }), provisional),
    )
    expect(result.data).toEqual({ rows: [{ seeded: true }] })
  })

  // The `null` standing in for the row reads as a scalar ancestor otherwise, and
  // every one of the row's own properties is refused.
  it('is walked through as an absent level, not a scalar ancestor', () => {
    const result = initialized(
      initializeDefaults({ rows: [null] }, fixed({ '/rows/0/name': 'anon' }), provisional),
    )
    expect(result.data).toEqual({ rows: [{ name: 'anon' }] })
    expect(result.refusals).toEqual([])
  })

  it('leaves the placeholder where nothing is declared', () => {
    const result = initialized(
      initializeDefaults({ rows: [null] }, fixed({ '/elsewhere': 1 }), provisional),
    )
    expect(result.data).toEqual({ rows: [null], elsewhere: 1 })
  })

  /**
   * Consumed by the write, not recognised from the value. Held for the run, the
   * location reads as absent again on the next pass, the same default is written
   * again, and the budget decides the outcome. The declared value here is `null`,
   * which is exactly what stood in for the row, so a value-based rule cannot see
   * that anything happened.
   */
  it('stops being provisional once a declared null has been written', () => {
    const result = initializeDefaults({ rows: [null] }, fixed({ '/rows/0': null }), provisional)
    expect(result.outcome).toBe('initialized')
    expect(initialized(result).data).toEqual({ rows: [null] })
    expect(initialized(result).written).toEqual(['/rows/0'])
    expect(initialized(result).passes).toBe(2)
  })

  /**
   * At or beneath, not at. An object row is created by a write to one of its
   * properties, and a rule keyed on the row itself would leave it reading as
   * absent while it holds a real object, which a later declaration could
   * overwrite.
   */
  it('stops being provisional when a write lands beneath it', () => {
    let pass = 0
    const view: ProjectView = () => {
      pass += 1
      // `/rows/0` declares nothing on the first pass and something on the next,
      // so a rule keyed on the row itself would overwrite what pass 1 built.
      const defaults: Record<string, unknown> =
        pass === 1 ? { '/rows/0/name': 'anon' } : { '/rows/0': { replaced: true } }
      return {
        reachable: new Set(Object.keys(defaults) as Location[]),
        defaults: new Map(Object.entries(defaults)) as Map<Location, unknown>,
        conflicts: new Map(),
      }
    }
    const result = initialized(initializeDefaults({ rows: [null] }, view, provisional))
    expect(result.data).toEqual({ rows: [{ name: 'anon' }] })
  })
})

/**
 * What the run wrote, which the runtime needs and cannot work out afterwards. A
 * seeding between construction and the next `Reset` happens against a baseline
 * that is already fixed, so those locations are `modified`, and by the time the
 * runtime sees the data a seeded value looks like one that was always there.
 */
describe('what the run reports writing', () => {
  it('names each location it filled', () => {
    const result = initialized(initializeDefaults({}, fixed({ '/a': 1, '/b': 2 })))
    expect([...result.written].sort()).toEqual(['/a', '/b'])
  })

  it('names nothing when it wrote nothing', () => {
    const result = initialized(initializeDefaults({ a: 1 }, fixed({ '/a': 2 })))
    expect(result.written).toEqual([])
  })

  it('names a location a later pass reached, not only the first pass', () => {
    let seen = 0
    const view: ProjectView = () => {
      seen += 1
      const defaults = seen > 1 ? { '/first': 1, '/second': 2 } : { '/first': 1 }
      return {
        reachable: new Set(Object.keys(defaults) as Location[]),
        defaults: new Map(Object.entries(defaults)) as Map<Location, unknown>,
        conflicts: new Map(),
      }
    }
    const result = initialized(initializeDefaults({}, view))
    expect([...result.written].sort()).toEqual(['/first', '/second'])
  })

  // A container default is materialised whole, so its own declaration is the
  // only write and the descendant the next pass finds present is not named.
  it('does not name a location the container default filled', () => {
    const result = initialized(
      initializeDefaults({}, fixed({ '/owner': { team: 'a' }, '/owner/team': 'b' })),
    )
    expect(result.data).toEqual({ owner: { team: 'a' } })
    expect(result.written).toEqual(['/owner'])
  })
})

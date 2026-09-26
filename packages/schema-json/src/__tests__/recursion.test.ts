import { describe, it, expect } from 'vitest'
import { compileSchema, type JsonSchema, type SchemaNode } from 'json-schema-library'
import type { NodeProjection, SchemaProjection } from '@texaryn/core'
import { createFormRuntime } from '@texaryn/core'
import { createJsonSchemaAdapter } from '../index.js'
import { createAdapter } from '../adapter.js'
import { followRef, positionOf } from '../identity.js'
import { buildSchemaGraph, markPositions } from '../schema-graph.js'
import { metaschemas } from '../metaschemas/draft-07.js'

const S = { type: 'string' }
const on2020 = (schema: Record<string, unknown>) => ({ $schema: 'https://json-schema.org/draft/2020-12/schema', ...schema })

async function project(schema: Record<string, unknown>, data: unknown): Promise<SchemaProjection> {
  return (await createJsonSchemaAdapter(schema)).project(data)
}
const pointers = (p: SchemaProjection) => [...p.nodes.keys()].sort()
const withBoundaries = (p: SchemaProjection) =>
  Object.fromEntries([...p.nodes].filter(([, n]) => n.boundaries).map(([k, n]) => [k, n.boundaries]))
const flagged = (p: SchemaProjection) => [...p.nodes.values()].filter((n: NodeProjection) => n.recursiveExpansion).length
const expanded = (p: SchemaProjection) => [...p.nodes].filter(([, n]) => n.recursiveExpansion).map(([k]) => k).sort()

const tree = on2020({
  type: 'object',
  properties: { name: S, child: { $ref: '#/$defs/node' } },
  $defs: { node: { type: 'object', properties: { name: S, child: { $ref: '#/$defs/node' } } } },
})

describe('once past the data', () => {
  it('shows one empty level past the data', async () => {
    const p = await project(tree, {})
    expect(pointers(p)).toEqual(['', '/child', '/child/name', '/name'])
    expect(withBoundaries(p)).toEqual({ '/child': ['recursion'] })
    expect(p.nodes.get('/child/name' as never)?.recursiveExpansion).toBe(true)
    expect(p.nodes.get('/child' as never)?.recursiveExpansion).toBeUndefined()
  })

  it('moves the boundary with the data', async () => {
    const p = await project(tree, { child: {} })
    expect(pointers(p)).toEqual(['', '/child', '/child/child', '/child/child/name', '/child/name', '/name'])
    expect(withBoundaries(p)).toEqual({ '/child/child': ['recursion'] })
  })

  it('treats null as past the data', async () => {
    expect(pointers(await project(tree, { child: null }))).toEqual(pointers(await project(tree, {})))
  })

  it('stops mutual recursion before it repeats', async () => {
    const mutual = on2020({
      type: 'object',
      properties: { a: { $ref: '#/$defs/A' } },
      $defs: {
        A: { type: 'object', properties: { x: S, b: { $ref: '#/$defs/B' } } },
        B: { type: 'object', properties: { y: S, a: { $ref: '#/$defs/A' } } },
      },
    })
    const p = await project(mutual, {})
    expect(pointers(p)).toEqual(['', '/a', '/a/b', '/a/b/y', '/a/x'])
    expect(withBoundaries(p)).toEqual({ '/a': ['recursion'] })
  })

  it('lists no child without a node', async () => {
    const p = await project(tree, { child: { child: {} } })
    for (const node of p.nodes.values()) {
      for (const child of node.children ?? []) expect(p.nodes.has(child.pointer)).toBe(true)
    }
  })
})

describe('conditionals inside a referenced definition', () => {
  const dialects = {
    'draft-07': ['http://json-schema.org/draft-07/schema#', 'definitions'],
    '2020-12': ['https://json-schema.org/draft/2020-12/schema', '$defs'],
  } as const
  const wrappers = {
    'if/then': (ref: object) => ({ type: 'object', if: { type: 'object' }, then: ref }),
    'if/then/else': (ref: object) => ({ type: 'object', if: { required: ['x'] }, then: ref, else: { ...ref } }),
  }
  const chain = (dialect: keyof typeof dialects, wrap: (ref: object) => object) => {
    const [$schema, defs] = dialects[dialect]
    const level = (next: string) => ({ type: 'object', properties: { name: S, child: wrap({ $ref: `#/${defs}/${next}` }) } })
    return { $schema, ...level('N1'), [defs]: { N1: level('N2'), N2: level('N3'), N3: level('N4'), N4: { type: 'object', properties: { name: S } } } }
  }

  it.each(
    (['draft-07', '2020-12'] as const).flatMap((dialect) => Object.keys(wrappers).map((wrapper) => [wrapper, dialect] as const)),
  )('projects every level of an %s chain in %s, unbudgeted', async (wrapper, dialect) => {
    const p = await project(chain(dialect, wrappers[wrapper as keyof typeof wrappers]), {})
    expect(pointers(p)).toEqual([
      '', '/child', '/child/child', '/child/child/child', '/child/child/child/child', '/child/child/child/child/name',
      '/child/child/child/name', '/child/child/name', '/child/name', '/name',
    ])
    expect(withBoundaries(p)).toEqual({})
    expect(flagged(p)).toBe(0)
  })

  it.each(['draft-07', '2020-12'] as const)('keeps what a then declares below a member its if also declares, in %s', async (dialect) => {
    const [$schema, defs] = dialects[dialect]
    const deep = { type: 'object', properties: { r: { type: 'object', properties: { s: { type: 'object', properties: { t: S } } } } } }
    const p = await project({
      $schema,
      type: 'object',
      properties: { a: { $ref: `#/${defs}/A` } },
      [defs]: {
        A: {
          type: 'object',
          properties: {
            p: { type: 'object', properties: { q: { type: 'object' } }, if: { properties: { q: { type: 'object' } } }, then: { properties: { q: deep } } },
          },
        },
      },
    }, {})
    expect(pointers(p)).toEqual(['', '/a', '/a/p', '/a/p/q', '/a/p/q/r', '/a/p/q/r/s', '/a/p/q/r/s/t'])
    expect(withBoundaries(p)).toEqual({})
    expect(flagged(p)).toBe(0)
  })
})

describe('branches the specification never evaluates', () => {
  const dialects = [
    ['draft-07', 'http://json-schema.org/draft-07/schema#'],
    ['2020-12', 'https://json-schema.org/draft/2020-12/schema'],
  ] as const
  const deep = { type: 'object', properties: { r: { type: 'object', properties: { s: { type: 'object', properties: { t: S } } } } } }
  const forms = [
    ['a then under if: false', { if: false, then: { properties: { q: deep } } }, 'then'],
    ['a then without if', { then: { properties: { q: deep } } }, 'then'],
    ['an else under if: true', { if: true, else: { properties: { q: deep } } }, 'else'],
    ['an else without if', { else: { properties: { q: deep } } }, 'else'],
  ] as const
  const cases = dialects.flatMap(([dialect, $schema]) => forms.map(([label, form, branch]) => [label, dialect, $schema, form, branch] as const))

  it.each(dialects.flatMap(([dialect, $schema]) => [
    [{ then: S }, dialect, $schema],
    [{ if: false, then: S }, dialect, $schema],
    [{ if: true, else: S }, dialect, $schema],
  ] as const))('accepts 1 against %j in %s, as the library does', async (schema, _dialect, $schema) => {
    expect((await (await createJsonSchemaAdapter({ $schema, ...schema })).validate(1)).valid).toBe(true)
  })

  const on2019 = 'https://json-schema.org/draft/2019-09/schema'
  const resolvesAsMain = async (schema: Record<string, unknown>) => {
    const adapter = await createJsonSchemaAdapter(schema)
    expect(await adapter.validate({ r: 'x' })).toEqual(expect.objectContaining({ valid: true, errors: [] }))
    const invalid = await adapter.validate({ r: 5 })
    expect(invalid.valid).toBe(false)
    expect(invalid.errors.map((e) => [e.instancePointer, e.keyword])).toEqual([['/r', 'type']])
  }

  it.each([
    ...dialects.flatMap(([dialect, $schema]) => [
      ['#/properties/p/then#', 'p', dialect, $schema],
      ['#/properties/application/json/then', 'application/json', dialect, $schema],
    ] as const),
    ['#/x#/properties/p/then', 'p', '2019-09', on2019],
  ] as const)('resolves %s into a branch under %s as main does, in %s', async ($ref, key, _dialect, $schema) => {
    await resolvesAsMain({ $schema, type: 'object', properties: { [key]: { type: 'object', then: S }, r: { $ref } } })
  })

  const compiledFields = [
    ['#/properties/a/prefixItems/0/then', 'array-form items', { type: 'array', items: [{ then: S }] }, ['draft-07', '2019-09']],
    ['#/properties/a/items/then', 'additionalItems', { type: 'array', items: [{}], additionalItems: { then: S } }, ['draft-07', '2019-09']],
    ['#/properties/a/dependentSchemas/w/then', 'dependencies', { type: 'object', dependencies: { w: { then: S } } }, ['draft-07', '2019-09', '2020-12']],
  ] as const
  const uris = { 'draft-07': dialects[0][1], '2019-09': on2019, '2020-12': dialects[1][1] }
  it.each(compiledFields.flatMap(([$ref, label, holder, names]) => names.map((dialect) => [$ref, label, dialect, holder] as const)))(
    'resolves %s into a branch under %s with a root $id as main does, in %s',
    async ($ref, _label, dialect, holder) => {
      await resolvesAsMain({ $schema: uris[dialect], $id: 'https://x.test/root', type: 'object', properties: { a: holder, r: { $ref } } })
    },
  )

  const holder = { type: 'object', then: S }
  const mixed = [
    [
      'an escaped $defs name and a raw property name',
      { type: 'object', $defs: { 'a/b': { type: 'object', properties: { 'c/d': holder } } }, properties: { r: { $ref: '#/$defs/a~1b/properties/c/d/then' } } },
    ],
    [
      '%2F in one segment and ~1 in another',
      { type: 'object', properties: { 'a/b': { type: 'object', properties: { 'c/d': holder } }, r: { $ref: '#/properties/a%2Fb/properties/c~1d/then' } } },
    ],
  ] as const
  it.each(dialects.flatMap(([dialect, $schema]) => mixed.map(([label, schema]) => [label, dialect, $schema, schema] as const)))(
    'resolves a reference that mixes spellings, %s, as main does, in %s',
    async (_label, _dialect, $schema, schema) => {
      await resolvesAsMain({ $schema, ...schema })
    },
  )

  it.each(cases)('projects nothing from %s in %s', async (_label, _dialect, $schema, form) => {
    const p = await project({ $schema, type: 'object', properties: { p: { type: 'object', ...form } } }, {})
    expect(pointers(p)).toEqual(['', '/p'])
    expect(withBoundaries(p)).toEqual({})
    expect(flagged(p)).toBe(0)
  })

  it.each(cases)('projects %s that a reference points into as main does, in %s', async (_label, _dialect, $schema, form, branch) => {
    const p = await project({
      $schema,
      type: 'object',
      properties: { p: { type: 'object', ...form }, r: { $ref: `#/properties/p/${branch}` } },
    }, {})
    expect(pointers(p)).toEqual([
      '', '/p', '/p/q', '/p/q/r', '/p/q/r/s', '/p/q/r/s/t', '/r', '/r/q', '/r/q/r', '/r/q/r/s', '/r/q/r/s/t',
    ])
    expect(p.nodes.get('/p/q' as never)?.active).toBe(false)
    expect(withBoundaries(p)).toEqual({})
    expect(flagged(p)).toBe(0)
  })

  const outline = (p: SchemaProjection) => [
    ...[...p.nodes.keys()].sort().map((key) => {
      const n = p.nodes.get(key)!
      return `${key}${n.active ? '' : '(i)'}${n.recursiveExpansion ? '(x)' : ''}${n.boundaries ? `[${n.boundaries.join()}]` : ''}`
    }),
    ...(p.diagnostics ?? []).map((d) => `${d.code}@${d.pointer}`),
  ]
  const inPlace = [
    ['a then under if: false', (ref: string) => ({ if: false, then: { $ref: ref } }), 'then'],
    ['an else under if: true', (ref: string) => ({ if: true, else: { $ref: ref } }), 'else'],
    ['a then without if', (ref: string) => ({ then: { $ref: ref } }), 'then'],
    ['an else without if', (ref: string) => ({ else: { $ref: ref } }), 'else'],
  ] as const
  const property = ['', '/p', '/p/a', '/r', '/r/a']
  type Shape = readonly [string, Record<string, unknown>, readonly (readonly [unknown, readonly string[]])[]]
  const selfApplying: readonly Shape[] = [
    ...inPlace.flatMap(([label, form, branch]): Shape[] => [
      [`${label} that applies the root`, { type: 'object', ...form('#'), properties: { a: S, x: { $ref: `#/${branch}` } } }, [
        [{}, ['', '/a', '/x[recursion]', '/x/a(x)']],
        [{ x: {} }, ['', '/a', '/x', '/x/a', '/x/x[recursion]', '/x/x/a(x)']],
      ]],
      [
        `${label} that applies its parent property`,
        { type: 'object', properties: { p: { type: 'object', properties: { a: S }, ...form('#/properties/p') }, r: { $ref: `#/properties/p/${branch}` } } },
        [[{}, property], [{ p: {} }, property], [{ r: {} }, property]],
      ],
    ]),
    ['a then under if: false that applies the root, with nothing beside it', { type: 'object', if: false, then: { $ref: '#' }, properties: { x: { $ref: '#/then' } } }, [
      [{}, ['', '/x[recursion]']],
      [{ x: {} }, ['', '/x', '/x/x[recursion]']],
    ]],
    [
      'a then without if whose allOf applies its parent property',
      { type: 'object', properties: { p: { type: 'object', properties: { a: S }, then: { allOf: [{ $ref: '#/properties/p' }] } }, r: { $ref: '#/properties/p/then' } } },
      [{}, { p: {} }, { r: {} }].map((data) => [data, ['', '/p', '/p/a', 'unresolved-projection-shape@/r']]),
    ],
    [
      'a then under if: false whose member refers to its parent property',
      { type: 'object', properties: { p: { type: 'object', properties: { a: S }, if: false, then: { properties: { c: { $ref: '#/properties/p' } } } }, r: { $ref: '#/properties/p/then' } } },
      [{}, { p: {} }, { r: {} }, { p: { c: {} } }].map((data) => [data, ['', '/p', '/p/a', '/p/c(i)', '/p/c/a(i)', '/r', '/r/c', '/r/c/a']]),
    ],
    ['a then without if in an x-defs container', { type: 'object', 'x-defs': { node: { type: 'object', then: { $ref: '#/x-defs/node' }, properties: { v: S } } }, properties: { r: { $ref: '#/x-defs/node' } } }, [[{}, ['', '/r', '/r/v']]]],
    ['a branch kept by an unused $anchor', { type: 'object', if: false, then: { $anchor: 'unused', $ref: '#' }, properties: { v: S } }, [[{}, ['', '/v']]]],
    ['a branch kept by an unused $id', { type: 'object', if: false, then: { $id: 'http://x.test/unused', $ref: '#' }, properties: { v: S } }, [[{}, ['', '/v']]]],
    ['a branch kept by an $id inside default', { type: 'object', if: false, then: { default: { $id: 'record-1' }, $ref: '#' }, properties: { v: S } }, [[{}, ['', '/v']]]],
  ]
  it.each(dialects.flatMap(([dialect, $schema]) => selfApplying.map(([label, schema, states]) => [label, dialect, $schema, schema, states] as const)))(
    'keeps the live location beside %s, in %s',
    async (_label, _dialect, $schema, schema, states) => {
      for (const [data, expected] of states) expect(outline(await project({ $schema, ...schema }, data))).toEqual(expected)
    },
  )

  const X = { $ref: '#/$defs/X' }
  const deadFirst = { type: 'object', if: false, then: X, allOf: [X], $defs: { X: { type: 'object', properties: { c: X, v: S } }, keep: { $ref: '#/then' } } }
  it.each(dialects.flatMap(([dialect, $schema]) => [
    [{}, dialect, $schema, ['', '/c', '/c/v', '/v'], { '/c': ['recursion'] }, ['/c/v']],
    [{ c: {} }, dialect, $schema, ['', '/c', '/c/c', '/c/c/v', '/c/v', '/v'], { '/c/c': ['recursion'] }, ['/c/c/v']],
  ] as const))('bounds a recursion a kept dead then reaches before a live allOf, at %j in %s', async (data, _dialect, $schema, expected, boundaries, expansion) => {
    const p = await project({ $schema, ...deadFirst }, data)
    expect(pointers(p)).toEqual(expected)
    expect(withBoundaries(p)).toEqual(boundaries)
    expect(expanded(p)).toEqual(expansion)
  })

  it.each(dialects)('projects the then of a $defs member named constructor that a reference points into, in %s', async (_dialect, $schema) => {
    const p = await project({
      $schema,
      type: 'object',
      $defs: { constructor: { type: 'object', then: { type: 'object', properties: { q: S } } } },
      properties: { r: { $ref: '#/$defs/constructor/then' } },
    }, {})
    expect(pointers(p)).toEqual(['', '/r', '/r/q'])
  })

  const merged = [
    ['a dead then at a $ref site whose target holds the if', { unevaluatedProperties: false, $ref: '#/$defs/A', then: { properties: { u: {} } }, $defs: { A: { if: {}, then: {} } } }, { u: 1 }, [[], []]],
    ['a dead then in a $ref target beside the site if', { unevaluatedProperties: false, $ref: '#/$defs/A', if: {}, then: {}, $defs: { A: { then: { properties: { u: {} } } } } }, { u: 1 }, [[], []]],
    ['a dead else under if: true at a $ref site', { unevaluatedProperties: false, $ref: '#/$defs/A', if: true, else: { properties: { u: {} } }, $defs: { A: { if: false } } }, { u: 1 }, [[], []]],
    [
      'a dead then at a $ref site below a property',
      { type: 'object', properties: { p: { unevaluatedProperties: false, $ref: '#/$defs/A', then: { properties: { u: {} } } } }, $defs: { A: { if: { required: ['k'] }, then: {} } } },
      { p: { k: 1, u: 1 } },
      [[['/p/k', 'unevaluatedProperties']], [['/p/k', 'unevaluatedProperties']]],
    ],
    ['a dead then with prefixItems at a $ref site', { unevaluatedItems: false, $ref: '#/$defs/A', then: { prefixItems: [true] }, $defs: { A: { if: {}, then: {} } } }, [1], [[['/0', 'unevaluatedItems']], []]],
  ] as const
  it.each(merged.flatMap(([label, schema, data, errors]) => [
    [label, '2019-09', on2019, schema, data, errors[0]],
    [label, '2020-12', uris['2020-12'], schema, data, errors[1]],
  ] as const))('validates %s as main does, in %s', async (_label, _dialect, $schema, schema, data, errors) => {
    const result = await (await createJsonSchemaAdapter({ $schema, ...schema })).validate(data)
    expect(result.valid).toBe(errors.length === 0)
    expect(result.errors.map((e) => [e.instancePointer, e.keyword])).toEqual(errors)
  })

  const N = { type: 'number' }
  const collisions = [
    ['a then declared before the live property', { type: 'object', then: { properties: { q: S } }, properties: { q: N, r: { $ref: '#/properties/q' } } }],
    ['a then declared after the live property', { type: 'object', properties: { q: N, r: { $ref: '#/properties/q' } }, then: { properties: { q: S } } }],
    ['a then below a property beside a root then', { type: 'object', then: S, properties: { p: { type: 'object', then: N }, r: { $ref: '#/then' } } }],
    ['a then in $defs before the live one', { type: 'object', $defs: { foo: { type: 'object', properties: { q: { then: S } } } }, properties: { q: { then: N }, r: { $ref: '#/properties/q/then' } } }],
    ['a then in $defs after the live one', { type: 'object', properties: { q: { then: N }, r: { $ref: '#/properties/q/then' } }, $defs: { foo: { type: 'object', properties: { q: { then: S } } } } }],
    ['a then the library alone resolves into', { type: 'object', then: { properties: { q: S } }, properties: { r: { $ref: '#/properties/q' } } }],
  ] as const
  const stringOn = (dialect: string, label: string) => dialect !== 'draft-07' || label === 'a then the library alone resolves into'
  it.each(Object.entries(uris).flatMap(([dialect, $schema]) => collisions.map(([label, schema]) => [label, dialect, $schema, schema] as const)))(
    'validates a reference beside %s as main does before any projection, in %s',
    async (label, dialect, $schema, schema) => {
      const adapter = await createJsonSchemaAdapter({ $schema, ...schema })
      const [valid, invalid] = stringOn(dialect, label) ? [{ r: 'x' }, { r: 5 }] : [{ r: 5 }, { r: 'x' }]
      adapter.project(invalid)
      expect(await adapter.validate(valid)).toEqual(expect.objectContaining({ valid: true, errors: [] }))
      expect((await adapter.validate(invalid)).errors.map((e) => [e.instancePointer, e.keyword])).toEqual([['/r', 'type']])
    },
  )

  const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties })
  const twenty =Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`q${i}`, obj({ s: S })]))
  const byActivity = (p: SchemaProjection) => ({
    active: [...p.nodes].filter(([, n]) => n.active).map(([k]) => k).sort(),
    inactive: [...p.nodes].filter(([, n]) => !n.active).map(([k]) => k).sort(),
  })
  const beside = (own: Record<string, unknown>, keyword: 'then' | 'else') =>
    obj({ a: { ...obj({ b: { type: 'object', ...own } }), if: { required: ['z'] }, then: { properties: { b: { if: { required: ['w'] }, [keyword]: { properties: { t: S } } } } } } })
  const pairData = [{}, { a: { b: {} } }, { a: { z: 1, b: { w: 1 } } }]
  const closed = { active: ['', '/a', '/a/b'], inactive: [] }
  const tActive = { active: ['', '/a', '/a/b', '/a/b/t'], inactive: [] }
  const tInactive = { active: ['', '/a', '/a/b'], inactive: ['/a/b/t'] }
  const live = [
    ['a then without if beside a live then', beside({ then: { properties: twenty } }, 'then'), pairData, [closed, closed, tActive]],
    ['an else without if beside a live else', beside({ else: { properties: twenty } }, 'else'), pairData, [closed, closed, tInactive]],
    ['a then under if: false beside a live then', beside({ if: false, then: { properties: twenty } }, 'then'), pairData, [closed, closed, tActive]],
    ['an else under if: true beside a live else', beside({ if: true, else: { properties: twenty } }, 'else'), pairData, [closed, closed, tInactive]],
    [
      'an else under if: true in a conditional branch',
      obj({
        b: {
          ...obj({ a: { type: 'object' } }),
          if: { required: ['k'] },
          then: { properties: { a: { if: true, else: { properties: twenty } } } },
          else: { properties: { a: { if: false, else: { properties: { y: S } } } } },
        },
      }),
      [{}, { b: { k: 1 } }, { b: { a: {} } }],
      [
        { active: ['', '/b', '/b/a', '/b/a/y'], inactive: [] },
        { active: ['', '/b', '/b/a'], inactive: [] },
        { active: ['', '/b', '/b/a', '/b/a/y'], inactive: [] },
      ],
    ],
    [
      'a then under if: false in a merged branch',
      obj({
        b: {
          ...obj({ a: { type: 'object', if: {} } }),
          if: {},
          then: { properties: { a: { if: false, then: { properties: { x: obj({ s: { type: 'string', default: 'v' } }) } } } } },
          else: { properties: { a: { if: { required: ['z'] }, then: { properties: { y: S } } } } },
        },
      }),
      [{}, { b: {} }, { b: { a: {} } }],
      [
        { active: ['', '/b', '/b/a'], inactive: [] },
        { active: ['', '/b', '/b/a'], inactive: [] },
        { active: ['', '/b', '/b/a'], inactive: [] },
      ],
    ],
  ] as const

  it.each(dialects.flatMap(([dialect, $schema]) => live.map(([label, schema, data, expected]) => [label, dialect, $schema, schema, data, expected] as const)))(
    'projects the live fields beside %s, in %s',
    async (_label, _dialect, $schema, schema, data, expected) => {
      for (const [state, value] of data.entries()) {
        const p = await project({ $schema, ...schema }, value)
        expect(byActivity(p)).toEqual(expected[state])
        expect(withBoundaries(p)).toEqual({})
        expect(flagged(p)).toBe(0)
      }
    },
  )

  const defaulted = (name: string) => obj({ [name]: { type: 'string', default: 'x' } })
  const liveCondition = () =>
    obj({ child: { ...obj({ child: { type: 'object', then: {} } }), if: { required: ['z'] }, then: { if: { required: ['w'] }, then: { properties: { q: defaulted('s') } } } } })
  const deadIf = (defs: string) => {
    const ref = { $ref: `#/${defs}/R` }
    return {
      ...obj({
        child: { ...obj({ q: defaulted('d'), child: { type: 'object', then: { if: { required: ['k'] } } } }), if: { required: ['z'] }, then: { then: { properties: { q: ref } } } },
        t: { type: 'array', items: ref },
      }),
      [defs]: { R: obj({ r: { type: 'array', items: ref } }) },
    }
  }
  it.each(dialects.flatMap(([dialect, $schema]) => [
    ['a live condition under a then', dialect, { $schema, ...liveCondition() }, { child: { z: 1, w: 1 } }, { child: { z: 1, w: 1, q: { s: 'x' } } }],
    ['a dead branch that holds an if', dialect, { $schema, ...deadIf(dialect === 'draft-07' ? 'definitions' : '$defs') }, undefined, { child: { q: { d: 'x' } } }],
  ] as const))('fills a live default beside %s as main does, in %s', async (_label, _dialect, schema, initialData, data) => {
    const runtime = createFormRuntime(await createJsonSchemaAdapter(schema), { initialization: 'schema-defaults', initialData })
    expect(runtime.data.getSnapshot()).toEqual(data)
    expect(runtime.initialization.getSnapshot()).toEqual(expect.objectContaining({ outcome: 'initialized', refusals: [] }))
  })
})

describe('the budget', () => {
  const kdistinct = (k: number) => {
    const props = () => Object.fromEntries(Array.from({ length: k }, (_, j) => [`p${j}`, { $ref: `#/$defs/d${j}` }]))
    const $defs: Record<string, unknown> = {}
    for (let i = 0; i < k; i++) $defs[`d${i}`] = { type: 'object', properties: { [`v${i}`]: S, ...props() } }
    return on2020({ type: 'object', properties: props(), $defs })
  }
  const { $id: _id, ...metaNoId } = metaschemas[0] as Record<string, unknown>
  const strings = Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`s${i}`, S]))

  it('admits 16 recursion-induced objects of an all-to-all schema', async () => {
    const p = await project(kdistinct(6), {})
    expect(p.nodes.size).toBe(45)
    expect(flagged(p)).toBe(38)
    expect(Object.keys(withBoundaries(p))).toEqual(expect.arrayContaining(['/p0/p1', '/p3', '/p4', '/p5']))
  })

  it('bounds the draft-07 metaschema', async () => {
    const p = await project(metaNoId, {})
    expect(p.nodes.size).toBe(403)
    expect(flagged(p)).toBe(361)
    expect(withBoundaries(p)['/items']).toContain('budget')
  })

  it('stops a wide recursive object at the node limit, leaving no container empty', async () => {
    const p = await project(on2020({
      type: 'object',
      properties: { x: { $ref: '#/$defs/n' } },
      $defs: { n: { type: 'object', properties: { self: { $ref: '#/$defs/n' }, ...strings } } },
    }), {})
    expect(p.nodes.size).toBe(514)
    expect(withBoundaries(p)['/x']).toContain('budget')
    for (const node of p.nodes.values()) {
      if (node.boundaries?.includes('budget')) expect(node.children?.length).toBeGreaterThan(0)
    }
  })

  it('never budgets a schema without recursion', async () => {
    const level = (depth: number): Record<string, unknown> =>
      depth === 0
        ? S
        : { type: 'object', properties: Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`c${i}`, level(depth - 1)])) }
    const p = await project(on2020(level(5)), {})
    expect(p.nodes.size).toBe(1365)
    expect(withBoundaries(p)).toEqual({})
    expect(flagged(p)).toBe(0)
  })

  it('resolves a reference once per site, so wide flat schemas stay tractable', async () => {
    const p = await project(on2020({
      type: 'object',
      properties: Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`f${i}`, { $ref: '#/$defs/s' }])),
      $defs: { s: S },
    }), {})
    expect(p.nodes.size).toBe(2001)
  })
})

describe('the reference cache', () => {
  const compile = (schema: Record<string, unknown>) => compileSchema(on2020(schema), { draft: 'draft-2020-12' })

  it('returns one target per static reference site', () => {
    const root = compile({ type: 'object', properties: { a: { $ref: '#/$defs/s' } }, $defs: { s: S } })
    const site = root.properties!.a as SchemaNode
    expect(followRef(site)).toBe(followRef(site))
  })

  it('resolves a dynamic reference site afresh', () => {
    const root = compile({ $dynamicAnchor: 'node', type: 'object', properties: { a: { $dynamicRef: '#node' } } })
    const site = root.properties!.a as SchemaNode
    const first = followRef(site)
    expect(first?.schemaLocation).toBe('#')
    expect(followRef(site)).not.toBe(first)
  })

  it('keeps what each referring site adds to a chain it shares', async () => {
    const p = await project(on2020({
      type: 'object',
      properties: { a: { $ref: '#/$defs/x', title: 'A', default: 'a' }, b: { $ref: '#/$defs/x', title: 'B', default: 'b' } },
      $defs: { x: { $ref: '#/$defs/y' }, y: S },
    }), {})
    expect(p.nodes.get('/a' as never)?.annotations).toEqual({ title: 'A', default: 'a' })
    expect(p.nodes.get('/b' as never)?.annotations).toEqual({ title: 'B', default: 'b' })
  })

  it.each([
    ['first', { a: { $ref: '#/$defs/x', default: null }, b: { $ref: '#/$defs/x' } }],
    ['second', { b: { $ref: '#/$defs/x' }, a: { $ref: '#/$defs/x', default: null } }],
  ])('tells a null default from none along a shared chain, with the null site %s', async (_order, properties) => {
    const p = await project(on2020({
      type: 'object',
      properties,
      $defs: { x: { $ref: '#/$defs/y' }, y: { type: ['string', 'null'] } },
    }), {})
    expect(p.nodes.get('/a' as never)?.annotations).toEqual({ default: null })
    expect(p.nodes.get('/b' as never)?.annotations).toEqual({})
    expect(p.nodes.get('/b' as never)?.defaultSources).toBeUndefined()
  })
})

describe('spellings of one tree', () => {
  const anonymous = { type: 'object', properties: { name: S, child: { $ref: '#' } } }
  it.each(['draft-07', '2020-12'] as const)('%s projects `#` without an $id like $defs', async (dialect) => {
    const adapter = await createJsonSchemaAdapter(anonymous, { defaultDialect: dialect })
    expect(pointers(adapter.project({}))).toEqual(['', '/child', '/child/name', '/name'])
  })
})

describe('a definitions name the library percent-encodes', () => {
  const dialects = [
    ['draft-07', 'http://json-schema.org/draft-07/schema#'],
    ['2020-12', 'https://json-schema.org/draft/2020-12/schema'],
  ] as const
  const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties })
  const shape = (p: SchemaProjection) => ({ pointers: pointers(p), boundaries: withBoundaries(p), expansion: expanded(p) })

  it.each(dialects)('initializes a tree under a name with a space, in %s', async (_dialect, $schema) => {
    const ref = { $ref: '#/definitions/Tree%20Node' }
    const schema = { $schema, ...obj({ child: ref }), definitions: { 'Tree Node': obj({ name: { type: 'string', default: 'n' }, child: ref }) } }
    const runtime = createFormRuntime(await createJsonSchemaAdapter(schema), { initialization: 'schema-defaults' })
    const report = runtime.initialization.getSnapshot()
    expect(runtime.data.getSnapshot()).toEqual({})
    expect(report?.outcome).toBe('initialized')
    expect(report?.outcome === 'initialized' ? report.refusals.map(({ location, reason }) => [location, reason]) : []).toEqual([
      ['/child/name', 'recursive-expansion'],
    ])
  })

  const allToAll = ($schema: string, name: (i: number) => string) => {
    const refs = () => Object.fromEntries([0, 1, 2, 3].map((j) => [`p${j}`, { $ref: `#/definitions/${encodeURIComponent(name(j))}` }]))
    return { $schema, ...obj(refs()), definitions: Object.fromEntries([0, 1, 2, 3].map((i) => [name(i), obj({ [`v${i}`]: S, ...refs() })])) }
  }
  it.each(dialects)('budgets an all-to-all recursion under names with a space as under plain names, in %s', async (_dialect, $schema) => {
    const spaced = await project(allToAll($schema, (i) => `d ${i}`), {})
    expect(spaced.nodes.size).toBe(41)
    expect(flagged(spaced)).toBe(36)
    expect(Object.values(withBoundaries(spaced)).filter((reasons) => reasons?.includes('budget'))).toHaveLength(14)
    expect(shape(spaced)).toEqual(shape(await project(allToAll($schema, (i) => `d${i}`), {})))
  })

  const titledAlias = ($schema: string, alias: string) => {
    const ref = `#/definitions/${encodeURIComponent(alias)}`
    return {
      $schema,
      ...obj({ t: { $ref: ref, title: 'x' }, p: { $ref: ref } }),
      definitions: { [alias]: { $ref: '#/definitions/N' }, N: obj({ v: S, next: { $ref: '#/definitions/N' } }) },
    }
  }
  it.each(dialects)('reads an alias under a name with a space as written, not as a titled site merged it, in %s', async (_dialect, $schema) => {
    const spaced = await project(titledAlias($schema, 'A B'), {})
    expect(pointers(spaced).filter((pointer) => pointer.startsWith('/p'))).toEqual(['/p', '/p/v'])
    expect(withBoundaries(spaced)['/p']).toEqual(['recursion'])
    expect(shape(spaced)).toEqual(shape(await project(titledAlias($schema, 'AB'), {})))
  })

  it.each(dialects.flatMap(([dialect, $schema]) => (['$defs', 'definitions'] as const).map((keyword) => [keyword, dialect, $schema] as const)))(
    'flags the recursion under a %s name that holds a percent escape, in %s',
    async (keyword, _dialect, $schema) => {
      const ref = { $ref: `#/${keyword}/a%2520b` }
      const p = await project({ $schema, ...obj({ name: S, child: ref }), [keyword]: { 'a%20b': obj({ name: S, child: ref }) } }, {})
      expect(shape(p)).toEqual({ pointers: ['', '/child', '/child/name', '/name'], boundaries: { '/child': ['recursion'] }, expansion: ['/child/name'] })
    },
  )
})

describe('a reference spelled otherwise than the name it reaches', () => {
  const dialects = [
    ['draft-07', 'http://json-schema.org/draft-07/schema#'],
    ['2020-12', 'https://json-schema.org/draft/2020-12/schema'],
  ] as const
  const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties })
  const shape = (p: SchemaProjection) => ({ pointers: pointers(p), boundaries: withBoundaries(p), expansion: expanded(p) })
  const parens = (name: string) => encodeURIComponent(name).replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  const escaped = (name: string) => name.replace(/~/g, '~0').replace(/\//g, '~1')
  const initialize = async (schema: Record<string, unknown>) => {
    const runtime = createFormRuntime(await createJsonSchemaAdapter(schema), { initialization: 'schema-defaults' })
    const report = runtime.initialization.getSnapshot()
    return {
      data: runtime.data.getSnapshot(),
      outcome: report?.outcome,
      refusals: report?.outcome === 'initialized' ? report.refusals.map(({ location, reason }) => [location, reason]) : [],
    }
  }
  const named = ($schema: string, keyword: string, name: string, ref: string) => ({
    $schema,
    ...obj({ child: { $ref: ref } }),
    [keyword]: { [name]: obj({ name: { type: 'string', default: 'n' }, child: { $ref: ref } }) },
  })
  const allToAll = ($schema: string, name: (i: number) => string, target: (name: string) => string) => {
    const refs = () => Object.fromEntries([0, 1, 2, 3].map((j) => [`p${j}`, { $ref: target(name(j)) }]))
    const members = Object.fromEntries([0, 1, 2, 3].map((i) => [name(i), obj({ [`v${i}`]: S, ...refs() })]))
    return target('').startsWith('#/definitions/H/') ? { $schema, ...obj(refs()), definitions: { H: obj(members) } } : { $schema, ...obj(refs()), $defs: members }
  }

  it.each(dialects.flatMap(([dialect, $schema]) => [
    ['Item (v2)', `#/$defs/${parens('Item (v2)')}`],
    ['Größe', '#/$defs/Gr%c3%b6%c3%9fe'],
    ['Tree/Node', '#/$defs/Tree~1Node'],
    ['Tree~Node', '#/$defs/Tree~0Node'],
  ].map(([name, ref]) => [name, ref, dialect, $schema] as const)))('initializes a tree under the $defs name %j referenced as %s, in %s', async (name, ref, _dialect, $schema) => {
    const schema = named($schema, '$defs', name, ref)
    expect(await initialize(schema)).toEqual({ data: {}, outcome: 'initialized', refusals: [['/child/name', 'recursive-expansion']] })
    expect(shape(await project(schema, {}))).toEqual(shape(await project(named($schema, '$defs', 'TreeNode', '#/$defs/TreeNode'), {})))
  })

  it.each(dialects)('initializes a tree held as a property of a definition, in %s', async (_dialect, $schema) => {
    const ref = { $ref: '#/definitions/H/properties/Tree%20Node' }
    const schema = { $schema, ...obj({ child: ref }), definitions: { H: obj({ 'Tree Node': obj({ name: { type: 'string', default: 'n' }, child: ref }) }) } }
    expect(await initialize(schema)).toEqual({ data: {}, outcome: 'initialized', refusals: [['/child/name', 'recursive-expansion']] })
  })

  it.each(dialects.flatMap(([dialect, $schema]) => ([
    ['$defs names d(i) referenced as %28 and %29', (i: number) => `d(${i})`, (name: string) => `#/$defs/${parens(name)}`],
    ['$defs names d/i', (i: number) => `d/${i}`, (name: string) => `#/$defs/${escaped(name)}`],
    ['$defs names d~i', (i: number) => `d~${i}`, (name: string) => `#/$defs/${escaped(name)}`],
    ['hubs held as properties of a definition', (i: number) => `d ${i}`, (name: string) => `#/definitions/H/properties/${encodeURIComponent(name)}`],
  ] as const).map(([label, name, target]) => [label, dialect, $schema, name, target] as const)))(
    'budgets an all-to-all recursion over %s as over plain names, in %s',
    async (_label, _dialect, $schema, name, target) => {
      const p = await project(allToAll($schema, name, target), {})
      expect(p.nodes.size).toBe(41)
      expect(flagged(p)).toBe(36)
      expect(Object.values(withBoundaries(p)).filter((reasons) => reasons?.includes('budget'))).toHaveLength(14)
      expect(shape(p)).toEqual(shape(await project(allToAll($schema, (i) => `d${i}`, (plain) => `#/$defs/${plain}`), {})))
    },
  )

  it.each(dialects.flatMap(([dialect, $schema]) => [
    ['a b', 'a%20b'],
    ['a%20b', 'a%2520b'],
    ['a/b', 'a~1b'],
  ].map(([name, spelled]) => [name, spelled, dialect, $schema] as const)))('finds the repeat of the property %j referenced as #/properties/%s at its own level, in %s', async (name, spelled, _dialect, $schema) => {
    const schema = { $schema, type: 'object', properties: { [name]: obj({ name: { type: 'string', default: 'n' }, child: { $ref: `#/properties/${spelled}` } }) } }
    const at = `/${escaped(name)}`
    expect(shape(await project(schema, {}))).toEqual({ pointers: ['', at, `${at}/name`], boundaries: { [at]: ['recursion'] }, expansion: [`${at}/name`] })
    expect(await initialize(schema)).toEqual({ data: {}, outcome: 'initialized', refusals: [[`${at}/name`, 'recursive-expansion']] })
  })

  it.each(dialects.flatMap(([dialect, $schema]) => [{ then: true }, { then: false }, { if: true, then: {} }].map((branch) => [branch, dialect, $schema] as const)))(
    'places the boolean in %j of a definition a root reference reaches under that definition, in %s',
    async (branch, _dialect, $schema) => {
      const p = await project({ $schema, $ref: '#/definitions/D', definitions: { D: { ...obj({ v: S }), if: { required: ['v'] }, ...branch } } }, {})
      expect(pointers(p)).toEqual(['', '/v'])
      expect(p.diagnostics).toEqual([])
    },
  )
})

describe('the marked copy', () => {
  it('leaves instance data a reference points into as written', async () => {
    const a = { type: 'string', examples: [S], default: S, enum: [S] }
    const refs = { b: { $ref: '#/properties/a/examples/0' }, c: { $ref: '#/properties/a/default' }, d: { $ref: '#/properties/a/enum/0' } }
    const node = (await project(on2020({ type: 'object', properties: { a, ...refs } }), {})).nodes.get('/a' as never)
    expect(node?.annotations).toEqual({ examples: [S], default: S })
    expect(node?.enumValues).toEqual([{ value: S }])
  })

  it('adds no member to a map a reference points at', async () => {
    const p = await project(on2020({ type: 'object', properties: { a: S }, allOf: [{ $ref: '#/properties' }] }), {})
    expect(p.nodes.get('' as never)?.children?.map((child) => child.key)).toEqual(['a'])
  })

  it('leaves the shared metaschema documents unmarked', async () => {
    await project({ $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', properties: { s: { $ref: 'http://json-schema.org/draft-07/schema#' } } }, {})
    expect(JSON.stringify(metaschemas)).not.toContain('x-texaryn-position')
  })

  it.each([
    ['#/__proto__', { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { a: { $ref: '#/__proto__' } } }],
    ['#/definitions/%5F%5Fproto%5F%5F', { $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', properties: { a: { $ref: '#/definitions/%5F%5Fproto%5F%5F' } }, definitions: {} }],
  ])('marks nothing through a reference to %s, so a later schema projects as written', async (_ref, polluter) => {
    try {
      const p = await project(polluter, {})
      expect(pointers(p)).toEqual([''])
      expect((p.diagnostics ?? []).map((diagnostic) => diagnostic.code)).toEqual(['unresolved-projection-shape'])
      expect(Object.hasOwn(Object.prototype, 'x-texaryn-position')).toBe(false)
      const later = await project(on2020({
        type: 'object',
        properties: { a: { $ref: '#/examples/0' } },
        examples: [{ type: 'object', properties: { x: { type: 'object', properties: { x1: { type: 'string' } } } } }],
      }), {})
      expect(pointers(later)).toEqual(['', '/a', '/a/x', '/a/x/x1'])
      expect(withBoundaries(later)).toEqual({})
      expect(flagged(later)).toBe(0)
    } finally {
      delete (Object.prototype as Record<string, unknown>)['x-texaryn-position']
    }
  })
})

describe('a boolean property whose name another property takes once escaped', () => {
  const dialects = [
    ['draft-07', 'http://json-schema.org/draft-07/schema#'],
    ['2020-12', 'https://json-schema.org/draft/2020-12/schema'],
  ] as const
  const inner = { type: 'object', properties: { x: { type: 'object', properties: { y: { type: 'string', default: 'v' } } } } }
  const wide = {
    type: 'object',
    properties: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`o${i}`, { type: 'object', properties: { s: { type: 'string', default: 'v' } } }])),
  }
  const rows: readonly (readonly [string, Record<string, unknown>, (p: SchemaProjection) => unknown, unknown])[] = [
    ['a~1b before a/b', { 'a~1b': true, 'a/b': inner }, pointers, ['', '/a~1b', '/a~1b/x', '/a~1b/x/y']],
    ['a/b before a~1b', { 'a/b': inner, 'a~1b': true }, pointers, ['', '/a~1b', '/a~1b/x', '/a~1b/x/y']],
    ['a~0b before a~b', { 'a~0b': true, 'a~b': inner }, pointers, ['', '/a~0b', '/a~0b/x', '/a~0b/x/y']],
    ['a~b before a~0b', { 'a~b': inner, 'a~0b': true }, pointers, ['', '/a~0b', '/a~0b/x', '/a~0b/x/y']],
    ['x/properties/y beside x', { 'x/properties/y': true, x: { type: 'object', properties: { y: inner } } }, pointers, ['', '/x', '/x/y', '/x/y/x', '/x/y/x/y']],
    ['a~1b before a/b with 20 objects', { 'a~1b': true, 'a/b': wide }, (p) => p.nodes.size, 42],
  ]

  it.each(dialects.flatMap(([dialect, $schema]) => rows.map(([label, properties, read, expected]) => [label, dialect, $schema, properties, read, expected] as const)))(
    'projects %s without recursion, in %s',
    async (_label, _dialect, $schema, properties, read, expected) => {
      const p = await project({ $schema, type: 'object', properties }, {})
      expect(read(p)).toEqual(expected)
      expect(withBoundaries(p)).toEqual({})
      expect(flagged(p)).toBe(0)
    },
  )

  it.each(dialects)('places a boolean member under its own name, in %s', (dialect, $schema) => {
    const compileMarked = (document: Record<string, unknown>) =>
      compileSchema(markPositions(buildSchemaGraph(document, dialect), document).document as JsonSchema, {
        draft: dialect === 'draft-07' ? 'draft-07' : 'draft-2020-12',
      })
    const encoded = compileMarked({ $schema, type: 'object', properties: { a: { $ref: '#/definitions/%24x' } }, definitions: { $x: true } })
    expect(positionOf(encoded.$defs!.$x!)).toBe('#/definitions/$x')
    const collide = compileMarked({ $schema, type: 'object', properties: { 'a~1b': true, 'a/b': inner } })
    expect(positionOf(collide.properties!['a~1b']!)).toBe('#/properties/a~01b')
  })
})

describe('a boolean definition a reference reaches after the root is reduced', () => {
  const dialects = { 'draft-07': 'http://json-schema.org/draft-07/schema#', '2020-12': 'https://json-schema.org/draft/2020-12/schema' } as const
  const inner = (ref: string) => ({ type: 'object', properties: { t: { $ref: ref }, s: { type: 'string', default: 'v' } } })
  const rows: readonly (readonly [string, keyof typeof dialects, Record<string, unknown>])[] = [
    ['$defs a~1b before a/b', 'draft-07', { properties: { q: { $ref: '#/$defs/a~1b' } }, $defs: { 'a~1b': true, 'a/b': inner('#/$defs/a~01b') } }],
    ['$defs a/b before a~1b', 'draft-07', { properties: { q: { $ref: '#/$defs/a~1b' } }, $defs: { 'a/b': inner('#/$defs/a~01b'), 'a~1b': true } }],
    ['definitions a b beside a%20b', 'draft-07', { properties: { q: { $ref: '#/definitions/a%2520b' } }, definitions: { 'a b': true, 'a%20b': inner('#/definitions/a%20b') } }],
    ['definitions $x beside %24x', 'draft-07', { properties: { q: { $ref: '#/definitions/%2524x' } }, definitions: { $x: true, '%24x': inner('#/definitions/%24x') } }],
    ['$defs a~1b before a/b', '2020-12', { properties: { q: { $ref: '#/$defs/a~1b' } }, $defs: { 'a~1b': true, 'a/b': inner('#/$defs/a~01b') } }],
    ['$defs a/b before a~1b', '2020-12', { properties: { q: { $ref: '#/$defs/a~1b' } }, $defs: { 'a/b': inner('#/$defs/a~01b'), 'a~1b': true } }],
  ]

  it.each(rows)('projects %s without recursion, in %s', async (_label, dialect, members) => {
    const p = await project({ $schema: dialects[dialect], type: 'object', ...members }, {})
    expect(pointers(p)).toEqual(['', '/q', '/q/s'])
    expect(withBoundaries(p)).toEqual({})
    expect(flagged(p)).toBe(0)
  })

  it.each(Object.entries(dialects))('refuses only the recursive default beside a boolean $x, in %s', async (_dialect, $schema) => {
    const schema = {
      $schema,
      type: 'object',
      properties: {
        a: { type: 'object', allOf: [{ $ref: '#/definitions/%24x' }], properties: { v: { type: 'string', default: 'd' } } },
        t: { $ref: '#/definitions/%2524x' },
      },
      definitions: {
        $x: true,
        '%24x': { type: 'object', properties: { name: { type: 'string', default: 'n' }, child: { $ref: '#/definitions/%2524x' } } },
      },
    }
    const runtime = createFormRuntime(await createJsonSchemaAdapter(schema), { initialization: 'schema-defaults' })
    const report = runtime.initialization.getSnapshot()
    expect(runtime.data.getSnapshot()).toEqual({ a: { v: 'd' } })
    expect(report?.outcome).toBe('initialized')
    expect(report?.outcome === 'initialized' ? report.refusals.map(({ location, reason }) => [location, reason]) : []).toEqual([
      ['/t/name', 'recursive-expansion'],
    ])
    expect(expanded(await project(schema, {}))).toEqual(['/t/name'])
  })
})

describe('reduction repairs', () => {
  it('follows an acyclic reference chain without a diagnostic', async () => {
    const p = await project(on2020({
      type: 'object',
      properties: { p: { $ref: '#/$defs/a' } },
      $defs: { a: { $ref: '#/$defs/b' }, b: { type: 'object', properties: { leaf: S } } },
    }), {})
    expect(pointers(p)).toEqual(['', '/p', '/p/leaf'])
    expect(p.diagnostics ?? []).toEqual([])
  })

  it('keeps the subtree of a draft-07 oneOf wrapper once it holds data', async () => {
    const p = await project({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: { child: { oneOf: [{ $ref: '#/definitions/node' }, { type: 'null' }] } },
      definitions: { node: { type: 'object', properties: { name: S } } },
    }, { child: { name: 'n' } })
    expect(pointers(p)).toContain('/child/name')
  })
})

describe('default sources', () => {
  it('reports agreeing declarations, present exactly with the default', async () => {
    const p = await project(on2020({
      type: 'object',
      properties: { a: { type: 'integer', allOf: [{ $ref: '#/$defs/d' }], default: 1 }, b: S },
      $defs: { d: { type: 'integer', default: 1 } },
    }), {})
    expect(p.nodes.get('/a' as never)?.defaultSources).toEqual(['/$defs/d', '/properties/a'])
    expect(p.nodes.get('/b' as never)?.defaultSources).toBeUndefined()
  })
})

describe('initialization over a recursive schema', () => {
  it.each([
    ['a leaf beneath an absent recursive object', { type: 'object', properties: { name: { type: 'string', default: 'n' }, child: { $ref: '#/$defs/n' } }, $defs: { n: { type: 'object', properties: { name: { type: 'string', default: 'n' }, child: { $ref: '#/$defs/n' } } } } }, {}],
    ['a leaf beneath a present one', { type: 'object', properties: { name: { type: 'string', default: 'n' }, child: { $ref: '#/$defs/n' } }, $defs: { n: { type: 'object', properties: { name: { type: 'string', default: 'n' }, child: { $ref: '#/$defs/n' } } } } }, { child: {} }],
    ['a self-creating array default', { type: 'object', properties: { name: { type: 'string', default: 'n' }, children: { type: 'array', items: { $ref: '#/$defs/n' }, default: [{}] } }, $defs: { n: { type: 'object', properties: { name: { type: 'string', default: 'n' }, children: { type: 'array', items: { $ref: '#/$defs/n' }, default: [{}] } } } } }, {}],
  ])('writes the same data whatever the limits: %s', async (_label, schema, initialData) => {
    const run = async (limits: { objects: number; nodes: number }) =>
      createFormRuntime(await createAdapter(on2020(schema), undefined, limits), { initialization: 'schema-defaults', initialData }).data.getSnapshot()
    const expected = await run({ objects: 16, nodes: 512 })
    expect(await run({ objects: 0, nodes: 0 })).toEqual(expected)
    expect(await run({ objects: Infinity, nodes: Infinity })).toEqual(expected)
  })

  it('fills a root default beside 17 recursive properties', async () => {
    const properties: Record<string, unknown> = { title: { type: 'string', default: 'x' } }
    for (let i = 0; i < 17; i++) properties[`r${i}`] = { $ref: '#/$defs/node' }
    const schema = on2020({
      type: 'object',
      properties,
      $defs: { node: { type: 'object', properties: { title: { type: 'string', default: 'x' }, next: { $ref: '#/$defs/node' } } } },
    })
    const runtime = createFormRuntime(await createJsonSchemaAdapter(schema), { initialization: 'schema-defaults' })
    expect(runtime.data.getSnapshot()).toEqual({ title: 'x' })
  })
})

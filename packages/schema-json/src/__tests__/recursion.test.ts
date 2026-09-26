import { describe, it, expect } from 'vitest'
import { compileSchema, type SchemaNode } from 'json-schema-library'
import type { NodeProjection, SchemaProjection } from '@texaryn/core'
import { createFormRuntime } from '@texaryn/core'
import { createJsonSchemaAdapter } from '../index.js'
import { createAdapter } from '../adapter.js'
import { followRef } from '../identity.js'
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

  const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties })
  const twenty = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`q${i}`, obj({ s: S })]))
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
    ['a then under if: false beside a live then', beside({ if: false, then: { properties: twenty } }, 'then'), pairData, [closed, closed, tInactive]],
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
    'projects the live fields beside %s as main does, in %s',
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

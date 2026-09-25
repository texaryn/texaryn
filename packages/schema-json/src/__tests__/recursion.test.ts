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
const expansion = (p: SchemaProjection) =>
  [...p.nodes].filter(([, n]) => n.recursiveExpansion).map(([pointer]) => pointer).sort()
const dialects = {
  'draft-07': ['http://json-schema.org/draft-07/schema#', 'definitions'],
  '2020-12': ['https://json-schema.org/draft/2020-12/schema', '$defs'],
} as const

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

describe('trivially unreachable branches', () => {
  const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties })
  const deep = obj({ r: obj({ s: obj({ t: S }) }) })
  const many = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`q${i}`, obj({ s: S })]))
  const shapes = {
    'then under if: false': { if: false, then: { properties: { q: deep } } },
    'then without if': { then: { properties: { q: deep } } },
    'else under if: true': { if: true, else: { properties: { q: deep } } },
    'else without if': { else: { properties: { q: deep } } },
  }
  const inDialect = (dialect: keyof typeof dialects, build: (defs: string) => Record<string, unknown>) => {
    const [$schema, defs] = dialects[dialect]
    return { $schema, ...build(defs) }
  }
  const projectIn = (dialect: keyof typeof dialects, build: (defs: string) => Record<string, unknown>, data: unknown = {}) =>
    project(inDialect(dialect, build), data)
  const refs = (defs: string, k: number) =>
    Object.fromEntries(Array.from({ length: k }, (_, j) => [`p${j}`, { $ref: `#/${defs}/d${j}` }]))
  const definitions = (k: number, build: (i: number) => Record<string, unknown>) =>
    Object.fromEntries(Array.from({ length: k }, (_, i) => [`d${i}`, build(i)]))

  it.each(
    (['draft-07', '2020-12'] as const).flatMap((dialect) => Object.keys(shapes).map((shape) => [shape, dialect] as const)),
  )('omits the fields of %s in %s', async (shape, dialect) => {
    const p = await projectIn(dialect, () => obj({ p: { type: 'object', ...shapes[shape as keyof typeof shapes] } }))
    expect(pointers(p)).toEqual(['', '/p'])
    expect(withBoundaries(p)).toEqual({})
    expect(expansion(p)).toEqual([])
  })

  it.each(['draft-07', '2020-12'] as const)('omits 20 objects under a dead branch, in %s', async (dialect) => {
    const p = await projectIn(dialect, () => obj({ p: { type: 'object', if: false, then: { properties: many(20) } } }))
    expect(pointers(p)).toEqual(['', '/p'])
    expect(withBoundaries(p)).toEqual({})
    expect(expansion(p)).toEqual([])
  })

  it.each(['draft-07', '2020-12'] as const)('leaves the budget to the recursion beside a dead branch, in %s', async (dialect) => {
    const p = await projectIn(dialect, (defs) => ({
      ...obj({ p: { type: 'object', if: false, then: { properties: many(16) } }, t: { $ref: `#/${defs}/A` } }),
      [defs]: {
        A: obj({ av: S, b: { $ref: `#/${defs}/B` } }),
        B: obj({ bv: S, a: { $ref: `#/${defs}/A` } }),
      },
    }))
    expect(pointers(p)).toEqual(['', '/p', '/t', '/t/av', '/t/b', '/t/b/bv'])
    expect(withBoundaries(p)).toEqual({ '/t': ['recursion'] })
    expect(expansion(p)).toEqual(['/t/av', '/t/b', '/t/b/bv'])
  })

  it.each(['draft-07', '2020-12'] as const)('does not follow a root reference under a dead branch, in %s', async (dialect) => {
    const p = await projectIn(dialect, () => obj({ a: S, p: { type: 'object', if: false, then: { $ref: '#' } } }))
    expect(pointers(p)).toEqual(['', '/a', '/p'])
    expect(withBoundaries(p)).toEqual({})
    expect(expansion(p)).toEqual([])
  })

  it.each(['draft-07', '2020-12'] as const)('does not follow a recursive definition under a dead branch, in %s', async (dialect) => {
    const p = await projectIn(dialect, (defs) => ({
      ...obj({ a: S, p: { type: 'object', if: false, then: { $ref: `#/${defs}/N` } } }),
      [defs]: { N: obj({ n: S, q: { $ref: `#/${defs}/N` } }) },
    }))
    expect(pointers(p)).toEqual(['', '/a', '/p'])
    expect(withBoundaries(p)).toEqual({})
    expect(expansion(p)).toEqual([])
  })

  it.each(['draft-07', '2020-12'] as const)('fills a live field a dead reference redeclares, in %s', async (dialect) => {
    const schema = () =>
      inDialect(dialect, (defs) => ({
        ...obj({
          p: { ...obj({ q: obj({ d: { type: 'string', default: 'x' } }) }), then: { properties: { q: { $ref: `#/${defs}/R` } } } },
          t: { type: 'array', items: { $ref: `#/${defs}/R` } },
        }),
        [defs]: { R: obj({ r: { type: 'array', items: { $ref: `#/${defs}/R` } } }) },
      }))
    const p = await project(schema(), {})
    expect(pointers(p)).toEqual(['', '/p', '/p/q', '/p/q/d', '/t'])
    expect(withBoundaries(p)).toEqual({})
    expect(expansion(p)).toEqual([])
    const runtime = createFormRuntime(await createJsonSchemaAdapter(schema()), { initialization: 'schema-defaults' })
    expect(runtime.data.getSnapshot()).toEqual({ p: { q: { d: 'x' } } })
    expect(runtime.initialization.getSnapshot()).toMatchObject({ outcome: 'initialized', refusals: [] })
  })

  it.each(['draft-07', '2020-12'] as const)('does not follow recursion that runs only through dead branches, in %s', async (dialect) => {
    const p = await projectIn(dialect, (defs) => ({
      ...obj({ a: S, p: { type: 'object', if: false, then: { properties: refs(defs, 3) } } }),
      [defs]: definitions(3, (i) => obj({ [`v${i}`]: S, ...refs(defs, 3) })),
    }))
    expect(pointers(p)).toEqual(['', '/a', '/p'])
    expect(withBoundaries(p)).toEqual({})
    expect(expansion(p)).toEqual([])
  })

  it.each(['draft-07', '2020-12'] as const)('does not follow references under a then without an if, in %s', async (dialect) => {
    const p = await projectIn(dialect, (defs) => ({
      ...obj(refs(defs, 4)),
      [defs]: definitions(4, (i) => ({ ...obj({ [`v${i}`]: S }), then: { properties: refs(defs, 4) } })),
    }))
    expect(pointers(p)).toEqual(['', '/p0', '/p0/v0', '/p1', '/p1/v1', '/p2', '/p2/v2', '/p3', '/p3/v3'])
    expect(withBoundaries(p)).toEqual({})
    expect(expansion(p)).toEqual([])
  })

  it.each(['draft-07', '2020-12'] as const)('shows one empty level of a self-reference a dead branch redeclares, in %s', async (dialect) => {
    const build = (defs: string) => ({
      ...obj({ name: S, child: { $ref: `#/${defs}/N` } }),
      [defs]: { N: { ...obj({ name: S, child: { $ref: `#/${defs}/N` } }), if: false, then: { properties: { child: { type: 'object' } } } } },
    })
    const empty = await projectIn(dialect, build)
    expect(pointers(empty)).toEqual(['', '/child', '/child/name', '/name'])
    expect(withBoundaries(empty)).toEqual({ '/child': ['recursion'] })
    expect(expansion(empty)).toEqual(['/child/name'])
    const one = await projectIn(dialect, build, { child: {} })
    expect(pointers(one)).toEqual(['', '/child', '/child/child', '/child/child/name', '/child/name', '/name'])
    expect(withBoundaries(one)).toEqual({ '/child/child': ['recursion'] })
    expect(expansion(one)).toEqual(['/child/child/name'])
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

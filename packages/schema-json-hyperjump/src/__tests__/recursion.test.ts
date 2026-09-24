import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { NodeProjection, SchemaProjection } from '@texaryn/core'
import { createFormRuntime } from '@texaryn/core'
import { createHyperjumpAdapter } from '../index.js'
import { createAdapter } from '../adapter.js'
import { metaschemas } from './draft-07-metaschema.js'

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')

describe('the schema graph', () => {
  it('is the same file in both adapters', () => {
    expect(read('../schema-graph.ts')).toBe(read('../../../schema-json/src/schema-graph.ts'))
  })
})

describe('the draft-07 metaschema copy', () => {
  it('holds the document schema-json bundles', () => {
    const source = read('../../../schema-json/src/metaschemas/draft-07.ts')
    const document = source.slice(source.indexOf('{"$schema"'), source.lastIndexOf(' as JsonSchema'))
    expect(metaschemas).toEqual([JSON.parse(document)])
  })
})

const S = { type: 'string' }
const on2020 = (schema: Record<string, unknown>) => ({ $schema: 'https://json-schema.org/draft/2020-12/schema', ...schema })

async function project(schema: Record<string, unknown>, data: unknown): Promise<SchemaProjection> {
  return (await createHyperjumpAdapter(schema)).project(data)
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

  it('reads a row past prefixItems from items', async () => {
    const p = await project(on2020({
      type: 'array',
      prefixItems: [S],
      items: { type: 'object', properties: { a: { type: 'object', properties: { b: S } } } },
    }), ['x', {}])
    expect(pointers(p)).toEqual(['', '/0', '/1', '/1/a', '/1/a/b'])
    expect(withBoundaries(p)).toEqual({})
  })

  it('cuts a recursive row past prefixItems by the identity of items', async () => {
    const p = await project(on2020({
      type: 'array',
      prefixItems: [S],
      items: { $ref: '#/$defs/node' },
      $defs: { node: { type: 'object', properties: { name: S, child: { $ref: '#/$defs/node' } } } },
    }), ['x', {}])
    expect(pointers(p)).toEqual(['', '/0', '/1', '/1/child', '/1/child/name', '/1/name'])
    expect(withBoundaries(p)).toEqual({ '/1/child': ['recursion'] })
  })

  it('cuts a draft-07 reference to a boolean schema by the identity of its target', async () => {
    const p = await project({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: { x: { $ref: '#/definitions/n' } },
      definitions: { n: { $ref: '#/definitions/t', type: 'object', properties: { name: S, next: { $ref: '#/definitions/n' } } }, t: true },
    }, {})
    expect(pointers(p)).toEqual(['', '/x', '/x/name'])
    expect(withBoundaries(p)).toEqual({ '/x': ['recursion'] })
  })

  it('lists no child without a node', async () => {
    const p = await project(tree, { child: { child: {} } })
    for (const node of p.nodes.values()) {
      for (const child of node.children ?? []) expect(p.nodes.has(child.pointer)).toBe(true)
    }
  })
})

describe('the budget', () => {
  const kdistinct = (k: number) => {
    const props = () => Object.fromEntries(Array.from({ length: k }, (_, j) => [`p${j}`, { $ref: `#/$defs/d${j}` }]))
    const $defs: Record<string, unknown> = {}
    for (let i = 0; i < k; i++) $defs[`d${i}`] = { type: 'object', properties: { [`v${i}`]: S, ...props() } }
    return on2020({ type: 'object', properties: props(), $defs })
  }
  const { $id: _id, ...metaNoId } = metaschemas[0]!
  const strings = Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`s${i}`, S]))

  it('admits 16 recursion-induced objects of an all-to-all schema', async () => {
    const p = await project(kdistinct(6), {})
    expect(p.nodes.size).toBe(45)
    expect(flagged(p)).toBe(38)
    expect(Object.keys(withBoundaries(p))).toEqual(expect.arrayContaining(['/p0/p1', '/p3', '/p4', '/p5']))
  })

  it('bounds the draft-07 metaschema', async () => {
    const p = await project(metaNoId, {})
    expect(p.nodes.size).toBe(412)
    expect(flagged(p)).toBe(367)
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

describe('percent-encoded references', () => {
  const D7 = 'http://json-schema.org/draft-07/schema#'
  const leafObjects = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`o${i}`, { type: 'object', properties: { s: S } }]))

  it.each([D7, 'https://json-schema.org/draft/2020-12/schema'])('resolve like their decoded spelling in %s', async (uri) => {
    const schema = (ref: string) => ({
      $schema: uri,
      type: 'object',
      properties: { a: { $ref: ref } },
      definitions: { $x: { type: 'object', properties: { s: S } }, x: { type: 'object', properties: { s: S } } },
    })
    const encoded = await project(schema('#/definitions/%24x'), {})
    expect(pointers(encoded)).toEqual(['', '/a', '/a/s'])
    expect(pointers(encoded)).toEqual(pointers(await project(schema('#/definitions/x'), {})))
  })

  it('leave a schema without recursion unbudgeted', async () => {
    const p = await project({
      $schema: D7,
      type: 'object',
      properties: { a: { $ref: '#/definitions/%24x', type: 'object', properties: leafObjects } },
      definitions: { $x: true },
    }, {})
    expect(p.nodes.size).toBe(42)
    expect(withBoundaries(p)).toEqual({})
    expect(flagged(p)).toBe(0)
  })

  it('cut a recursion through them by identity', async () => {
    const site = { $ref: '#/definitions/%24x', allOf: [{ $ref: '#/definitions/N' }] }
    const p = await project({
      $schema: D7,
      type: 'object',
      properties: { x: site },
      definitions: { $x: true, N: { type: 'object', properties: { name: S, x: site } } },
    }, {})
    expect(pointers(p)).toEqual(['', '/x', '/x/name'])
    expect(withBoundaries(p)).toEqual({ '/x': ['recursion'] })
    expect(flagged(p)).toBe(0)
  })
})

describe('default sources', () => {
  it('names items as the source for a row past prefixItems', async () => {
    const p = await project(on2020({
      type: 'array',
      prefixItems: [S],
      items: { type: 'object', properties: { a: { type: 'string', default: 'd' } } },
    }), ['x', {}])
    expect(p.nodes.get('/1/a' as never)?.defaultSources).toEqual(['/items/properties/a'])
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
    const runtime = createFormRuntime(await createHyperjumpAdapter(schema), { initialization: 'schema-defaults' })
    expect(runtime.data.getSnapshot()).toEqual({ title: 'x' })
  })
})

describe.each([
  ['draft-07', 'http://json-schema.org/draft-07/schema#'],
  ['2020-12', 'https://json-schema.org/draft/2020-12/schema'],
] as const)('same-location cycles in %s', (_dialect, uri) => {
  const conditional = {
    type: 'object',
    properties: { flag: { type: 'boolean' } },
    allOf: [{ if: { properties: { flag: { const: true } } }, then: { $ref: '#' } }],
  }
  it.each([
    ['a pure $ref cycle', { properties: { p: { $ref: '#/$defs/a' } }, $defs: { a: { $ref: '#/$defs/b' }, b: { $ref: '#/$defs/a' } } }],
    ['root allOf', { allOf: [{ $ref: '#' }] }],
    ['root anyOf', { anyOf: [{ $ref: '#' }] }],
    ['a conditional self-application', conditional],
    ['a conditional self-application under an $id', { $id: 'https://example.com/loop', ...conditional }],
    ['a typed root allOf', { type: 'object', properties: { name: { type: 'string' } }, allOf: [{ $ref: '#' }] }],
  ])('rejects %s at creation', async (_label, schema) => {
    await expect(createHyperjumpAdapter({ $schema: uri, ...schema })).rejects.toMatchObject({ name: 'SameLocationCycleError' })
  })
})

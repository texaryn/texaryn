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

  const nest = (depth: number): Record<string, unknown> => ({ type: 'object', properties: { n: depth === 1 ? { $ref: '#/$defs/d0' } : nest(depth - 1) } })

  it('admits by depth below the anchor past a chain without recursion', async () => {
    const { properties, ...all } = kdistinct(4) as Record<string, unknown>
    const p = await project({ ...all, properties: { a: nest(3), ...(properties as object) } }, {})
    expect(p.nodes.size).toBe(44)
    expect(pointers(p).filter((pointer) => pointer.startsWith('/a'))).toEqual(['/a', '/a/n', '/a/n/n'])
    expect(withBoundaries(p)['/a/n/n']).toEqual(['budget'])
  })

  it('admits ties within a depth in walk order past a chain without recursion', async () => {
    const { properties, ...all } = kdistinct(4) as Record<string, unknown>
    const p = await project({ ...all, properties: { ...(properties as object), a: nest(2) } }, {})
    expect(p.nodes.size).toBe(43)
    expect(pointers(p)).toContain('/p0/p2/p3')
    expect(pointers(p).filter((pointer) => pointer.startsWith('/a'))).toEqual(['/a', '/a/n'])
    expect(withBoundaries(p)['/a/n']).toEqual(['budget'])
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

describe('dependentSchemas in draft-07', () => {
  const D7 = 'http://json-schema.org/draft-07/schema#'
  const allToAll = ($schema: string, k: number) => {
    const site = (j: number) => ({ type: 'object', dependentSchemas: { x: { $ref: `#/definitions/d${j}` } } })
    const sites = () => Object.fromEntries(Array.from({ length: k }, (_, j) => [`p${j}`, site(j)]))
    const definitions = Object.fromEntries(Array.from({ length: k }, (_, i) => [`d${i}`, { type: 'object', properties: { [`v${i}`]: S, ...sites() } }]))
    return { $schema, type: 'object', properties: sites(), definitions }
  }

  it.each([{}, { k: 1, b: {} }])('is ignored beside the fields it would repeat, at %j', async (data) => {
    const p = await project({
      $schema: D7,
      type: 'object',
      properties: { a: S, b: { type: 'object', properties: { c: S } } },
      dependentSchemas: { k: { $ref: '#' } },
    }, data)
    expect(pointers(p)).toEqual(['', '/a', '/b', '/b/c'])
    expect(p.diagnostics).toEqual([])
  })

  it('declares no default through it', async () => {
    const p = await project({
      $schema: D7,
      type: 'object',
      properties: { a: { type: 'string', default: 'x' } },
      dependentSchemas: { k: { properties: { a: { default: 'y' } } } },
    }, { k: 1 })
    expect(p.nodes.get('/a' as never)?.annotations.default).toBe('x')
    expect(p.nodes.get('/a' as never)?.defaultSources).toEqual(['/properties/a'])
  })

  it('adds no member to an all-to-all schema whose sites use it', async () => {
    const p = await project(allToAll(D7, 4), {})
    expect(pointers(p)).toEqual(['', '/p0', '/p1', '/p2', '/p3'])
    expect(withBoundaries(p)).toEqual({})
    expect(flagged(p)).toBe(0)
  })

  it('still budgets the same schema in 2020-12', async () => {
    const p = await project(allToAll('https://json-schema.org/draft/2020-12/schema', 4), {})
    expect(Object.values(withBoundaries(p)).filter((reasons) => reasons?.includes('budget')).length).toBeGreaterThan(0)
  })
})

describe('the siblings of a draft-07 $ref', () => {
  const self = { $ref: '#/properties/p' }
  it.each([
    ['an allOf', { allOf: [self] }],
    ['an anyOf', { anyOf: [self] }],
    ['a oneOf', { oneOf: [self] }],
    ['an if', { if: self }],
    ['a then', { if: { required: ['k'] }, then: self }],
    ['an else', { if: { required: ['k'] }, else: self }],
    ['a dependencies', { dependencies: { k: self } }],
    ['a dependentSchemas', { dependentSchemas: { k: self } }],
    ['a not', { not: self }],
  ])('ignores %s that re-reaches the site, as the dialect does', async (_label, siblings) => {
    const adapter = await createHyperjumpAdapter({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: { p: { $ref: '#/definitions/x', ...siblings } },
      definitions: { x: { type: 'object', properties: { s: S } } },
    })
    for (const data of [{}, { p: { k: 1 } }, { p: { s: 5 } }]) {
      const p = adapter.project(data)
      expect(pointers(p)).toEqual(['', '/p', '/p/s'])
      expect(p.diagnostics).toEqual([])
    }
  })
})

describe('a schema without recursion', () => {
  it.each(['http://json-schema.org/draft-07/schema#', 'https://json-schema.org/draft/2020-12/schema'])('projects and initializes in main\'s order, in %s', async ($schema) => {
    const schema = {
      $schema,
      type: 'object',
      properties: {
        a: { type: 'object', properties: { x: { type: 'object', properties: { y: { type: 'string', default: 'deep' } } }, z: { type: 'string', default: 'shallow' } } },
        b: { type: 'object', properties: { c: { type: 'string', default: 'c' } } },
      },
    }
    expect([...(await project(schema, {})).nodes.keys()]).toEqual(['', '/a', '/a/x', '/a/x/y', '/a/z', '/b', '/b/c'])
    const runtime = createFormRuntime(await createHyperjumpAdapter(schema), { initialization: 'schema-defaults' })
    expect(JSON.stringify(runtime.data.getSnapshot())).toBe('{"a":{"x":{"y":"deep"},"z":"shallow"},"b":{"c":"c"}}')
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

describe('a branch under a boolean if', () => {
  const dialects = [
    ['draft-07', 'http://json-schema.org/draft-07/schema#'],
    ['2020-12', 'https://json-schema.org/draft/2020-12/schema'],
  ] as const
  const forms = [
    ['the else under if: false', false, 'else', 'then'],
    ['the then under if: true', true, 'then', 'else'],
  ] as const

  it.each(dialects.flatMap(([dialect, $schema]) => forms.map(([label, condition, live, dead]) => [label, dialect, $schema, condition, live, dead] as const)))(
    'projects %s with its default and skips the other branch, in %s',
    async (_label, _dialect, $schema, condition, live, dead) => {
      const schema = {
        $schema,
        type: 'object',
        properties: {
          p: { type: 'object', if: condition, [live]: { properties: { y: { type: 'string', default: 'v' } } }, [dead]: { properties: { d: S } } },
        },
      }
      for (const data of [{}, { p: {} }, { p: { y: 'w' } }]) {
        const p = await project(schema, data)
        expect(pointers(p)).toEqual(['', '/p', '/p/y'])
        expect(p.nodes.get('/p/y' as never)).toMatchObject({
          active: true,
          annotations: { default: 'v' },
          defaultSources: [`/properties/p/${live}/properties/y`],
        })
      }
    },
  )

  it.each(dialects)('walks the live else under if: false inside a conditional branch, in %s', async (_dialect, $schema) => {
    const twenty = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`q${i}`, { type: 'object', properties: { s: S } }]))
    const schema = {
      $schema,
      type: 'object',
      properties: {
        b: {
          type: 'object',
          properties: { a: { type: 'object' } },
          if: { required: ['k'] },
          then: { properties: { a: { if: true, else: { properties: twenty } } } },
          else: { properties: { a: { if: false, else: { properties: { y: S } } } } },
        },
      },
    }
    const outline = (p: SchemaProjection) => pointers(p).map((key) => `${key}${p.nodes.get(key)!.active ? '' : '(i)'}`)
    expect(outline(await project(schema, {}))).toEqual(['', '/b', '/b/a', '/b/a/y(i)'])
    expect(outline(await project(schema, { b: { k: 1 } }))).toEqual(['', '/b', '/b/a', '/b/a/y(i)'])
    expect(outline(await project(schema, { b: { a: {} } }))).toEqual(['', '/b', '/b/a', '/b/a/y'])
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

describe('a schema whose reference sites are one object', () => {
  const dialects = [
    ['draft-07', 'http://json-schema.org/draft-07/schema#'],
    ['2019-09', 'https://json-schema.org/draft/2019-09/schema'],
    ['2020-12', 'https://json-schema.org/draft/2020-12/schema'],
  ] as const
  const containers = [
    ['definitions', 'TreeNode', 'TreeNode'],
    ['$defs', 'Tree/Node', 'Tree~1Node'],
  ] as const

  it.each(dialects.flatMap(([dialect, $schema]) => containers.map(([defs, name, spelled]) => [defs, name, dialect, $schema, spelled] as const)))(
    'initializes a tree under %s %s, in %s',
    async (defs, name, _dialect, $schema, spelled) => {
      const site = { $ref: `#/${defs}/${spelled}` }
      const named = { type: 'string', default: 'n' }
      const schema = { $schema, type: 'object', properties: { name: named, child: site }, [defs]: { [name]: { type: 'object', properties: { name: named, child: site } } } }
      const runtime = createFormRuntime(await createHyperjumpAdapter(schema), { initialization: 'schema-defaults' })
      expect(runtime.data.getSnapshot()).toEqual({ name: 'n' })
      expect(runtime.initialization.getSnapshot()).toEqual(expect.objectContaining({
        outcome: 'initialized',
        refusals: [{ location: '/child/name', reason: 'recursive-expansion' }],
      }))
    },
  )
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

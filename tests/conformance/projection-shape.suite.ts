import { describe, it, expect } from 'vitest'
import type { JsonSchemaType, SchemaEvaluationPort } from '@texaryn/core'

type AdapterFactory = (schema: Record<string, unknown>) => Promise<SchemaEvaluationPort>
type AdapterName = 'json-schema-library' | '@hyperjump/json-schema'

const DIALECTS = {
  'draft-07': 'http://json-schema.org/draft-07/schema#',
  '2020-12': 'https://json-schema.org/draft/2020-12/schema',
} as const
type Dialect = keyof typeof DIALECTS

interface Expected {
  nodes: Readonly<Record<string, JsonSchemaType>>
  unlisted?: readonly string[]
  diagnostics?: readonly string[]
}

interface Row {
  id: string
  schema: Record<string, unknown>
  data?: unknown
  expected: Expected
  differs?: Readonly<Record<string, Expected>>
}

const S = { type: 'string' }
const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties })
const ref = { $ref: '#/definitions/n' }
const ambiguous = (pointer: string) => `ambiguous-projection-shape@${pointer}`
const unresolved = (pointer: string) => `unresolved-projection-shape@${pointer}`

const rows: readonly Row[] = [
  { id: 'a typeless root with properties', schema: { properties: { a: S } }, expected: { nodes: { '': 'object', '/a': 'string' } } },
  {
    id: 'a typeless root with required and properties',
    schema: { required: ['a'], properties: { a: S } },
    expected: { nodes: { '': 'object', '/a': 'string' } },
  },
  { id: 'a typeless root with items', schema: { items: S }, expected: { nodes: { '': 'array' } } },
  {
    id: 'a typeless object under a typed one',
    schema: obj({ a: { properties: { b: S } } }),
    expected: { nodes: { '': 'object', '/a': 'object', '/a/b': 'string' } },
  },
  { id: 'a typed object under a typed one', schema: obj({ a: S }), expected: { nodes: { '': 'object', '/a': 'string' } } },
  {
    id: 'a typeless array under a typed object',
    schema: obj({ a: { items: obj({ c: S }) } }),
    expected: { nodes: { '': 'object', '/a': 'array' } },
  },
  {
    id: 'a typeless location with keywords of two types',
    schema: obj({ a: { properties: { b: S }, minItems: 1 } }),
    expected: { nodes: { '': 'object' }, unlisted: ['/a'], diagnostics: [ambiguous('/a')] },
  },
  {
    id: 'a leaf with only an enum under a typeless object',
    schema: obj({ a: { properties: { b: { enum: [1, 2] } } } }),
    expected: { nodes: { '': 'object', '/a': 'object' }, unlisted: ['/a/b'], diagnostics: [unresolved('/a/b')] },
  },
  {
    id: 'a location with an empty schema',
    schema: obj({ a: {} }),
    expected: { nodes: { '': 'object' }, unlisted: ['/a'], diagnostics: [unresolved('/a')] },
  },
  {
    id: 'a location with a boolean schema',
    schema: obj({ a: true }),
    expected: { nodes: { '': 'object' }, unlisted: ['/a'] },
  },
  {
    id: 'a leaf without a type beneath an omitted location',
    schema: obj({ a: { properties: { b: { enum: [1] } }, minItems: 1 } }),
    expected: { nodes: { '': 'object' }, unlisted: ['/a'], diagnostics: [ambiguous('/a')] },
  },
  {
    id: 'a property name schema that declares a type',
    schema: { type: 'object', propertyNames: { type: 'string', maxLength: 3 } },
    data: { foo: 1 },
    expected: { nodes: { '': 'object' } },
  },
  {
    id: 'a typeless object behind a reference',
    schema: { ...obj({ a: ref }), definitions: { n: { properties: { b: S } } } },
    expected: { nodes: { '': 'object', '/a': 'object', '/a/b': 'string' } },
  },
  {
    id: 'a typeless location under allOf',
    schema: { type: 'object', allOf: [{ properties: { a: { properties: { b: S } } } }] },
    expected: { nodes: { '': 'object', '/a': 'object', '/a/b': 'string' } },
  },
  {
    id: 'a typeless branch of a oneOf wrapper the data selects',
    schema: obj({
      a: { oneOf: [{ properties: { b: S }, required: ['b'] }, { properties: { c: S }, required: ['c'] }] },
    }),
    data: { a: { b: 'x' } },
    expected: { nodes: { '': 'object', '/a': 'object', '/a/b': 'string', '/a/c': 'string' } },
  },
  {
    id: 'a typeless row of an array',
    schema: { type: 'array', items: { properties: { b: S } } },
    data: [{}],
    expected: { nodes: { '': 'array', '/0': 'object', '/0/b': 'string' } },
  },
  {
    id: 'typeless rows of an array inside an object',
    schema: obj({ l: { type: 'array', items: { properties: { b: S } } } }),
    data: { l: [{}, {}] },
    expected: { nodes: { '': 'object', '/l': 'array', '/l/0': 'object', '/l/0/b': 'string', '/l/1': 'object', '/l/1/b': 'string' } },
  },
  {
    id: 'a typeless row with an unresolved leaf',
    schema: { type: 'array', items: { properties: { b: { enum: [1] } } } },
    data: [{}],
    expected: { nodes: { '': 'array', '/0': 'object' }, unlisted: ['/0/b'], diagnostics: [unresolved('/0/b')] },
  },
  {
    id: 'a typeless row with keywords of two types',
    schema: { type: 'array', items: { properties: { b: S }, minItems: 1 } },
    data: [{}],
    expected: { nodes: { '': 'array' }, diagnostics: [ambiguous('/0')] },
  },
  {
    id: 'a typeless location whose two positions disagree on the type',
    schema: obj({ a: { properties: { b: S }, anyOf: [{ minItems: 1 }] } }),
    data: { a: {} },
    expected: { nodes: { '': 'object' }, unlisted: ['/a'], diagnostics: [ambiguous('/a')] },
  },
  {
    id: 'a typeless root that only allOf makes an object',
    schema: { allOf: [{ properties: { a: S } }] },
    expected: { nodes: { '': 'object', '/a': 'string' } },
    differs: { 'json-schema-library': { nodes: {}, diagnostics: [unresolved('')] } },
  },
  {
    id: 'a typeless location whose allOf adds keywords of another type',
    schema: obj({ a: { properties: { b: S }, allOf: [{ minItems: 1 }] } }),
    expected: { nodes: { '': 'object' }, unlisted: ['/a'], diagnostics: [ambiguous('/a')] },
    differs: { 'json-schema-library': { nodes: { '': 'object', '/a': 'object', '/a/b': 'string' } } },
  },
  {
    id: 'a typeless location whose live then adds keywords of another type',
    schema: obj({ a: { properties: { b: S }, if: true, then: { minItems: 1 } } }),
    expected: { nodes: { '': 'object' }, unlisted: ['/a'], diagnostics: [ambiguous('/a')] },
    differs: { 'json-schema-library': { nodes: { '': 'object', '/a': 'object', '/a/b': 'string' } } },
  },
  {
    id: 'a reference as the only branch of a oneOf wrapper the data selects',
    schema: { ...obj({ a: { oneOf: [ref] } }), definitions: { n: { properties: { b: S } } } },
    data: { a: {} },
    expected: { nodes: { '': 'object', '/a': 'object', '/a/b': 'string' } },
    differs: { '@hyperjump/json-schema draft-07': { nodes: { '': 'object' }, unlisted: ['/a'] } },
  },
  {
    id: 'typeless branches of a oneOf wrapper no data selects',
    schema: obj({ a: { oneOf: [{ properties: { b: S } }, { properties: { c: S } }] } }),
    expected: { nodes: { '': 'object', '/a': 'object', '/a/b': 'string', '/a/c': 'string' } },
    differs: { '@hyperjump/json-schema': { nodes: { '': 'object' }, unlisted: ['/a'] } },
  },
  {
    id: 'a oneOf wrapper whose branches carry no keyword of any shape',
    schema: obj({ a: { oneOf: [{ minLength: 1 }, { pattern: '^a' }] } }),
    expected: { nodes: { '': 'object' }, unlisted: ['/a'], diagnostics: [unresolved('/a')] },
    differs: { 'json-schema-library': { nodes: { '': 'object', '/a': 'object' } } },
  },
  {
    id: 'an anyOf wrapper whose branches carry no keyword of any shape',
    schema: obj({ a: { anyOf: [{ minLength: 1 }, { pattern: '^a' }] } }),
    expected: { nodes: { '': 'object' }, unlisted: ['/a'], diagnostics: [unresolved('/a')] },
  },
]

const messages = {
  '/a': 'No explicit "type", and keywords from more than one type apply (array, object), so the shape to render is undecidable. Declare "type" on this schema to resolve it.',
  '/c': 'No explicit "type", and no keyword that implies one, so there is no shape to render. Declare "type" on this schema. An "enum" alone does not imply a type, because its members may be of different types.',
  '/d': 'No explicit "type", and no keyword that implies one, so there is no shape to render. Declare "type" on this schema.',
}

const orphans = (nodes: ReadonlyMap<string, unknown>) =>
  [...nodes.keys()].filter((pointer) => pointer !== '' && !nodes.has(pointer.slice(0, pointer.lastIndexOf('/'))))

// A typeless location takes the shape its keywords imply; one that cannot be given a shape is left out with
// everything beneath it, reported, and still listed by its parent. `differs` pins where an adapter departs.
export function projectionShapeSuite(name: AdapterName, createAdapter: AdapterFactory): void {
  describe(`${name}: a location without a type`, () => {
    describe.each(Object.keys(DIALECTS) as Dialect[])('%s', (dialect) => {
      it.each(rows)('projects $id', async ({ schema, data = {}, expected, differs }) => {
        const want = differs?.[`${name} ${dialect}`] ?? differs?.[name] ?? expected
        const port = await createAdapter({ $schema: DIALECTS[dialect], ...schema })
        const projection = port.project(structuredClone(data))
        const nodes = new Map<string, unknown>(projection.nodes)

        expect(Object.fromEntries([...projection.nodes].map(([pointer, node]) => [pointer, node.type]))).toEqual(want.nodes)
        expect(orphans(nodes)).toEqual([])
        expect(
          [...projection.nodes.values()]
            .flatMap((node) => (node.children ?? []).map((child) => child.pointer as string))
            .filter((pointer) => !nodes.has(pointer))
            .sort(),
        ).toEqual([...(want.unlisted ?? [])].sort())
        expect((projection.diagnostics ?? []).map((d) => `${d.code}@${d.pointer}`).sort()).toEqual(
          [...(want.diagnostics ?? [])].sort(),
        )
      })
    })

    describe.each(Object.keys(DIALECTS) as Dialect[])('a typeless container with an applicator in %s', (dialect) => {
      const applicators: Record<string, Record<string, unknown>> = {
        'an if and then': { if: { required: ['b'] }, then: { required: ['b'] } },
        'an anyOf': { anyOf: [{ required: ['b'] }, { required: ['c'] }] },
        'a dependent schema': {
          [dialect === 'draft-07' ? 'dependencies' : 'dependentSchemas']: { b: { required: ['c'] } },
        },
      }
      const activeFlags = async (container: Record<string, unknown>) => {
        const port = await createAdapter({ $schema: DIALECTS[dialect], ...obj({ a: container }) })
        return Object.fromEntries([...port.project({}).nodes].map(([pointer, node]) => [pointer, node.active]))
      }

      it.each(Object.entries(applicators))('is active as its typed twin is, with %s and no data', async (_label, applicator) => {
        const container = { properties: { b: S }, ...applicator }
        const typeless = await activeFlags(container)
        const typed = await activeFlags({ type: 'object', ...container })
        expect(typeless['/a']).toBe(true)
        expect(typeless).toEqual(typed)
      })
    })

    it.each(Object.keys(DIALECTS) as Dialect[])('reports nothing for a oneOf wrapper whatever the data selects in %s', async (dialect) => {
      const schema = obj({
        a: { oneOf: [{ properties: { b: S }, required: ['b'] }, { properties: { c: S }, required: ['c'] }] },
      })
      const port = await createAdapter({ $schema: DIALECTS[dialect], ...schema })
      for (const data of [{}, { a: {} }, { a: { b: 'x' } }]) {
        expect(port.project(structuredClone(data)).diagnostics ?? []).toEqual([])
      }
    })

    it.each(Object.keys(DIALECTS) as Dialect[])('words each diagnostic the same way in %s', async (dialect) => {
      const schema = obj({ a: { properties: { b: S }, minItems: 1 }, c: { enum: [1] }, d: {} })
      const projection = (await createAdapter({ $schema: DIALECTS[dialect], ...schema })).project({})
      expect(Object.fromEntries((projection.diagnostics ?? []).map((d) => [d.pointer, d.message]))).toEqual(messages)
    })
  })
}

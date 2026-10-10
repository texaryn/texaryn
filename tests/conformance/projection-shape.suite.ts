import { describe, it, expect } from 'vitest'
import type { JsonPointer, JsonSchemaType, SchemaEvaluationPort } from '@texaryn/core'

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
  reason?: string
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

const twoScalars = { oneOf: [S, { type: 'number' }] }
const inactiveTypeRows: readonly Row[] = [
  {
    id: 'a typeless object beside a oneOf of two scalar types no data selects',
    schema: obj({ c: { properties: { d: S }, ...twoScalars } }),
    expected: { nodes: { '': 'object', '/c': 'object', '/c/d': 'string' } },
  },
  {
    id: 'a typeless object beside a oneOf of two scalar types in the other order',
    schema: obj({ c: { properties: { d: S }, oneOf: [...twoScalars.oneOf].reverse() } }),
    expected: { nodes: { '': 'object', '/c': 'object', '/c/d': 'string' } },
  },
  {
    id: 'a oneOf wrapper of two scalar types no data selects',
    schema: obj({ c: twoScalars }),
    expected: { nodes: { '': 'object', '/c': 'object' } },
    differs: {
      '@hyperjump/json-schema': {
        nodes: { '': 'object' },
        unlisted: ['/c'],
        reason: 'a branch that does not apply decides no type when the branches disagree',
      },
    },
  },
  {
    id: 'a oneOf wrapper whose branches declare one scalar type and no data selects',
    schema: obj({ c: { oneOf: [{ type: 'string', minLength: 1 }, { type: 'string', maxLength: 3 }] } }),
    expected: { nodes: { '': 'object', '/c': 'object' } },
    differs: {
      '@hyperjump/json-schema': {
        nodes: { '': 'object', '/c': 'string' },
        reason: 'every branch that could apply declares the same type',
      },
    },
  },
  {
    id: 'a oneOf wrapper of a scalar and an object no data selects',
    schema: obj({ c: { oneOf: [S, obj({ y: S })] } }),
    expected: { nodes: { '': 'object', '/c': 'object', '/c/y': 'string' } },
  },
  {
    id: 'a oneOf wrapper of two objects no data selects',
    schema: obj({ c: { oneOf: [obj({ x: S }), obj({ y: S })] } }),
    expected: { nodes: { '': 'object', '/c': 'object', '/c/x': 'string', '/c/y': 'string' } },
  },
  {
    id: 'an anyOf wrapper of an object with properties and an array no data selects',
    schema: obj({ c: { anyOf: [obj({ y: S }), { type: 'array' }] } }),
    expected: { nodes: { '': 'object', '/c': 'array' } },
    differs: {
      '@hyperjump/json-schema': {
        nodes: { '': 'object', '/c': 'object', '/c/y': 'string' },
        reason: 'only an object holds the children a branch lists',
      },
    },
  },
  {
    id: 'an anyOf wrapper of an object and an array no data selects',
    schema: obj({ c: { anyOf: [{ type: 'object' }, { type: 'array' }] } }),
    expected: { nodes: { '': 'object', '/c': 'array' } },
    differs: {
      '@hyperjump/json-schema': {
        nodes: { '': 'object' },
        unlisted: ['/c'],
        reason: 'a branch that does not apply decides no type when the branches disagree',
      },
    },
  },
  {
    id: 'an explicit type that applies beside a type a branch that does not apply declares',
    schema: { ...obj({ c: { oneOf: [S, { type: 'boolean' }] } }), allOf: [{ properties: { c: { type: 'number' } } }] },
    expected: { nodes: { '': 'object', '/c': 'number' } },
  },
  {
    id: 'an explicit string type with properties beneath it',
    schema: obj({ c: { type: 'string', properties: { x: S } } }),
    expected: { nodes: { '': 'object', '/c': 'string' } },
  },
]

const flagged = { a: { flag: true } }
const conditionals: Record<string, Record<string, unknown>> = {
  'a then': obj({ a: { properties: { b: S }, if: { required: ['flag'] }, then: { minItems: 1 } } }),
  'an else': obj({ a: { properties: { b: S }, if: { required: ['flag'] }, else: { minItems: 1 } } }),
  'a dependent schema': obj({ a: { properties: { b: S }, dependentSchemas: { flag: { minItems: 1 } } } }),
  'a schema dependency': obj({ a: { properties: { b: S }, dependencies: { flag: { minItems: 1 } } } }),
}
const conditionalRows: readonly Row[] = [
  ...[{ a: {} }, flagged].map((data): Row => ({
    id: `a typeless location whose then adds keywords of another type with ${JSON.stringify(data)}`,
    schema: conditionals['a then']!,
    data,
    expected: { nodes: { '': 'object', '/a': 'object', '/a/b': 'string' } },
  })),
  ...(['a dependent schema', 'a schema dependency'] as const).map((label): Row => ({
    id: `a typeless location whose present ${label.slice(2)} adds keywords of another type`,
    schema: conditionals[label]!,
    data: flagged,
    expected: { nodes: { '': 'object', '/a': 'object', '/a/b': 'string' } },
  })),
]

const rows: readonly Row[] = [
  { id: 'a typeless root with properties', schema: { properties: { a: S } }, expected: { nodes: { '': 'object', '/a': 'string' } } },
  {
    id: 'a data member governed by additionalProperties',
    schema: {
      patternProperties: { '^matched': { type: 'number' } },
      additionalProperties: { type: 'string' },
    },
    data: { matched: 1, note: 'hello' },
    expected: { nodes: { '': 'object', '/note': 'string' } },
    differs: {
      '@hyperjump/json-schema': {
        nodes: { '': 'object', '/matched': 'number', '/note': 'string' },
        reason: 'the adapter also projects members matched by patternProperties',
      },
    },
  },
  {
    id: 'a nested data member governed by additionalProperties',
    schema: {
      additionalProperties: { type: 'object', properties: { label: S } },
    },
    data: { extra: { label: 'value' } },
    expected: { nodes: { '': 'object', '/extra': 'object', '/extra/label': 'string' } },
  },
  {
    id: 'a required member governed by additionalProperties before data exists',
    schema: { required: ['name'], additionalProperties: S },
    expected: { nodes: { '': 'object', '/name': 'string' } },
  },
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
    id: 'a typeless row beside a oneOf branch that does not apply and declares keywords of another family',
    schema: obj({
      a: {
        type: 'array',
        items: { properties: { x: S } },
        oneOf: [{ type: 'string', items: { minItems: 1 } }, { type: 'number' }],
      },
    }),
    data: { a: [{}] },
    expected: { nodes: { '': 'object', '/a': 'array', '/a/0': 'object', '/a/0/x': 'string' } },
  },
  {
    id: 'an inactive oneOf branch cannot change a typeless property inside an array row',
    schema: obj({
      rows: {
        type: 'array',
        items: {
          properties: {
            values: {
              type: 'array',
              items: {
                properties: {
                  entry: { properties: { name: S } },
                },
              },
            },
          },
        },
        oneOf: [
          {
            minItems: 2,
            items: {
              properties: {
                values: {
                  items: {
                    properties: {
                      entry: { items: S },
                    },
                  },
                },
              },
            },
          },
          { maxItems: 0 },
        ],
      },
    }),
    data: { rows: [{ values: [{}] }] },
    expected: {
      nodes: {
        '': 'object',
        '/rows': 'array',
        '/rows/0': 'object',
        '/rows/0/values': 'array',
        '/rows/0/values/0': 'object',
        '/rows/0/values/0/entry': 'object',
        '/rows/0/values/0/entry/name': 'string',
      },
    },
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
    expected: { nodes: { '': 'object', '/a': 'object', '/a/b': 'string' } },
  },
  ...conditionalRows,
  {
    id: 'a reference as the only branch of a oneOf wrapper the data selects',
    schema: { ...obj({ a: { oneOf: [ref] } }), definitions: { n: { properties: { b: S } } } },
    data: { a: {} },
    expected: { nodes: { '': 'object', '/a': 'object', '/a/b': 'string' } },
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
  {
    id: 'a shape-less location that an inactive then wraps in a oneOf',
    schema: {
      ...obj({ c: { title: 'C' } }),
      if: { required: ['x'] },
      then: { properties: { c: { oneOf: [{ minItems: 1 }, { minLength: 1 }] } } },
    },
    expected: { nodes: { '': 'object' }, unlisted: ['/c'], diagnostics: [unresolved('/c')] },
  },
  {
    id: 'a shape-less location that an unselected oneOf branch wraps in a oneOf',
    schema: {
      ...obj({ c: { title: 'C' } }),
      oneOf: [
        { required: ['x'], properties: { c: { oneOf: [{ minItems: 1 }, { minLength: 1 }] } } },
        { required: ['y'] },
      ],
    },
    data: { y: 1 },
    expected: { nodes: { '': 'object' }, unlisted: ['/c'], diagnostics: [unresolved('/c')] },
  },
  {
    id: 'a oneOf wrapper holding an anyOf whose branches carry no keyword of any shape',
    schema: obj({ a: { oneOf: [{ anyOf: [{ minLength: 1 }] }] } }),
    expected: { nodes: { '': 'object' }, unlisted: ['/a'], diagnostics: [unresolved('/a')] },
  },
  {
    id: 'a oneOf wrapper whose allOf branch mixes keywords of two types',
    schema: obj({ a: { oneOf: [{ allOf: [{ properties: { b: S } }, { minItems: 1 }] }] } }),
    expected: { nodes: { '': 'object' }, unlisted: ['/a'], diagnostics: [ambiguous('/a')] },
    differs: {
      '@hyperjump/json-schema': { nodes: { '': 'object' }, unlisted: ['/a'], diagnostics: [unresolved('/a')] },
    },
  },
  ...inactiveTypeRows,
]

const messages = {
  '/a': 'No explicit "type", and keywords from more than one type apply (array, object), so the shape to render is undecidable. Declare "type" on this schema to resolve it.',
  '/c': 'No explicit "type", and no keyword that implies one, so there is no shape to render. Declare "type" on this schema. An "enum" alone does not imply a type, because its members may be of different types.',
  '/d': 'No explicit "type", and no keyword that implies one, so there is no shape to render. Declare "type" on this schema.',
}

const unreachable = (nodes: ReadonlyMap<string, { type: JsonSchemaType }>) =>
  [...nodes.keys()].filter((pointer) => {
    const parent = pointer === '' ? undefined : nodes.get(pointer.slice(0, pointer.lastIndexOf('/')))
    return pointer !== '' && parent?.type !== 'object' && parent?.type !== 'array'
  })

// A typeless location takes the shape its keywords imply; one that cannot be given a shape is left out with
// everything beneath it, reported, and still listed by its parent, where a recursion cut drops the entry
// (recursive-ref.suite.ts). Every node's parent is an object or array. `differs` pins where an adapter departs.
export function projectionShapeSuite(name: AdapterName, createAdapter: AdapterFactory): void {
  describe(`${name}: a location without a type`, () => {
    describe.each(Object.keys(DIALECTS) as Dialect[])('%s', (dialect) => {
      it.each(rows)('projects $id', async ({ schema, data = {}, expected, differs }) => {
        const want = differs?.[`${name} ${dialect}`] ?? differs?.[name] ?? expected
        const port = await createAdapter({ $schema: DIALECTS[dialect], ...schema })
        const projection = port.project(structuredClone(data))
        const nodes = new Map<string, { type: JsonSchemaType }>(projection.nodes)

        expect(Object.fromEntries([...projection.nodes].map(([pointer, node]) => [pointer, node.type])), want.reason).toEqual(want.nodes)
        expect(unreachable(nodes)).toEqual([])
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

    it.each(Object.keys(DIALECTS) as Dialect[])(
      'keeps a typed object active when an allOf member has no selected branch in %s',
      async (dialect) => {
        const conditional = {
          if: { required: ['enabled'] },
          then: { properties: { detail: S } },
        }
        const schemas = [
          {
            type: 'object',
            properties: { name: S },
            allOf: [conditional],
          },
          {
            allOf: [conditional, { type: 'object', properties: { name: S } }],
          },
        ]

        for (const objectSchema of schemas) {
          const port = await createAdapter({
            $schema: DIALECTS[dialect],
            ...obj({ a: objectSchema }),
          })
          for (const data of [{}, { a: {} }]) {
            const projection = port.project(data)
            expect(projection.nodes.get('/a' as JsonPointer)?.active).toBe(true)
            expect(projection.nodes.get('/a/name' as JsonPointer)?.active).toBe(true)
            expect(projection.nodes.get('/a/detail' as JsonPointer)?.active).toBe(false)
          }
        }
      },
    )

    it.each(Object.keys(DIALECTS) as Dialect[])(
      'keeps an inferred object active beside an unresolved oneOf in an allOf member in %s',
      async (dialect) => {
        const port = await createAdapter({
          $schema: DIALECTS[dialect],
          ...obj({
            p: {
              properties: { name: S },
              allOf: [
                {
                  oneOf: [
                    { properties: { first: S }, required: ['first'] },
                    { properties: { second: S }, required: ['second'] },
                  ],
                },
              ],
            },
          }),
        })

        for (const data of [{}, { p: {} }]) {
          const projection = port.project(data)
          expect(projection.nodes.get('/p' as JsonPointer)?.active).toBe(true)
          expect(projection.nodes.get('/p/name' as JsonPointer)?.active).toBe(true)
        }
      },
    )

    it.each(Object.keys(DIALECTS) as Dialect[])(
      'keeps a typed row active beside a branch that does not apply and declares the row as a oneOf wrapper in %s',
      async (dialect) => {
        const wrapper = { oneOf: [obj({ x: S }), S] }
        const schema = obj({
          a: {
            type: 'array',
            items: { type: ['object', 'null'], properties: { x: S } },
            oneOf: [{ minItems: 1, items: wrapper }, { maxItems: 0 }],
          },
        })
        const port = await createAdapter({ $schema: DIALECTS[dialect], ...schema })
        expect(port.project({ a: [null] }).nodes.get('/a/0' as JsonPointer)?.active).toBe(true)
      },
    )

    it.each(Object.keys(DIALECTS) as Dialect[])('reports nothing for a oneOf wrapper whatever the data selects in %s', async (dialect) => {
      const schema = obj({
        a: { oneOf: [{ properties: { b: S }, required: ['b'] }, { properties: { c: S }, required: ['c'] }] },
      })
      const port = await createAdapter({ $schema: DIALECTS[dialect], ...schema })
      for (const data of [{}, { a: {} }, { a: { b: 'x' } }]) {
        expect(port.project(structuredClone(data)).diagnostics ?? []).toEqual([])
      }
    })

    it.each(Object.keys(DIALECTS) as Dialect[])(
      'keeps an unresolved oneOf object wrapper inactive in %s',
      async (dialect) => {
        const schema = obj({
          a: {
            oneOf: [
              { type: 'object', properties: { b: S }, required: ['b'] },
              { type: 'object', properties: { c: S }, required: ['c'] },
            ],
          },
        })
        const port = await createAdapter({ $schema: DIALECTS[dialect], ...schema })

        for (const data of [{}, { a: {} }]) {
          expect(port.project(data).nodes.get('/a' as JsonPointer)?.active).toBe(false)
        }
      },
    )

    it.each(Object.keys(DIALECTS) as Dialect[])(
      'keeps an unresolved oneOf wrapper inactive when it also declares properties in %s',
      async (dialect) => {
        const port = await createAdapter({
          $schema: DIALECTS[dialect],
          ...obj({
            a: {
              properties: { name: S },
              oneOf: [
                { type: 'object', required: ['first'] },
                { type: 'object', required: ['second'] },
              ],
            },
          }),
        })

        for (const data of [{}, { a: {} }]) {
          expect(port.project(data).nodes.get('/a' as JsonPointer)?.active).toBe(false)
        }
      },
    )

    it.each(Object.keys(DIALECTS) as Dialect[])(
      'keeps selected reference-only oneOf branches active in %s',
      async (dialect) => {
        const definitions = dialect === 'draft-07' ? 'definitions' : '$defs'
        const schema = {
          $schema: DIALECTS[dialect],
          type: 'object',
          properties: {
            a: {
              oneOf: [
                { $ref: `#/${definitions}/A` },
                { type: 'null' },
              ],
            },
          },
          [definitions]: {
            A: {
              type: 'object',
              properties: {
                b: {
                  oneOf: [
                    { $ref: `#/${definitions}/B` },
                    { type: 'null' },
                  ],
                },
              },
            },
            B: { type: 'object', properties: { leaf: S } },
          },
        }
        const port = await createAdapter(schema)
        const data = { a: { b: {} } }

        expect((await port.validate(data)).valid).toBe(true)
        const projection = port.project(data)
        for (const pointer of ['/a', '/a/b', '/a/b/leaf']) {
          const node = projection.nodes.get(pointer as JsonPointer)
          expect(node?.active, pointer).toBe(true)
          expect(node?.provisional ?? false).toBe(false)
          expect(node?.recursiveExpansion ?? false).toBe(false)
        }
      },
    )

    it.each(Object.keys(DIALECTS) as Dialect[])(
      'does not select a reference-only oneOf branch when its target is invalid in %s',
      async (dialect) => {
        const definitions = dialect === 'draft-07' ? 'definitions' : '$defs'
        const port = await createAdapter({
          $schema: DIALECTS[dialect],
          ...obj({
            a: {
              oneOf: [
                { $ref: `#/${definitions}/A` },
                { type: 'null' },
              ],
            },
          }),
          [definitions]: {
            A: { ...obj({ required: { type: 'string' } }), required: ['required'] },
          },
        })
        const data = { a: {} }

        expect((await port.validate(data)).valid).toBe(false)
        const projection = port.project(data)
        expect(projection.nodes.get('/a' as JsonPointer)?.active).toBe(false)
        expect(projection.nodes.get('/a/required' as JsonPointer)?.active).toBe(false)
      },
    )

    it.each(Object.keys(DIALECTS) as Dialect[])(
      'keeps reference-only oneOf ambiguous when two targets validate in %s',
      async (dialect) => {
        const definitions = dialect === 'draft-07' ? 'definitions' : '$defs'
        const target = { ...obj({ required: { type: 'string' } }), required: ['required'] }
        const port = await createAdapter({
          $schema: DIALECTS[dialect],
          ...obj({
            a: {
              oneOf: [
                { $ref: `#/${definitions}/A` },
                { $ref: `#/${definitions}/B` },
              ],
            },
          }),
          [definitions]: { A: target, B: target },
        })
        const data = { a: { required: 'present' } }

        expect((await port.validate(data)).valid).toBe(false)
        const projection = port.project(data)
        expect(projection.nodes.get('/a' as JsonPointer)?.active).toBe(false)
        expect(projection.nodes.get('/a/required' as JsonPointer)?.active).toBe(false)
      },
    )

    it.each(Object.keys(DIALECTS) as Dialect[])(
      'keeps a selected then reference active in %s',
      async (dialect) => {
        const definitions = dialect === 'draft-07' ? 'definitions' : '$defs'
        const port = await createAdapter({
          $schema: DIALECTS[dialect],
          ...obj({
            child: {
              type: 'object',
              if: { type: 'object' },
              then: { $ref: `#/${definitions}/Selected` },
            },
          }),
          [definitions]: {
            Selected: { type: 'object', properties: { name: S } },
          },
        })
        const data = { child: {} }

        expect((await port.validate(data)).valid).toBe(true)
        const name = port.project(data).nodes.get('/child/name' as JsonPointer)
        expect(name?.active).toBe(true)
        expect(name?.provisional ?? false).toBe(false)
        expect(name?.recursiveExpansion ?? false).toBe(false)
      },
    )

    it.each(Object.keys(DIALECTS) as Dialect[])(
      'keeps a selected then reference active through an allOf reference in %s',
      async (dialect) => {
        const definitions = dialect === 'draft-07' ? 'definitions' : '$defs'
        const port = await createAdapter({
          $schema: DIALECTS[dialect],
          ...obj({
            child: {
              type: 'object',
              if: { type: 'object' },
              then: { $ref: `#/${definitions}/Selected` },
            },
          }),
          [definitions]: {
            Selected: {
              type: 'object',
              allOf: [{ $ref: `#/${definitions}/Fields` }],
            },
            Fields: { type: 'object', properties: { name: S } },
          },
        })
        const data = { child: {} }

        expect((await port.validate(data)).valid).toBe(true)
        const name = port.project(data).nodes.get('/child/name' as JsonPointer)
        expect(name?.active).toBe(true)
        expect(name?.provisional ?? false).toBe(false)
      },
    )

    it.each(Object.keys(DIALECTS) as Dialect[])(
      'keeps an unselected then reference inactive in %s',
      async (dialect) => {
        const definitions = dialect === 'draft-07' ? 'definitions' : '$defs'
        const port = await createAdapter({
          $schema: DIALECTS[dialect],
          ...obj({
            child: {
              type: 'object',
              if: { required: ['enabled'] },
              then: { $ref: `#/${definitions}/Selected` },
              else: { properties: { reason: S } },
            },
          }),
          [definitions]: {
            Selected: { type: 'object', properties: { name: S }, required: ['name'] },
          },
        })
        const data = { child: {} }

        expect((await port.validate(data)).valid).toBe(true)
        const projection = port.project(data)
        expect(projection.nodes.get('/child/name' as JsonPointer)?.active).toBe(false)
        expect(projection.nodes.get('/child/reason' as JsonPointer)?.active).toBe(true)
      },
    )

    it.each(Object.keys(DIALECTS) as Dialect[])(
      'selects an absent child conditional without changing its ancestor branch in %s',
      async (dialect) => {
        const port = await createAdapter({
          $schema: DIALECTS[dialect],
          type: 'object',
          if: { required: ['child'] },
          then: { properties: { child: { type: 'object', properties: { wrong: S } } } },
          else: {
            properties: {
              child: {
                type: 'object',
                if: { type: 'object' },
                then: { properties: { name: S } },
                else: { properties: { reason: S } },
              },
            },
          },
        })
        const absent = port.project({})
        expect(absent.nodes.get('/child/name' as JsonPointer)?.active).toBe(true)
        expect(absent.nodes.get('/child/reason' as JsonPointer)?.active ?? false).toBe(false)
        expect(absent.nodes.get('/child/wrong' as JsonPointer)?.active ?? false).toBe(false)

        const present = port.project({ child: {} })
        expect(present.nodes.get('/child/name' as JsonPointer)?.active ?? false).toBe(false)
        expect(present.nodes.get('/child/wrong' as JsonPointer)?.active).toBe(true)
      },
    )

    it.each(Object.keys(DIALECTS) as Dialect[])(
      'does not reuse root reference validity inside a nested resource in %s',
      async (dialect) => {
        const definitions = dialect === 'draft-07' ? 'definitions' : '$defs'
        const nestedResource = {
          $id: 'https://example.com/wrapper',
          [definitions]: {
            T: {
              type: 'object',
              properties: { nested: S },
              required: ['nested'],
            },
          },
          oneOf: [
            { $ref: `#/${definitions}/T` },
            { type: 'null' },
          ],
        }
        const port = await createAdapter({
          $schema: DIALECTS[dialect],
          type: 'object',
          properties: {
            p: {
              allOf: [{ $ref: `#/${definitions}/Wrapper` }],
              not: { $ref: `#/${definitions}/T` },
            },
          },
          [definitions]: {
            T: { type: 'object', properties: { root: S } },
            Wrapper: nestedResource,
          },
        })
        const data = { p: { root: 'present' } }

        expect((await port.validate(data)).valid).toBe(false)
        const projection = port.project(data)
        expect(projection.nodes.get('/p/root' as JsonPointer)?.active ?? false).toBe(false)
      },
    )

    it.each(Object.keys(DIALECTS) as Dialect[])(
      'reports nothing for a wrapper nested in a wrapper whatever the data selects in %s',
      async (dialect) => {
        const wrappers: Record<string, Record<string, unknown>> = {
          'a oneOf holding an anyOf': { oneOf: [{ anyOf: [{ minItems: 1 }] }] },
          'a oneOf holding an allOf of an anyOf': { oneOf: [{ allOf: [{ anyOf: [{ minItems: 1 }] }] }] },
          'a oneOf holding an allOf': { oneOf: [{ allOf: [{ minItems: 1 }] }] },
          'a oneOf holding a reference to an anyOf': { oneOf: [ref] },
        }
        for (const [label, wrapper] of Object.entries(wrappers)) {
          const port = await createAdapter({
            $schema: DIALECTS[dialect],
            ...obj({ a: wrapper }),
            definitions: { n: { anyOf: [{ minItems: 1 }] } },
          })
          for (const data of [{}, { a: [1] }]) {
            expect(
              port.project(structuredClone(data)).diagnostics ?? [],
              `${label} with ${JSON.stringify(data)}`,
            ).toEqual([])
          }
        }
      },
    )

    describe.each(Object.keys(DIALECTS) as Dialect[])('a conditional branch in %s', (dialect) => {
      it.each(Object.entries(conditionals))('projects the same shape whether or not %s applies', async (_label, schema) => {
        const port = await createAdapter({ $schema: DIALECTS[dialect], ...schema })
        const [absent, present] = [{ a: {} }, flagged].map((data) => {
          const projection = port.project(structuredClone(data))
          return {
            nodes: Object.fromEntries([...projection.nodes].map(([pointer, node]) => [pointer, node.type])),
            diagnostics: projection.diagnostics ?? [],
          }
        })
        expect(present).toEqual(absent)
        expect(present.diagnostics).toEqual([])
      })
    })

    it.each(Object.keys(DIALECTS) as Dialect[])('words each diagnostic the same way in %s', async (dialect) => {
      const schema = obj({ a: { properties: { b: S }, minItems: 1 }, c: { enum: [1] }, d: {} })
      const projection = (await createAdapter({ $schema: DIALECTS[dialect], ...schema })).project({})
      expect(Object.fromEntries((projection.diagnostics ?? []).map((d) => [d.pointer, d.message]))).toEqual(messages)
    })
  })
}

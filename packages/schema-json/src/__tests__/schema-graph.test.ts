import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createJsonSchemaAdapter, SameLocationCycleError } from '../index.js'
import { buildSchemaGraph, cyclicPositions, rejectSameLocationCycles } from '../schema-graph.js'
import type { Dialect } from '../dialect.js'

const DIALECT_URI: Record<Dialect, string> = {
  'draft-07': 'http://json-schema.org/draft-07/schema#',
  '2019-09': 'https://json-schema.org/draft/2019-09/schema',
  '2020-12': 'https://json-schema.org/draft/2020-12/schema',
}
const inDialect = (dialect: Dialect, schema: Record<string, unknown>) => ({ $schema: DIALECT_URI[dialect], ...schema })
const conditional = {
  type: 'object',
  properties: { flag: { type: 'boolean' } },
  allOf: [{ if: { properties: { flag: { const: true } } }, then: { $ref: '#' } }],
}

describe.each(['draft-07', '2020-12'] as const)('same-location cycles in %s', (dialect) => {
  it.each([
    ['a pure $ref cycle', { properties: { p: { $ref: '#/$defs/a' } }, $defs: { a: { $ref: '#/$defs/b' }, b: { $ref: '#/$defs/a' } } }],
    ['root allOf', { allOf: [{ $ref: '#' }] }],
    ['root anyOf', { anyOf: [{ $ref: '#' }] }],
    ['a conditional self-application', conditional],
    ['a conditional self-application under an $id', { $id: 'https://example.com/loop', ...conditional }],
    ['a typed root allOf', { type: 'object', properties: { name: { type: 'string' } }, allOf: [{ $ref: '#' }] }],
  ])('rejects %s at creation', async (_label, schema) => {
    const created = createJsonSchemaAdapter(inDialect(dialect, schema))
    await expect(created).rejects.toBeInstanceOf(SameLocationCycleError)
    await expect(created).rejects.toThrow(/applies itself to the instance location/)
  })

  it.each([
    ['recursion through a property', { type: 'object', properties: { next: { $ref: '#' } } }],
    ['a conditional that recurses through a property', { type: 'object', if: { required: ['x'] }, then: { properties: { next: { $ref: '#' } } } }],
    ['if false', { if: false, then: { $ref: '#' } }],
    ['if true', { if: true, else: { $ref: '#' } }],
    ['then without if', { then: { $ref: '#' } }],
  ])('constructs %s', async (_label, schema) => {
    const adapter = await createJsonSchemaAdapter(inDialect(dialect, schema))
    expect((await adapter.validate({})).valid).toBe(true)
  })
})

describe('reference keywords by dialect', () => {
  it.each([
    ['draft-07', { $dynamicRef: '#' }],
    ['2020-12', { $recursiveRef: '#' }],
    ['draft-07', { dependentSchemas: { a: { $ref: '#' } } }],
  ] as const)('%s ignores a keyword of another dialect: %j', async (dialect, schema) => {
    const adapter = await createJsonSchemaAdapter(inDialect(dialect, schema))
    expect((await adapter.validate({ a: 1 })).valid).toBe(true)
  })

  it.each([
    ['2019-09', { $recursiveRef: '#' }],
    ['2020-12', { $dynamicRef: '#' }],
    ['2020-12', { $dynamicAnchor: 'node', allOf: [{ $dynamicRef: '#node' }] }],
  ] as const)('%s rejects its own dynamic self-reference: %j', async (dialect, schema) => {
    await expect(createJsonSchemaAdapter(inDialect(dialect, schema))).rejects.toBeInstanceOf(
      SameLocationCycleError,
    )
  })

  // Concern: json-schema-library also evaluates 'dependencies' past draft-07, so the graph
  // now adds this edge for every dialect instead of only where the reference already had it.
  it('2020-12 rejects a same-location cycle through dependencies, which the library evaluates there too', async () => {
    await expect(
      createJsonSchemaAdapter(inDialect('2020-12', { dependencies: { a: { $ref: '#' } } })),
    ).rejects.toBeInstanceOf(SameLocationCycleError)
  })
})

describe('the error', () => {
  it('names every cycle it found', async () => {
    const error = await createJsonSchemaAdapter({ allOf: [{ $ref: '#' }] }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SameLocationCycleError)
    expect((error as SameLocationCycleError).name).toBe('SameLocationCycleError')
    expect((error as SameLocationCycleError).positions).toEqual([['#', '#/allOf/0']])
  })
})

describe('recursive positions', () => {
  it('marks the positions on a cycle and nothing else', () => {
    const graph = buildSchemaGraph(
      { type: 'object', properties: { leaf: { type: 'string' }, next: { $ref: '#/$defs/n' } }, $defs: { n: { type: 'object', properties: { again: { $ref: '#/$defs/n' } } } } },
      '2020-12',
    )
    const cyclic = cyclicPositions(graph)
    expect(cyclic.has('#/$defs/n')).toBe(true)
    expect(cyclic.has('#/$defs/n/properties/again')).toBe(true)
    expect(cyclic.has('#/properties/leaf')).toBe(false)
  })
})

describe('the vendored JSON Schema Test Suite', () => {
  const root = fileURLToPath(new URL('../../../../tests/conformance/json-schema-test-suite/tests', import.meta.url))
  const dialects: Record<string, Dialect> = { draft7: 'draft-07', 'draft2019-09': '2019-09', 'draft2020-12': '2020-12' }
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      return statSync(path).isDirectory() ? files(path) : name.endsWith('.json') ? [path] : []
    })

  it('rejects none of its schemas', () => {
    let count = 0
    const rejected: string[] = []
    for (const [folder, dialect] of Object.entries(dialects)) {
      for (const file of files(join(root, folder))) {
        for (const group of JSON.parse(readFileSync(file, 'utf8')) as { description: string; schema: unknown }[]) {
          count += 1
          try {
            rejectSameLocationCycles(buildSchemaGraph(group.schema, dialect))
          } catch {
            rejected.push(`${file}: ${group.description}`)
          }
        }
      }
    }
    expect(rejected).toEqual([])
    expect(count).toBeGreaterThan(1200)
  })
})

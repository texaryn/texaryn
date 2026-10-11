import { describe, expect, it } from 'vitest'
import { createJsonSchemaAdapter } from '../index.js'
import type { Dialect } from '../dialect.js'
import type { JsonPointer } from '@texaryn/core'

const dialects = [
  ['2019-09', 'https://json-schema.org/draft/2019-09/schema'],
  ['2020-12', 'https://json-schema.org/draft/2020-12/schema'],
] as const satisfies readonly (readonly [Dialect, string])[]

const cases = [
  {
    label: 'type mismatch from number to string',
    projected: { type: 'number', minimum: 0 },
    hidden: { type: 'string', minLength: 5 },
    value: 3,
    type: 'number',
    keyword: 'type',
  },
  {
    label: 'type mismatch from string to number',
    projected: { type: 'string', minLength: 1 },
    hidden: { type: 'number', minimum: 10 },
    value: 'a',
    type: 'string',
    keyword: 'type',
  },
  {
    label: 'minimum mismatch',
    projected: { type: 'number', minimum: 0 },
    hidden: { type: 'number', minimum: 10 },
    value: 3,
    type: 'number',
    keyword: 'minimum',
  },
  {
    label: 'minLength mismatch',
    projected: { type: 'string', minLength: 1 },
    hidden: { type: 'string', minLength: 4 },
    value: 'ab',
    type: 'string',
    keyword: 'minLength',
  },
  {
    label: 'required mismatch',
    projected: { type: 'object', required: ['name'] },
    hidden: { type: 'object', required: ['id'] },
    value: { name: 'Ada' },
    type: 'object',
    keyword: 'required',
  },
  {
    label: 'additionalProperties mismatch',
    projected: { type: 'object', additionalProperties: true },
    hidden: { type: 'object', additionalProperties: false },
    value: { extra: true },
    type: 'object',
    keyword: 'additionalProperties',
  },
  {
    label: 'anyOf mismatch from allOf',
    projected: { type: 'number', anyOf: [{ minimum: 0 }, { maximum: 10 }] },
    hidden: { type: 'number', allOf: [{ minimum: 0 }, { maximum: 10 }] },
    value: 20,
    type: 'number',
    keyword: 'applicator',
  },
  {
    label: 'boolean items mismatch',
    projected: { type: 'array', items: true },
    hidden: { type: 'array', items: false },
    value: [1],
    type: 'array',
    keyword: 'items',
  },
] as const

describe('projection and validation reference targets', () => {
  it.each(dialects.flatMap(([dialect, $schema]) =>
    cases.map((testCase) => [`${testCase.label} in ${dialect}`, dialect, $schema, testCase] as const),
  ))('%s validates through the declared reference target', async (_label, dialect, $schema, testCase) => {
    const schema = {
      $schema,
      type: 'object',
      then: { properties: { value: testCase.hidden } },
      properties: {
        value: testCase.projected,
        result: { $ref: '#/properties/value' },
      },
    }
    const adapter = await createJsonSchemaAdapter(schema, { defaultDialect: dialect })
    const projected = adapter.project({})
    const node = projected.nodes.get('/result' as JsonPointer)

    expect(node?.type).toBe(testCase.type)
    if (testCase.keyword === 'minimum') expect(node?.constraints.minimum).toBe(0)
    if (testCase.keyword === 'minLength') expect(node?.constraints.minLength).toBe(1)
    expect((await adapter.validate({ result: testCase.value })).valid).toBe(true)
  })

  it('accepts equivalent targets under escaped keys and prefix items', async () => {
    const target = {
      type: 'array',
      prefixItems: [{ type: 'object', properties: { 'a/b~c': { type: 'string', minLength: 2 } } }],
    }
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      then: { properties: { value: target } },
      properties: { value: target, result: { $ref: '#/properties/value' } },
    }

    await expect(createJsonSchemaAdapter(schema)).resolves.toBeDefined()
  })

  it('accepts equivalent targets with reordered applicator branches', async () => {
    const projected = { type: 'number', anyOf: [{ minimum: 0 }, { maximum: 10 }] }
    const validation = { type: 'number', anyOf: [{ maximum: 10 }, { minimum: 0 }] }
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      then: { properties: { value: validation } },
      properties: { value: projected, result: { $ref: '#/properties/value' } },
    }

    await expect(createJsonSchemaAdapter(schema)).resolves.toBeDefined()
  })

  it('reports a missing local reference as an unresolved shape', async () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { result: { $ref: '#/$defs/missing' } },
      $defs: {},
    }

    const adapter = await createJsonSchemaAdapter(schema)
    expect(adapter.project({}).diagnostics?.map(({ code }) => code)).toContain('unresolved-projection-shape')
  })
})

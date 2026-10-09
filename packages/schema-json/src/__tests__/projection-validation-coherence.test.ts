import { describe, expect, it } from 'vitest'
import { createJsonSchemaAdapter, ProjectionValidationDivergenceError } from '../index.js'
import { withoutUnreachableBranches } from '../normalize.js'
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
] as const

describe('projection and validation reference targets', () => {
  it.each(dialects.flatMap(([dialect, $schema]) =>
    cases.map((testCase) => [`${testCase.label} in ${dialect}`, dialect, $schema, testCase] as const),
  ))('%s fails closed when validation resolves a different schema', async (_label, dialect, $schema, testCase) => {
    const schema = {
      $schema,
      type: 'object',
      then: { properties: { value: testCase.hidden } },
      properties: {
        value: testCase.projected,
        result: { $ref: '#/properties/value' },
      },
    }
    const normalized = withoutUnreachableBranches(schema) as Record<string, unknown>
    const projectedAdapter = await createJsonSchemaAdapter(normalized, { defaultDialect: dialect })
    const projected = projectedAdapter.project({})
    const node = projected.nodes.get('/result' as JsonPointer)

    expect(node?.type).toBe(testCase.type)
    if (testCase.keyword === 'minimum') expect(node?.constraints.minimum).toBe(0)
    if (testCase.keyword === 'minLength') expect(node?.constraints.minLength).toBe(1)
    expect((await projectedAdapter.validate({ result: testCase.value })).valid).toBe(true)

    const error = await createJsonSchemaAdapter(schema, { defaultDialect: dialect }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ProjectionValidationDivergenceError)
    expect(error).toMatchObject({
      sourcePosition: '#/properties/result',
      validationPosition: '#/then/properties/value',
      projectionPosition: '#/properties/value',
    })
  })
})

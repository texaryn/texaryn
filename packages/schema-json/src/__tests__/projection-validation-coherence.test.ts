import { describe, expect, it } from 'vitest'
import { compileSchema, type JsonSchema, type SchemaNode } from '@texaryn/json-schema-library'
import { createJsonSchemaAdapter } from '../index.js'
import type { Dialect } from '../dialect.js'
import type { JsonPointer } from '@texaryn/core'
import { DRAFTS } from '../bare-maps.js'
import {
  assertProjectionValidationCoherence,
  ProjectionValidationDivergenceError,
} from '../projection-validation-coherence.js'

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

const dialectDrafts = {
  'draft-07': 'draft-07',
  '2019-09': 'draft-2019-09',
  '2020-12': 'draft-2020-12',
} as const

function referenceRoot(dialect: keyof typeof dialectDrafts, slot: string, target: object): SchemaNode {
  const isDraft07 = dialect === 'draft-07'
  const schema = isDraft07
    ? {
        $schema: 'http://json-schema.org/draft-07/schema#',
        $id: 'https://example.test/root',
        definitions: { [slot]: { $id: '#target', ...target } },
        properties: { result: { $ref: '#target' } },
      }
    : {
        $schema: `https://json-schema.org/draft/${dialect}/schema`,
        $id: 'https://example.test/root',
        $defs: { [slot]: { $anchor: 'target', ...target } },
        properties: { result: { $ref: '#target' } },
      }
  return compileSchema(schema as JsonSchema, { drafts: DRAFTS, draft: dialectDrafts[dialect] })
}

function validationContractTarget(dialect: keyof typeof dialectDrafts, reverse: boolean): object {
  const schemas = [
    { type: 'string', minLength: 2 },
    { maximum: 10 },
  ]
  const properties = reverse
    ? { label: { type: 'string' }, 'a/b~c': { allOf: schemas } }
    : { 'a/b~c': { allOf: schemas }, label: { type: 'string' } }
  const branches = reverse ? [...schemas].reverse() : schemas

  return {
    type: 'object',
    required: ['id'],
    properties,
    patternProperties: { '^x': { anyOf: branches } },
    allOf: branches,
    anyOf: branches,
    oneOf: [{ const: true }, { not: { required: ['blocked'] } }],
    if: { properties: { enabled: { const: true } } },
    then: { properties: { after: { type: 'number' } } },
    else: { propertyNames: { minLength: 1 } },
    not: { properties: { blocked: { type: 'null' } } },
    additionalProperties: { type: 'boolean' },
    propertyNames: { pattern: '^[a-z]+$' },
    contains: { type: 'number', minimum: 0 },
    dependencies: { legacy: { required: ['id'] } },
    dependentSchemas: { owner: { required: ['name'] } },
    unevaluatedProperties: { type: 'string' },
    unevaluatedItems: false,
    format: 'date-time',
    minContains: 1,
    maxContains: 4,
    ...(dialect === '2020-12'
      ? { items: { type: 'object', properties: { child: { type: 'string' } } }, prefixItems: [true, { type: 'number' }] }
      : { items: [{ type: 'string' }, false], additionalItems: { type: 'number' } }),
  }
}

describe('projection and validation reference targets', () => {
  it.each(['draft-07', '2019-09', '2020-12'] as const)(
    'compares equivalent nested assertion contracts in %s',
    (dialect) => {
      const validation = referenceRoot(dialect, 'validation', validationContractTarget(dialect, false))
      const projection = referenceRoot(dialect, 'projection', validationContractTarget(dialect, true))
      const validationReference = validation.properties?.result as SchemaNode
      const projectionReference = projection.properties?.result as SchemaNode

      expect(validationReference.$ref).toBe(projectionReference.$ref)
      expect(validationReference.schemaLocation).toBe(projectionReference.schemaLocation)
      expect(validationReference.resolveRef()?.schemaLocation).not.toBe(
        projectionReference.resolveRef()?.schemaLocation,
      )
      expect(() => assertProjectionValidationCoherence(validation, projection, dialect)).not.toThrow()
    },
  )

  it('rejects different assertion contracts at alternate anchor locations', () => {
    const validation = referenceRoot('2020-12', 'validation', { type: 'string', minLength: 2 })
    const projection = referenceRoot('2020-12', 'projection', { type: 'string', minLength: 3 })

    expect(() => assertProjectionValidationCoherence(validation, projection, '2020-12'))
      .toThrow(ProjectionValidationDivergenceError)
  })

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

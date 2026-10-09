import { describe, expect, it } from 'vitest'
import type { JsonPointer } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createHyperjumpAdapter } from '@texaryn/schema-json-hyperjump'

describe.each([
  ['json-schema-library', createJsonSchemaAdapter],
  ['@hyperjump/json-schema', createHyperjumpAdapter],
])('additionalProperties projection (%s)', (_name, createAdapter) => {
  it('composes its constraints with a property from another allOf scope', async () => {
    const adapter = await (createAdapter as typeof createJsonSchemaAdapter)({
      type: 'object',
      properties: { name: { type: 'string' } },
      allOf: [{ additionalProperties: { type: 'string', minLength: 5 } }],
    })

    const projection = adapter.project({ name: 'hello' })
    expect(projection.nodes.get('/name' as JsonPointer)?.constraints.minLength).toBe(5)
    expect((await adapter.validate({ name: 'abc' })).valid).toBe(false)
    expect((await adapter.validate({ name: 'hello' })).valid).toBe(true)
  })

  it('projects a Draft 7 additionalProperties reference', async () => {
    const adapter = await (createAdapter as typeof createJsonSchemaAdapter)({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: { box: { type: 'object' } },
      allOf: [{ additionalProperties: { $ref: '#/definitions/Fields' } }],
      definitions: { Fields: { type: 'object', properties: { name: { type: 'string' } } } },
    })

    expect(adapter.project({ box: {} }).nodes.get('/box/name' as JsonPointer)?.type).toBe('string')
  })

  it('projects a Draft 7 reference nested in additionalProperties allOf', async () => {
    const adapter = await (createAdapter as typeof createJsonSchemaAdapter)({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: { box: { type: 'object' } },
      allOf: [{ additionalProperties: { allOf: [{ $ref: '#/definitions/Fields' }] } }],
      definitions: { Fields: { type: 'object', properties: { name: { type: 'string' } } } },
    })

    expect(adapter.project({ box: {} }).nodes.get('/box/name' as JsonPointer)?.type).toBe('string')
  })
})

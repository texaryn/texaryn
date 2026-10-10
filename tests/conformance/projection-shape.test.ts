import { describe, expect, it } from 'vitest'
import type { JsonPointer } from '@texaryn/core'
import { projectionShapeSuite } from './projection-shape.suite.js'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createHyperjumpAdapter } from '@texaryn/schema-json-hyperjump'

projectionShapeSuite('json-schema-library', (schema) => createJsonSchemaAdapter(schema))
projectionShapeSuite('@hyperjump/json-schema', (schema) => createHyperjumpAdapter(schema))

describe('@hyperjump/json-schema: absent conditional scope fallback', () => {
  it('declines a condition whose local reference chain uses a dynamic reference', async () => {
    const port = await createHyperjumpAdapter({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        child: {
          type: 'object',
          if: { $ref: '#/$defs/check' },
          then: { properties: { name: { type: 'string' } } },
          else: { properties: { reason: { type: 'string' } } },
        },
      },
      $defs: {
        check: { $dynamicRef: '#node' },
        node: { $dynamicAnchor: 'node', type: 'object' },
      },
    })

    const projection = port.project({})
    expect(projection.nodes.get('/child/name' as JsonPointer)?.active ?? false).toBe(false)
    expect(projection.nodes.get('/child/reason' as JsonPointer)?.active ?? false).toBe(false)
  })

  it('declines a condition beneath a nested resource identifier', async () => {
    const port = await createHyperjumpAdapter({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        child: {
          $id: 'https://example.com/child',
          type: 'object',
          if: { type: 'object' },
          then: { properties: { name: { type: 'string' } } },
          else: { properties: { reason: { type: 'string' } } },
        },
      },
    })

    const projection = port.project({})
    expect(projection.nodes.get('/child/name' as JsonPointer)?.active ?? false).toBe(false)
    expect(projection.nodes.get('/child/reason' as JsonPointer)?.active ?? false).toBe(false)
  })
})

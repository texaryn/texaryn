import { describe, it, expect } from 'vitest'
import { createJsonSchemaAdapter } from '../index.js'
import type { JsonPointer } from '@texaryn/core'

const oneOfSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['circle', 'rectangle'] },
  },
  required: ['kind'],
  oneOf: [
    {
      properties: {
        kind: { const: 'circle' },
        radius: { type: 'number', title: 'Radius', minimum: 0 },
      },
      required: ['radius'],
    },
    {
      properties: {
        kind: { const: 'rectangle' },
        width: { type: 'number', title: 'Width', minimum: 0 },
        height: { type: 'number', title: 'Height', minimum: 0 },
      },
      required: ['width', 'height'],
    },
  ],
}

const anyOfSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    value: {
      anyOf: [
        { type: 'string', title: 'Text Value', minLength: 1 },
        { type: 'number', title: 'Numeric Value', minimum: 0 },
      ],
    },
  },
}

const nestedOneOfSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    shape: {
      oneOf: [
        {
          type: 'object',
          title: 'Circle',
          properties: {
            type: { const: 'circle' },
            radius: { type: 'number', title: 'Radius' },
          },
          required: ['type', 'radius'],
        },
        {
          type: 'object',
          title: 'Square',
          properties: {
            type: { const: 'square' },
            side: { type: 'number', title: 'Side' },
          },
          required: ['type', 'side'],
        },
      ],
    },
  },
}

describe('oneOf/anyOf discrimination', () => {
  describe('oneOf with discriminator', () => {
    it('projects circle branch when kind is circle', async () => {
      const adapter = await createJsonSchemaAdapter(oneOfSchema)
      const projection = adapter.project({ kind: 'circle', radius: 5 })
      const radius = projection.nodes.get('/radius' as JsonPointer)
      expect(radius).toBeDefined()
      expect(radius!.active).toBe(true)
      expect(radius!.annotations.title).toBe('Radius')
    })

    it('projects rectangle branch when kind is rectangle', async () => {
      const adapter = await createJsonSchemaAdapter(oneOfSchema)
      const projection = adapter.project({ kind: 'rectangle', width: 10, height: 20 })
      expect(projection.nodes.get('/width' as JsonPointer)?.active).toBe(true)
      expect(projection.nodes.get('/height' as JsonPointer)?.active).toBe(true)
    })

    it('hides non-matching branch', async () => {
      const adapter = await createJsonSchemaAdapter(oneOfSchema)
      const projection = adapter.project({ kind: 'circle', radius: 5 })
      expect(projection.nodes.get('/width' as JsonPointer)?.active).toBe(false)
      expect(projection.nodes.get('/height' as JsonPointer)?.active).toBe(false)
    })

    it('switches branches when data changes', async () => {
      const adapter = await createJsonSchemaAdapter(oneOfSchema)

      const p1 = adapter.project({ kind: 'circle', radius: 5 })
      expect(p1.nodes.get('/radius' as JsonPointer)?.active).toBe(true)

      const p2 = adapter.project({ kind: 'rectangle', radius: 5, width: 10, height: 20 })
      expect(p2.nodes.get('/width' as JsonPointer)?.active).toBe(true)
      expect(p2.nodes.get('/radius' as JsonPointer)?.active).toBe(false)
    })
  })

  describe('data preservation', () => {
    it('preserves data from previous branch after switch', async () => {
      const adapter = await createJsonSchemaAdapter(oneOfSchema)
      const data = { kind: 'rectangle', radius: 5, width: 10, height: 20 }
      adapter.project(data)
      expect(data.radius).toBe(5)
    })

    it('validates against active branch only', async () => {
      const adapter = await createJsonSchemaAdapter(oneOfSchema)
      const result = await adapter.validate({ kind: 'circle', radius: 5 })
      expect(result.valid).toBe(true)
    })

    it('reports errors for missing active branch required fields', async () => {
      const adapter = await createJsonSchemaAdapter(oneOfSchema)
      const result = await adapter.validate({ kind: 'circle' })
      expect(result.valid).toBe(false)
    })
  })

  describe('anyOf', () => {
    it('projects matching anyOf branch', async () => {
      const adapter = await createJsonSchemaAdapter(anyOfSchema)
      const projection = adapter.project({ value: 'hello' })
      const value = projection.nodes.get('/value' as JsonPointer)
      expect(value).toBeDefined()
      expect(value!.active).toBe(true)
    })
  })

  describe('nested oneOf', () => {
    it('discriminates nested oneOf by type field', async () => {
      const adapter = await createJsonSchemaAdapter(nestedOneOfSchema)
      const projection = adapter.project({
        shape: { type: 'circle', radius: 5 },
      })
      expect(projection.nodes.get('/shape/radius' as JsonPointer)?.active).toBe(true)
      expect(projection.nodes.get('/shape/side' as JsonPointer)?.active).toBe(false)
    })

    it('keeps the whole subtree present but inactive when no branch resolves', async () => {
      const adapter = await createJsonSchemaAdapter(nestedOneOfSchema)
      const projection = adapter.project({})

      const shape = projection.nodes.get('/shape' as JsonPointer)
      expect(shape).toBeDefined()
      expect(shape!.active).toBe(false)

      const radius = projection.nodes.get('/shape/radius' as JsonPointer)
      expect(radius).toBeDefined()
      expect(radius!.active).toBe(false)

      const side = projection.nodes.get('/shape/side' as JsonPointer)
      expect(side).toBeDefined()
      expect(side!.active).toBe(false)
    })
  })
})

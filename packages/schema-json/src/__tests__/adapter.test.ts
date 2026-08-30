import { describe, it, expect } from 'vitest'
import { createJsonSchemaAdapter } from '../index.js'
import {
  flatObjectSchema,
  enumSchema,
  annotationsSchema,
  nestedObjectSchema,
  arraySchema,
  objectArraySchema,
  refSchema,
  draft07Schema,
} from './fixtures.js'
import type { JsonPointer } from '@texaryn/core'

describe('createJsonSchemaAdapter', () => {
  describe('flat object projection', () => {
    it('produces root node at empty pointer', async () => {
      const adapter = await createJsonSchemaAdapter(flatObjectSchema)
      const projection = adapter.project({ name: 'Alice', email: 'a@b.com' })
      const root = projection.nodes.get('' as JsonPointer)
      expect(root).toBeDefined()
      expect(root!.type).toBe('object')
    })

    it('produces child nodes for each property', async () => {
      const adapter = await createJsonSchemaAdapter(flatObjectSchema)
      const projection = adapter.project({ name: 'Alice', email: 'a@b.com' })
      expect(projection.nodes.has('/name' as JsonPointer)).toBe(true)
      expect(projection.nodes.has('/email' as JsonPointer)).toBe(true)
      expect(projection.nodes.has('/age' as JsonPointer)).toBe(true)
      expect(projection.nodes.has('/active' as JsonPointer)).toBe(true)
    })

    it('maps types correctly', async () => {
      const adapter = await createJsonSchemaAdapter(flatObjectSchema)
      const projection = adapter.project({})
      expect(projection.nodes.get('/name' as JsonPointer)!.type).toBe('string')
      expect(projection.nodes.get('/age' as JsonPointer)!.type).toBe('integer')
      expect(projection.nodes.get('/active' as JsonPointer)!.type).toBe('boolean')
    })

    it('maps constraints', async () => {
      const adapter = await createJsonSchemaAdapter(flatObjectSchema)
      const projection = adapter.project({})
      const name = projection.nodes.get('/name' as JsonPointer)!
      expect(name.constraints.minLength).toBe(1)
      expect(name.constraints.maxLength).toBe(100)
      const age = projection.nodes.get('/age' as JsonPointer)!
      expect(age.constraints.minimum).toBe(0)
      expect(age.constraints.maximum).toBe(150)
    })

    it('maps format', async () => {
      const adapter = await createJsonSchemaAdapter(flatObjectSchema)
      const projection = adapter.project({})
      expect(projection.nodes.get('/email' as JsonPointer)!.format).toBe('email')
    })

    it('maps annotations', async () => {
      const adapter = await createJsonSchemaAdapter(annotationsSchema)
      const projection = adapter.project({})
      const field = projection.nodes.get('/field' as JsonPointer)!
      expect(field.annotations.title).toBe('Annotated Field')
      expect(field.annotations.description).toBe('A field with all annotations')
      expect(field.annotations.readOnly).toBe(true)
      expect(field.annotations.deprecated).toBe(true)
      expect(field.annotations.examples).toEqual(['example1', 'example2'])
      expect(field.annotations.default).toBe('default-value')
    })

    it('maps children with required flag', async () => {
      const adapter = await createJsonSchemaAdapter(flatObjectSchema)
      const projection = adapter.project({})
      const root = projection.nodes.get('' as JsonPointer)!
      const nameChild = root.children!.find((c) => c.key === 'name')
      const ageChild = root.children!.find((c) => c.key === 'age')
      expect(nameChild!.required).toBe(true)
      expect(ageChild!.required).toBe(false)
    })

    it('maps enum values', async () => {
      const adapter = await createJsonSchemaAdapter(enumSchema)
      const projection = adapter.project({})
      const color = projection.nodes.get('/color' as JsonPointer)!
      expect(color.enumValues).toEqual([{ value: 'red' }, { value: 'green' }, { value: 'blue' }])
    })

    it('marks all nodes active for flat schema', async () => {
      const adapter = await createJsonSchemaAdapter(flatObjectSchema)
      const projection = adapter.project({})
      for (const [, node] of projection.nodes) {
        expect(node.active).toBe(true)
      }
    })
  })

  describe('nested object projection', () => {
    it('projects nested object properties', async () => {
      const adapter = await createJsonSchemaAdapter(nestedObjectSchema)
      const projection = adapter.project({})
      expect(projection.nodes.has('/address' as JsonPointer)).toBe(true)
      expect(projection.nodes.has('/address/street' as JsonPointer)).toBe(true)
      expect(projection.nodes.has('/address/city' as JsonPointer)).toBe(true)
      expect(projection.nodes.get('/address' as JsonPointer)!.type).toBe('object')
    })

    it('marks nested required properties', async () => {
      const adapter = await createJsonSchemaAdapter(nestedObjectSchema)
      const projection = adapter.project({})
      const address = projection.nodes.get('/address' as JsonPointer)!
      const streetChild = address.children!.find((c) => c.key === 'street')
      const cityChild = address.children!.find((c) => c.key === 'city')
      expect(streetChild!.required).toBe(true)
      expect(cityChild!.required).toBe(false)
    })
  })

  describe('array projection', () => {
    it('projects array with item type', async () => {
      const adapter = await createJsonSchemaAdapter(arraySchema)
      const projection = adapter.project({ tags: ['a', 'b'] })
      const tags = projection.nodes.get('/tags' as JsonPointer)!
      expect(tags.type).toBe('array')
      expect(tags.constraints.minItems).toBe(1)
      expect(tags.constraints.maxItems).toBe(10)
    })

    it('projects object array items', async () => {
      const adapter = await createJsonSchemaAdapter(objectArraySchema)
      const data = { contacts: [{ name: 'Alice' }, { name: 'Bob' }] }
      const projection = adapter.project(data)
      expect(projection.nodes.has('/contacts' as JsonPointer)).toBe(true)
      expect(projection.nodes.has('/contacts/0' as JsonPointer)).toBe(true)
      expect(projection.nodes.has('/contacts/1' as JsonPointer)).toBe(true)
      expect(projection.nodes.has('/contacts/0/name' as JsonPointer)).toBe(true)
    })
  })

  describe('$ref resolution', () => {
    it('resolves local $ref', async () => {
      const adapter = await createJsonSchemaAdapter(refSchema)
      const projection = adapter.project({})
      expect(projection.nodes.has('/home' as JsonPointer)).toBe(true)
      expect(projection.nodes.get('/home' as JsonPointer)!.type).toBe('object')
      expect(projection.nodes.has('/home/street' as JsonPointer)).toBe(true)
      expect(projection.nodes.has('/work' as JsonPointer)).toBe(true)
      expect(projection.nodes.get('/work' as JsonPointer)!.type).toBe('object')
    })

    it('preserves annotations through $ref', async () => {
      const adapter = await createJsonSchemaAdapter(refSchema)
      const projection = adapter.project({})
      expect(projection.nodes.get('/home' as JsonPointer)!.annotations.title).toBe('Address')
    })
  })

  describe('draft-07 support', () => {
    it('handles draft-07 schema', async () => {
      const adapter = await createJsonSchemaAdapter(draft07Schema)
      const projection = adapter.project({})
      expect(projection.nodes.has('/name' as JsonPointer)).toBe(true)
      expect(projection.nodes.get('/name' as JsonPointer)!.type).toBe('string')
    })
  })
})

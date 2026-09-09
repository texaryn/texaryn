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

  // Whether `format` asserts is a per-dialect decision, so it is asserted per
  // dialect rather than sampled. The string is the official suite's own
  // "invalid email" value, and the underlying library asserts in every dialect
  // unless told otherwise, so each case here is a live choice.
  describe('format assertion by dialect', () => {
    const cases = [
      // Draft 7 treats format as an assertion by convention, and the
      // specification asks only that it can be turned off.
      { dialect: 'draft-07', expected: false },
      // From 2019-09 format-annotation is the default vocabulary, so an
      // invalid format string stays valid unless format-assertion is declared.
      { dialect: '2019-09', expected: true },
      { dialect: '2020-12', expected: true },
    ] as const

    for (const { dialect, expected } of cases) {
      it(`${expected ? 'ignores' : 'enforces'} an invalid email under ${dialect}`, async () => {
        const adapter = await createJsonSchemaAdapter(
          { type: 'string', format: 'email' },
          { defaultDialect: dialect },
        )
        expect((await adapter.validate('2962')).valid).toBe(expected)
        expect((await adapter.validate('someone@example.com')).valid).toBe(true)
      })
    }

    it('reads the dialect from $schema rather than the fallback (format)', async () => {
      const adapter = await createJsonSchemaAdapter(
        { $schema: 'https://json-schema.org/draft/2019-09/schema', type: 'string', format: 'email' },
        { defaultDialect: 'draft-07' },
      )
      expect((await adapter.validate('2962')).valid).toBe(true)
    })
  })

  // Both halves per dialect on purpose. Accepting a valid schema proves the
  // metaschema resolved; rejecting an invalid one proves it is actually being
  // applied. Without the second, a registration whose internal references were
  // half broken would look identical to a working one, because an unresolved
  // reference rejects everything.
  describe('metaschema resolution', () => {
    const metaschemas = {
      'draft-07': 'http://json-schema.org/draft-07/schema#',
      '2019-09': 'https://json-schema.org/draft/2019-09/schema',
      '2020-12': 'https://json-schema.org/draft/2020-12/schema',
    } as const

    for (const [dialect, uri] of Object.entries(metaschemas) as Array<
      [keyof typeof metaschemas, string]
    >) {
      describe(dialect, () => {
        const schemaOfSchemas =
          dialect === 'draft-07' ? { $ref: uri } : { $schema: uri, $ref: uri }

        it('accepts a valid schema document', async () => {
          const adapter = await createJsonSchemaAdapter(schemaOfSchemas, {
            defaultDialect: dialect,
          })
          const result = await adapter.validate({ type: 'integer', minimum: 3 })
          expect(result.errors.map((error) => error.message)).toEqual([])
          expect(result.valid).toBe(true)
        })

        it('rejects a schema document that breaks the metaschema', async () => {
          const adapter = await createJsonSchemaAdapter(schemaOfSchemas, {
            defaultDialect: dialect,
          })
          // `type` must be a string or an array of them, and `required` an array.
          expect((await adapter.validate({ type: 1 })).valid).toBe(false)
          expect((await adapter.validate({ required: 'notAnArray' })).valid).toBe(false)
        })
      })
    }

    it('resolves the referenced dialect, not the detected one', async () => {
      const adapter = await createJsonSchemaAdapter(
        { $ref: 'https://json-schema.org/draft/2020-12/schema' },
        { defaultDialect: 'draft-07' },
      )
      expect((await adapter.validate({ type: 'integer' })).valid).toBe(true)
      expect((await adapter.validate({ type: 1 })).valid).toBe(false)
    })

    it('leaves an unrelated absolute reference unresolved', async () => {
      const adapter = await createJsonSchemaAdapter(
        { $ref: 'https://example.com/not-a-metaschema.json' },
        { defaultDialect: '2020-12' },
      )
      const result = await adapter.validate({ anything: true })
      expect(result.valid).toBe(false)
      expect(result.errors.map((error) => error.keyword)).toEqual(['$ref'])
    })
  })
})

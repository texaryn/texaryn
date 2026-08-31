import { describe, it, expect } from 'vitest'
import { createHyperjumpAdapter } from '../index.js'
import type { JsonPointer } from '@texaryn/core'
import {
  flatObjectSchema,
  enumSchema,
  annotationsSchema,
  refSchema,
  recursiveRefSchema,
  draft07Schema,
  draft201909Schema,
  ifThenElseSchema,
  oneOfSchema,
  dependentSchemasSchema,
} from './fixtures.js'

describe('createHyperjumpAdapter', () => {
  describe('flat object projection', () => {
    it('produces root node at empty pointer', async () => {
      const adapter = await createHyperjumpAdapter(flatObjectSchema)
      const projection = adapter.project({ name: 'Alice', email: 'a@b.com' })
      const root = projection.nodes.get('' as JsonPointer)
      expect(root).toBeDefined()
      expect(root!.type).toBe('object')
    })

    it('produces child nodes for each property', async () => {
      const adapter = await createHyperjumpAdapter(flatObjectSchema)
      const projection = adapter.project({ name: 'Alice', email: 'a@b.com' })
      expect(projection.nodes.has('/name' as JsonPointer)).toBe(true)
      expect(projection.nodes.has('/email' as JsonPointer)).toBe(true)
      expect(projection.nodes.has('/age' as JsonPointer)).toBe(true)
      expect(projection.nodes.has('/active' as JsonPointer)).toBe(true)
    })

    it('maps types, constraints, and format', async () => {
      const adapter = await createHyperjumpAdapter(flatObjectSchema)
      const projection = adapter.project({ name: 'Alice', email: 'a@b.com', age: 30 })
      const name = projection.nodes.get('/name' as JsonPointer)!
      expect(name.type).toBe('string')
      expect(name.constraints.minLength).toBe(1)
      expect(name.constraints.maxLength).toBe(100)

      const age = projection.nodes.get('/age' as JsonPointer)!
      expect(age.type).toBe('integer')
      expect(age.constraints.minimum).toBe(0)
      expect(age.constraints.maximum).toBe(150)

      expect(projection.nodes.get('/email' as JsonPointer)!.format).toBe('email')
    })

    it('maps annotations', async () => {
      const adapter = await createHyperjumpAdapter(annotationsSchema)
      const projection = adapter.project({ field: 'value' })
      const field = projection.nodes.get('/field' as JsonPointer)!
      expect(field.annotations.title).toBe('Annotated Field')
      expect(field.annotations.description).toBe('A field with all annotations')
      expect(field.annotations.readOnly).toBe(true)
      expect(field.annotations.deprecated).toBe(true)
      expect(field.annotations.examples).toEqual(['example1', 'example2'])
      expect(field.annotations.default).toBe('default-value')
    })

    it('maps children with required flag', async () => {
      const adapter = await createHyperjumpAdapter(flatObjectSchema)
      const projection = adapter.project({ name: 'Alice', email: 'a@b.com' })
      const root = projection.nodes.get('' as JsonPointer)!
      const nameChild = root.children!.find((c) => c.key === 'name')
      const ageChild = root.children!.find((c) => c.key === 'age')
      expect(nameChild!.required).toBe(true)
      expect(ageChild!.required).toBe(false)
    })

    it('maps enum values', async () => {
      const adapter = await createHyperjumpAdapter(enumSchema)
      const projection = adapter.project({ color: 'red' })
      const color = projection.nodes.get('/color' as JsonPointer)!
      expect(color.enumValues).toEqual([{ value: 'red' }, { value: 'green' }, { value: 'blue' }])
    })

    it('marks an unfilled optional field active with its static annotations', async () => {
      const adapter = await createHyperjumpAdapter(flatObjectSchema)
      // "active" is never given a value here, but it is still a declared, currently-
      // reachable field: it must appear active with its default annotation populated by
      // the static backfill pass, not merely be absent from the projection.
      const projection = adapter.project({ name: 'Alice', email: 'a@b.com' })
      const active = projection.nodes.get('/active' as JsonPointer)
      expect(active).toBeDefined()
      expect(active!.active).toBe(true)
      expect(active!.type).toBe('boolean')
      expect(active!.annotations.default).toBe(true)
    })
  })

  describe('conditional evaluation (if/then/else)', () => {
    it('activates then-branch fields when condition matches', async () => {
      const adapter = await createHyperjumpAdapter(ifThenElseSchema)
      const projection = adapter.project({ accountType: 'business', name: 'Corp' })
      expect(projection.nodes.get('/companyName' as JsonPointer)?.active).toBe(true)
      expect(projection.nodes.get('/taxId' as JsonPointer)?.active).toBe(true)
      expect(projection.nodes.get('/nickname' as JsonPointer)?.active).toBe(false)
    })

    it('activates else-branch fields when condition does not match', async () => {
      const adapter = await createHyperjumpAdapter(ifThenElseSchema)
      const projection = adapter.project({ accountType: 'personal', name: 'Alice' })
      expect(projection.nodes.get('/nickname' as JsonPointer)?.active).toBe(true)
      expect(projection.nodes.get('/companyName' as JsonPointer)?.active).toBe(false)
      expect(projection.nodes.get('/taxId' as JsonPointer)?.active).toBe(false)
    })
  })

  describe('oneOf discrimination', () => {
    it('activates the matching branch and its annotations', async () => {
      const adapter = await createHyperjumpAdapter(oneOfSchema)
      const projection = adapter.project({ kind: 'circle', radius: 5 })
      const radius = projection.nodes.get('/radius' as JsonPointer)
      expect(radius?.active).toBe(true)
      expect(radius?.annotations.title).toBe('Radius')
    })

    it('suppresses annotations from the non-matching branch', async () => {
      const adapter = await createHyperjumpAdapter(oneOfSchema)
      const projection = adapter.project({ kind: 'circle', radius: 5 })
      const width = projection.nodes.get('/width' as JsonPointer)
      expect(width?.active).toBe(false)
      expect(width?.annotations.title).toBeUndefined()
    })
  })

  describe('$ref resolution', () => {
    it('resolves local $ref', async () => {
      const adapter = await createHyperjumpAdapter(refSchema)
      const projection = adapter.project({ home: { street: '1 Main St' } })
      expect(projection.nodes.get('/home' as JsonPointer)!.type).toBe('object')
      expect(projection.nodes.get('/home/street' as JsonPointer)).toBeDefined()
      expect(projection.nodes.get('/home' as JsonPointer)!.annotations.title).toBe('Address')
      // "work" is never given a value, but is still reachable through $ref and must
      // appear via the static backfill pass.
      expect(projection.nodes.get('/work' as JsonPointer)?.active).toBe(true)
      expect(projection.nodes.get('/work/street' as JsonPointer)).toBeDefined()
    })

    it('follows a recursive $ref to the depth of the instance data', async () => {
      const adapter = await createHyperjumpAdapter(recursiveRefSchema)
      const data = {
        root: {
          label: 'root',
          children: [{ label: 'child', children: [{ label: 'grandchild', children: [] }] }],
        },
      }
      const projection = adapter.project(data)
      expect(projection.nodes.get('/root/label' as JsonPointer)?.type).toBe('string')
      expect(projection.nodes.get('/root/children/0/label' as JsonPointer)?.type).toBe('string')
      expect(
        projection.nodes.get('/root/children/0/children/0/label' as JsonPointer)?.type,
      ).toBe('string')
    })
  })

  describe('dependentSchemas', () => {
    it('activates the dependent field when the trigger is present', async () => {
      const adapter = await createHyperjumpAdapter(dependentSchemasSchema)
      const projection = adapter.project({ creditCard: '4111' })
      expect(projection.nodes.get('/cvv' as JsonPointer)?.active).toBe(true)
    })

    it('leaves the dependent field inactive when the trigger is absent', async () => {
      const adapter = await createHyperjumpAdapter(dependentSchemasSchema)
      const projection = adapter.project({})
      expect(projection.nodes.get('/cvv' as JsonPointer)?.active).toBe(false)
    })
  })

  describe('validate()', () => {
    it('returns valid: true, errors: [] for conforming data', async () => {
      const adapter = await createHyperjumpAdapter(flatObjectSchema)
      const result = await adapter.validate({ name: 'Alice', email: 'a@b.com' })
      expect(result).toEqual({ valid: true, errors: [] })
    })

    it('maps errors with instancePointer and keyword', async () => {
      const adapter = await createHyperjumpAdapter(flatObjectSchema)
      const result = await adapter.validate({ name: '', age: -5 })
      expect(result.valid).toBe(false)
      expect(
        result.errors.some((e) => e.instancePointer === '/name' && e.keyword === 'minLength'),
      ).toBe(true)
      expect(
        result.errors.some((e) => e.instancePointer === '' && e.keyword === 'required'),
      ).toBe(true)
    })

    it('does not require a message on ValidationError', async () => {
      const adapter = await createHyperjumpAdapter(flatObjectSchema)
      const result = await adapter.validate({ name: '' })
      expect(result.valid).toBe(false)
      for (const error of result.errors) {
        expect(error.instancePointer).toEqual(expect.any(String))
        expect(error.keyword).toEqual(expect.any(String))
      }
    })
  })

  describe('draft-07 support', () => {
    it('detects the dialect from $schema and evaluates correctly', async () => {
      const adapter = await createHyperjumpAdapter(draft07Schema)
      const projection = adapter.project({ name: 'Alice' })
      expect(projection.nodes.get('/name' as JsonPointer)!.type).toBe('string')
      const result = await adapter.validate({})
      expect(result.valid).toBe(false)
    })
  })

  describe('draft 2019-09 support', () => {
    it('registers with the draft-2019-09 subpath and evaluates correctly', async () => {
      const adapter = await createHyperjumpAdapter(draft201909Schema)
      const projection = adapter.project({ name: 'Alice' })
      expect(projection.nodes.get('/name' as JsonPointer)!.type).toBe('string')
      const result = await adapter.validate({ name: 'Alice' })
      expect(result.valid).toBe(true)
    })
  })

  describe('unique URN generation', () => {
    it('does not collide across two adapter instances for the same schema', async () => {
      const first = await createHyperjumpAdapter(flatObjectSchema)
      const second = await createHyperjumpAdapter(flatObjectSchema)
      const firstProjection = first.project({ name: 'Alice', email: 'a@b.com' })
      const secondProjection = second.project({ name: 'Bob', email: 'b@c.com' })
      expect(firstProjection.nodes.get('/name' as JsonPointer)!.type).toBe('string')
      expect(secondProjection.nodes.get('/name' as JsonPointer)!.type).toBe('string')
    })
  })
})

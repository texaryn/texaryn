import { describe, it, expect } from 'vitest'
import type { SchemaEvaluationPort, JsonPointer } from '@texaryn/core'

type AdapterFactory = (schema: Record<string, unknown>) => Promise<SchemaEvaluationPort>

const flatObjectSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name', minLength: 1, maxLength: 100 },
    email: { type: 'string', title: 'Email', format: 'email' },
    nickname: { type: 'string', title: 'Nickname' },
  },
  required: ['name', 'email'],
}

const ifThenElseSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    accountType: { type: 'string', enum: ['personal', 'business'] },
  },
  required: ['accountType'],
  if: {
    properties: { accountType: { const: 'business' } },
    required: ['accountType'],
  },
  then: {
    properties: {
      companyName: { type: 'string', title: 'Company Name' },
    },
    required: ['companyName'],
  },
  else: {
    properties: {
      personalId: { type: 'string', title: 'Personal ID' },
    },
    required: ['personalId'],
  },
}

// Both branches declare the same key ("value") with a different type and title. This is
// the shape that both json-schema-library and hyperjump can be expected to agree on:
// resolving the correctly-active branch's own declaration for a shared key, not merely
// reporting active/inactive for disjoint per-branch keys. (Suppressing an *inactive*
// branch's annotations for a key that only exists in that branch is architecture-specific
// (hyperjump does it structurally via its evaluation plugin, json-schema-library does
// not) so it is exercised in each adapter's own unit tests, not asserted here.
const oneOfSharedKeySchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['a', 'b'] },
  },
  required: ['kind'],
  oneOf: [
    {
      properties: { kind: { const: 'a' }, value: { type: 'number', title: 'Branch A Value' } },
      required: ['value'],
    },
    {
      properties: { kind: { const: 'b' }, value: { type: 'string', title: 'Branch B Value' } },
      required: ['value'],
    },
  ],
}

const refSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $defs: {
    address: {
      type: 'object',
      title: 'Address',
      properties: {
        street: { type: 'string', title: 'Street', minLength: 1 },
        city: { type: 'string', title: 'City' },
      },
      required: ['street'],
    },
  },
  type: 'object',
  properties: {
    home: { $ref: '#/$defs/address' },
  },
  required: ['home'],
}

const dependentSchemasSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    creditCard: { type: 'string', title: 'Credit Card' },
  },
  dependentSchemas: {
    creditCard: {
      properties: {
        cvv: { type: 'string', title: 'CVV', minLength: 3, maxLength: 4 },
      },
      required: ['cvv'],
    },
  },
}

/**
 * A factory-parametrized suite run against every SchemaEvaluationPort implementation.
 * Asserts on the contract the port actually guarantees: `instancePointer` and `keyword`
 * on ValidationError (never `message` content, which is optional and adapter-specific),
 * and projection shape/activity, not adapter-internal representations.
 */
export function schemaPortConformanceSuite(name: string, factory: AdapterFactory): void {
  describe(`SchemaEvaluationPort conformance: ${name}`, () => {
    it('projects a flat object with type, constraints, annotations, and children', async () => {
      const adapter = await factory(flatObjectSchema)
      const projection = adapter.project({ name: 'Alice', email: 'a@b.com' })

      const root = projection.nodes.get('' as JsonPointer)!
      expect(root.type).toBe('object')
      expect(root.children?.map((c) => c.key).sort()).toEqual(['email', 'name', 'nickname'])
      expect(root.children?.find((c) => c.key === 'name')?.required).toBe(true)
      expect(root.children?.find((c) => c.key === 'nickname')?.required).toBe(false)

      const name = projection.nodes.get('/name' as JsonPointer)!
      expect(name.type).toBe('string')
      expect(name.constraints.minLength).toBe(1)
      expect(name.constraints.maxLength).toBe(100)
      expect(name.annotations.title).toBe('Name')

      expect(projection.nodes.get('/email' as JsonPointer)!.format).toBe('email')
    })

    it('projects conditional branches with correct active flags', async () => {
      const adapter = await factory(ifThenElseSchema)

      const business = adapter.project({ accountType: 'business', companyName: 'Acme' })
      expect(business.nodes.get('/companyName' as JsonPointer)?.active).toBe(true)
      expect(business.nodes.get('/personalId' as JsonPointer)?.active).toBe(false)

      const personal = adapter.project({ accountType: 'personal', personalId: 'p-1' })
      expect(personal.nodes.get('/personalId' as JsonPointer)?.active).toBe(true)
      expect(personal.nodes.get('/companyName' as JsonPointer)?.active).toBe(false)
    })

    it('resolves the active oneOf branch for a key shared across branches', async () => {
      const adapter = await factory(oneOfSharedKeySchema)
      const projection = adapter.project({ kind: 'b', value: 'hello' })
      const value = projection.nodes.get('/value' as JsonPointer)!
      expect(value.type).toBe('string')
      expect(value.annotations.title).toBe('Branch B Value')
    })

    it('follows local $ref into $defs', async () => {
      const adapter = await factory(refSchema)
      const projection = adapter.project({ home: { street: '1 Main St' } })
      const home = projection.nodes.get('/home' as JsonPointer)!
      expect(home.type).toBe('object')
      expect(home.annotations.title).toBe('Address')
      expect(projection.nodes.get('/home/street' as JsonPointer)?.type).toBe('string')
    })

    it('handles dependentSchemas activation', async () => {
      const adapter = await factory(dependentSchemasSchema)
      expect(adapter.project({ creditCard: '4111' }).nodes.get('/cvv' as JsonPointer)?.active).toBe(
        true,
      )
      expect(adapter.project({}).nodes.get('/cvv' as JsonPointer)?.active).toBe(false)
    })

    it('projects unfilled-but-active optional fields', async () => {
      const adapter = await factory(flatObjectSchema)
      // "nickname" is never given a value, but is still a declared, currently-reachable
      // field: it must appear active with its schema-declared annotations, not merely be
      // absent from the projection.
      const projection = adapter.project({ name: 'Alice', email: 'a@b.com' })
      const nickname = projection.nodes.get('/nickname' as JsonPointer)
      expect(nickname).toBeDefined()
      expect(nickname!.active).toBe(true)
      expect(nickname!.type).toBe('string')
      expect(nickname!.annotations.title).toBe('Nickname')
    })

    it('returns valid: true for conforming data', async () => {
      const adapter = await factory(flatObjectSchema)
      const result = await adapter.validate({ name: 'Alice', email: 'a@b.com' })
      expect(result).toEqual({ valid: true, errors: [] })
    })

    it('returns errors with instancePointer and keyword for violations', async () => {
      const adapter = await factory(flatObjectSchema)
      const result = await adapter.validate({ name: '' })
      expect(result.valid).toBe(false)
      expect(
        result.errors.some((e) => e.instancePointer === '/name' && e.keyword === 'minLength'),
      ).toBe(true)
      expect(
        result.errors.some((e) => e.instancePointer === '/email' && e.keyword === 'required'),
      ).toBe(true)
    })

    it('maps nested errors through $ref', async () => {
      const adapter = await factory(refSchema)
      const result = await adapter.validate({ home: { street: '' } })
      expect(result.valid).toBe(false)
      expect(
        result.errors.some((e) => e.instancePointer === '/home/street' && e.keyword === 'minLength'),
      ).toBe(true)
    })

    it('does not require message on ValidationError', async () => {
      const adapter = await factory(flatObjectSchema)
      const result = await adapter.validate({ name: '' })
      expect(result.valid).toBe(false)
      for (const error of result.errors) {
        expect(typeof error.instancePointer).toBe('string')
        expect(typeof error.keyword).toBe('string')
        // message is optional on ValidationError; adapters that don't provide one
        // (hyperjump) omit it entirely, and this suite never asserts on its content.
      }
    })
  })
}

import { describe, it, expect } from 'vitest'
import { createJsonSchemaAdapter } from '../index.js'
import type { JsonPointer } from '@texaryn/core'

const ifThenElseSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    accountType: { type: 'string', enum: ['personal', 'business'] },
    name: { type: 'string', title: 'Name' },
  },
  required: ['accountType', 'name'],
  if: {
    properties: { accountType: { const: 'business' } },
    required: ['accountType'],
  },
  then: {
    properties: {
      companyName: { type: 'string', title: 'Company Name' },
      taxId: { type: 'string', title: 'Tax ID' },
    },
    required: ['companyName'],
  },
  else: {
    properties: {
      nickname: { type: 'string', title: 'Nickname' },
    },
  },
}

const dependentRequiredSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    creditCard: { type: 'string', title: 'Credit Card' },
    billingAddress: { type: 'string', title: 'Billing Address' },
  },
  dependentRequired: {
    creditCard: ['billingAddress'],
  },
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

const draft07DepsSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    bar: { type: 'string', title: 'Bar' },
  },
  dependencies: {
    bar: {
      properties: {
        baz: { type: 'string', title: 'Baz' },
      },
      required: ['baz'],
    },
  },
}

describe('conditional evaluation', () => {
  describe('if/then/else', () => {
    it('shows then-branch fields when condition matches', async () => {
      const adapter = await createJsonSchemaAdapter(ifThenElseSchema)
      const projection = adapter.project({ accountType: 'business', name: 'Corp' })
      expect(projection.nodes.get('/companyName' as JsonPointer)?.active).toBe(true)
      expect(projection.nodes.get('/taxId' as JsonPointer)?.active).toBe(true)
      expect(projection.nodes.get('/nickname' as JsonPointer)?.active).toBe(false)
    })

    it('shows else-branch fields when condition does not match', async () => {
      const adapter = await createJsonSchemaAdapter(ifThenElseSchema)
      const projection = adapter.project({ accountType: 'personal', name: 'Alice' })
      expect(projection.nodes.get('/nickname' as JsonPointer)?.active).toBe(true)
      expect(projection.nodes.get('/companyName' as JsonPointer)?.active).toBe(false)
      expect(projection.nodes.get('/taxId' as JsonPointer)?.active).toBe(false)
    })

    it('updates active state when data changes', async () => {
      const adapter = await createJsonSchemaAdapter(ifThenElseSchema)

      const p1 = adapter.project({ accountType: 'personal', name: 'A' })
      expect(p1.nodes.get('/nickname' as JsonPointer)?.active).toBe(true)

      const p2 = adapter.project({ accountType: 'business', name: 'A' })
      expect(p2.nodes.get('/nickname' as JsonPointer)?.active).toBe(false)
      expect(p2.nodes.get('/companyName' as JsonPointer)?.active).toBe(true)
    })

    it('validates then-branch required fields', async () => {
      const adapter = await createJsonSchemaAdapter(ifThenElseSchema)
      const result = await adapter.validate({ accountType: 'business', name: 'Corp' })
      expect(result.valid).toBe(false)
      const companyError = result.errors.find(
        e => e.instancePointer.includes('companyName'),
      )
      expect(companyError).toBeDefined()
    })
  })

  describe('dependentRequired', () => {
    it('requires billingAddress when creditCard is present', async () => {
      const adapter = await createJsonSchemaAdapter(dependentRequiredSchema)
      const result = await adapter.validate({ creditCard: '1234' })
      expect(result.valid).toBe(false)
    })

    it('passes when both are present', async () => {
      const adapter = await createJsonSchemaAdapter(dependentRequiredSchema)
      const result = await adapter.validate({
        creditCard: '1234',
        billingAddress: '123 Main St',
      })
      expect(result.valid).toBe(true)
    })

    it('passes when creditCard is absent', async () => {
      const adapter = await createJsonSchemaAdapter(dependentRequiredSchema)
      const result = await adapter.validate({})
      expect(result.valid).toBe(true)
    })

    it('marks billingAddress required in the projection when creditCard is present', async () => {
      const adapter = await createJsonSchemaAdapter(dependentRequiredSchema)
      const projection = adapter.project({ creditCard: '1234' })
      const root = projection.nodes.get('' as JsonPointer)
      const billingAddress = root?.children?.find((c) => c.key === 'billingAddress')
      expect(billingAddress?.required).toBe(true)
    })

    it('marks billingAddress not required in the projection when creditCard is absent', async () => {
      const adapter = await createJsonSchemaAdapter(dependentRequiredSchema)
      const projection = adapter.project({})
      const root = projection.nodes.get('' as JsonPointer)
      const billingAddress = root?.children?.find((c) => c.key === 'billingAddress')
      expect(billingAddress?.required).toBe(false)
    })
  })

  describe('dependentSchemas', () => {
    it('shows dependent fields when trigger is present', async () => {
      const adapter = await createJsonSchemaAdapter(dependentSchemasSchema)
      const projection = adapter.project({ creditCard: '1234' })
      expect(projection.nodes.get('/cvv' as JsonPointer)?.active).toBe(true)
    })

    it('hides dependent fields when trigger is absent', async () => {
      const adapter = await createJsonSchemaAdapter(dependentSchemasSchema)
      const projection = adapter.project({})
      expect(projection.nodes.get('/cvv' as JsonPointer)?.active).toBe(false)
    })
  })

  describe('draft-07 dependencies', () => {
    it('shows dependent fields using draft-07 dependencies keyword', async () => {
      const adapter = await createJsonSchemaAdapter(draft07DepsSchema)
      const projection = adapter.project({ bar: 'value' })
      expect(projection.nodes.get('/baz' as JsonPointer)?.active).toBe(true)
    })

    it('hides dependent fields when trigger absent', async () => {
      const adapter = await createJsonSchemaAdapter(draft07DepsSchema)
      const projection = adapter.project({})
      expect(projection.nodes.get('/baz' as JsonPointer)?.active).toBe(false)
    })
  })
})

import { describe, it, expect } from 'vitest'
import { createJsonSchemaAdapter } from '../index.js'
import { flatObjectSchema } from './fixtures.js'

describe('validation', () => {
  it('returns valid: true for valid data', async () => {
    const adapter = await createJsonSchemaAdapter(flatObjectSchema)
    const result = await adapter.validate({ name: 'Alice', email: 'a@b.com' })
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('returns errors for missing required fields', async () => {
    const adapter = await createJsonSchemaAdapter(flatObjectSchema)
    const result = await adapter.validate({})
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    const nameError = result.errors.find((e) => e.instancePointer.includes('name'))
    expect(nameError).toBeDefined()
  })

  it('returns errors for constraint violations', async () => {
    const adapter = await createJsonSchemaAdapter(flatObjectSchema)
    const result = await adapter.validate({ name: '', email: 'a@b.com' })
    expect(result.valid).toBe(false)
    const minLengthError = result.errors.find((e) => e.keyword === 'minLength')
    expect(minLengthError).toBeDefined()
  })

  it('maps error instancePointer as JSON Pointer', async () => {
    const adapter = await createJsonSchemaAdapter(flatObjectSchema)
    const result = await adapter.validate({ name: '', email: 'a@b.com' })
    for (const error of result.errors) {
      expect(error.instancePointer).toMatch(/^\/|^$/)
    }
  })

  it('validateAt returns errors for a specific pointer', async () => {
    const adapter = await createJsonSchemaAdapter(flatObjectSchema)
    if (adapter.validateAt) {
      const result = await adapter.validateAt({ name: '', email: 'a@b.com' }, '/name' as any)
      expect(result.valid).toBe(false)
    }
  })

  it('validateAt scopes by the escaped pointer of a field whose key contains a slash', async () => {
    const adapter = await createJsonSchemaAdapter({
      type: 'object',
      properties: { 'a/b': { type: 'string' }, a: { type: 'string' } },
      required: ['a/b', 'a'],
    })
    const missing = await adapter.validateAt!({ a: 'x' }, '/a~1b' as any)
    expect(missing.errors.map((error) => error.instancePointer)).toEqual(['/a~1b'])
    expect((await adapter.validateAt!({ 'a/b': 'y', a: 'x' }, '/a~1b' as any)).valid).toBe(true)
    expect((await adapter.validateAt!({ 'a/b': 'y' }, '/a' as any)).errors.map((error) => error.instancePointer)).toEqual(['/a'])
  })
})

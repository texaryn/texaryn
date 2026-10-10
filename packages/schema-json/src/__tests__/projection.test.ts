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

describe('boolean item schemas', () => {
  const dialects = {
    'draft-07': 'http://json-schema.org/draft-07/schema#',
    '2019-09': 'https://json-schema.org/draft/2019-09/schema',
    '2020-12': 'https://json-schema.org/draft/2020-12/schema',
  }
  const shapes: [string, Record<string, unknown>, unknown[]][] = [
    ['items false', { type: 'array', items: false }, []],
    ['items false with an element', { type: 'array', items: false }, [1]],
    ['items true', { type: 'array', items: true }, [1]],
  ]

  for (const [dialect, $schema] of Object.entries(dialects)) {
    it.each(shapes)(`projects %s in ${dialect} as an array without element nodes`, async (_name, schema, data) => {
      const adapter = await createJsonSchemaAdapter({ $schema, properties: { k: schema } })
      const nodes = adapter.project({ k: data }).nodes
      expect(nodes.get('/k' as never)?.type).toBe('array')
      expect(nodes.get('/k' as never)?.itemAnnotations).toBeUndefined()
      expect([...nodes.keys()].filter((pointer) => pointer.startsWith('/k/'))).toEqual([])
    })
  }

  it('projects a 2020-12 tuple closed with items false', async () => {
    const adapter = await createJsonSchemaAdapter({
      $schema: dialects['2020-12'],
      properties: { k: { type: 'array', prefixItems: [{ type: 'string' }], items: false } },
    })
    expect(adapter.project({ k: ['a'] }).nodes.get('/k' as never)?.type).toBe('array')
    expect(adapter.project({}).nodes.get('/k' as never)?.type).toBe('array')
  })
})

describe('data-dependent additional properties', () => {
  it('recomputes candidate names for each projection of the same schema', async () => {
    const adapter = await createJsonSchemaAdapter({
      type: 'object',
      properties: { known: { type: 'string' } },
      additionalProperties: { type: 'string' },
    })

    const first = adapter.project({ first: 'one' })
    const second = adapter.project({ second: 'two' })

    expect(first.nodes.has('/first' as never)).toBe(true)
    expect(second.nodes.has('/second' as never)).toBe(true)
    expect(second.nodes.has('/first' as never)).toBe(false)
  })
})

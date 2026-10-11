import { describe, expect, it } from 'vitest'
import { Type } from '@sinclair/typebox'
import { createJsonSchemaAdapter } from '../index.js'
import type { JsonPointer } from '@texaryn/core'

describe('TypeBox schemas through createJsonSchemaAdapter', () => {
  it('projects and validates TypeBox JSON Schema without a second adapter', async () => {
    const schema = Type.Object({
      name: Type.String({ minLength: 2 }),
      active: Type.Optional(Type.Boolean()),
    })
    const adapter = await createJsonSchemaAdapter(schema)
    const projection = adapter.project({})

    expect(projection.nodes.get('/name' as JsonPointer)?.constraints.minLength).toBe(2)
    expect(projection.nodes.has('/active' as JsonPointer)).toBe(true)
    expect((await adapter.validate({ name: 'A' })).valid).toBe(false)
    expect((await adapter.validate({ name: 'Ada', active: true })).valid).toBe(true)
  })
})

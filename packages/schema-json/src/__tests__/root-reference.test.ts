import { describe, it, expect } from 'vitest'
import { createJsonSchemaAdapter } from '../index.js'

const anonymousTree = { type: 'object', properties: { name: { type: 'string' }, child: { $ref: '#' } } }

describe('a root reference in draft-07', () => {
  it('validates against the root before anything has projected', async () => {
    const adapter = await createJsonSchemaAdapter(anonymousTree, { defaultDialect: 'draft-07' })
    expect((await adapter.validate({ child: 'text' })).valid).toBe(false)
    expect((await adapter.validate({ child: { name: 'n' } })).valid).toBe(true)
  })

  it('validates against the root beside a branch the projection drops', async () => {
    const adapter = await createJsonSchemaAdapter({ ...anonymousTree, then: { type: 'string' } }, { defaultDialect: 'draft-07' })
    expect([...adapter.project({}).nodes.keys()].sort()).toEqual(['', '/child', '/child/name', '/name'])
    expect((await adapter.validate({ child: 'text' })).valid).toBe(false)
    expect((await adapter.validate({ child: { name: 'n' } })).valid).toBe(true)
  })

  it('projects and validates an $id root', async () => {
    const adapter = await createJsonSchemaAdapter(
      { $id: 'https://example.com/tree', ...anonymousTree },
      { defaultDialect: 'draft-07' },
    )
    expect([...adapter.project({}).nodes.keys()].sort()).toEqual(['', '/child', '/child/name', '/name'])
    expect((await adapter.validate({ child: 'text' })).valid).toBe(false)
  })

  it('keeps two anonymous schemas apart', async () => {
    const a = await createJsonSchemaAdapter(anonymousTree, { defaultDialect: 'draft-07' })
    const b = await createJsonSchemaAdapter(
      { type: 'object', properties: { n: { type: 'number' }, child: { $ref: '#' } } },
      { defaultDialect: 'draft-07' },
    )
    expect((await a.validate({ child: { name: 'x' } })).valid).toBe(true)
    expect((await b.validate({ child: { n: 'x' } })).valid).toBe(false)
    expect((await a.validate({ child: 1 })).valid).toBe(false)
    expect((await b.validate({ child: { n: 1 } })).valid).toBe(true)
  })
})

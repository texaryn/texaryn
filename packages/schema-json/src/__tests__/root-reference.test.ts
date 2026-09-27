import { describe, it, expect } from 'vitest'
import { compileSchema } from 'json-schema-library'
import { createJsonSchemaAdapter } from '../index.js'
import { fixRootReference } from '../root-reference.js'

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

describe('failing closed', () => {
  function withContext(context: Record<string, unknown> | undefined) {
    const root: Record<string, unknown> = {}
    if (context) root.context = { rootNode: root, ...context }
    return root as never
  }

  it.each([
    ['no context', withContext(undefined)],
    ['a context whose root is another node', withContext({ rootNode: {}, refs: {} })],
    ['a registry that is not a plain object', withContext({ refs: new Map() })],
  ])('refuses a compiled root with %s', (_label, root) => {
    expect(() => fixRootReference(root, 'draft-07')).toThrow(/json-schema-library 11\.6\.2/)
  })

  it('leaves the other dialects alone', () => {
    const root = compileSchema(anonymousTree, { draft: 'draft-2020-12' })
    expect(() => fixRootReference(root, '2020-12')).not.toThrow()
  })
})

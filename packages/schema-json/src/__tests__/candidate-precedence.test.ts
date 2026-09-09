import { describe, it, expect } from 'vitest'
import { createJsonSchemaAdapter } from '../index.js'
import type { JsonPointer } from '@texaryn/core'

async function project(schema: unknown, data: unknown) {
  const adapter = await createJsonSchemaAdapter(schema, { defaultDialect: 'draft-07' })
  return adapter.project(data)
}

/**
 * Recursion through applicators made an existing arbitrary rule far easier to
 * reach, so the rule is now stated and pinned instead of being whatever the
 * traversal happened to do first.
 */
describe('two branches defining the same key', () => {
  const competing = {
    type: 'object',
    properties: { kind: { type: 'string' } },
    oneOf: [
      {
        properties: {
          kind: { const: 'text' },
          value: { type: 'string', title: 'Text value' },
        },
      },
      {
        properties: {
          kind: { const: 'structured' },
          value: {
            type: 'object',
            title: 'Structured value',
            properties: { x: { type: 'string' } },
          },
        },
      },
    ],
  }

  /**
   * With a branch active there is no ambiguity to resolve: the reduced node is
   * authoritative and the prototype is never consulted. This is the case that
   * has to be right, because it is the one a person sees.
   */
  it('uses the active branch, whichever one it is', async () => {
    const asText = await project(competing, { kind: 'text' })
    expect(asText.nodes.get('/value' as JsonPointer)?.type).toBe('string')
    expect(asText.nodes.get('/value' as JsonPointer)?.annotations.title).toBe('Text value')

    const asStructured = await project(competing, { kind: 'structured' })
    expect(asStructured.nodes.get('/value' as JsonPointer)?.type).toBe('object')
    expect(asStructured.nodes.get('/value' as JsonPointer)?.annotations.title).toBe(
      'Structured value',
    )
  })

  /**
   * With no branch active something still has to be projected, because an
   * inactive node is compiled rather than discarded and `active` is what hides
   * it. The rule is the first branch the schema declares, which is stable
   * across runs and across traversal changes.
   *
   * It is a placeholder and not a claim that the first branch matters more.
   * That is why the collector keeps every alternative rather than collapsing to
   * one node: a later change can give this a real policy without having to
   * rediscover what the branches were.
   */
  it('falls back to the first declared branch when none is active', async () => {
    const projection = await project(competing, { kind: 'neither' })

    const value = projection.nodes.get('/value' as JsonPointer)
    expect(value?.active).toBe(false)
    expect(value?.type).toBe('string')
    expect(value?.annotations.title).toBe('Text value')
  })

  /**
   * A key the node declares itself outranks any branch that also mentions it,
   * because the node's own `properties` is the more specific statement about
   * that location. `kind` is declared directly and constrained by every
   * branch, and the direct declaration is what shows.
   */
  it('prefers the node’s own declaration over a branch that redeclares it', async () => {
    const projection = await project(competing, { kind: 'neither' })
    expect(projection.nodes.get('/kind' as JsonPointer)?.type).toBe('string')
    expect(projection.nodes.get('/kind' as JsonPointer)?.enumValues).toBeUndefined()
  })

  /** Order comes from the schema, so reversing the branches reverses it. */
  it('is decided by declaration order and nothing else', async () => {
    const reversed = { ...competing, oneOf: [...competing.oneOf].reverse() }
    const projection = await project(reversed, { kind: 'neither' })
    expect(projection.nodes.get('/value' as JsonPointer)?.type).toBe('object')
    expect(projection.nodes.get('/value' as JsonPointer)?.annotations.title).toBe(
      'Structured value',
    )
  })
})

/**
 * References that come back to where they started.
 *
 * The collector's guard has to key on something stable, and the obvious choice
 * does not work: `resolveRef()` returns a fresh `SchemaNode` on every call and
 * the raw schema object it wraps is fresh too, so an identity `Set` never
 * matches and a cycle would not terminate. It keys on `schemaLocation`
 * instead, which repeats on a cycle and stays distinct per branch position.
 * If the applicator cases below hang rather than pass, that assumption is back.
 */
describe('recursive references', () => {
  const tree = {
    $id: 'https://example.com/tree',
    type: 'object',
    properties: {
      name: { type: 'string' },
      child: { $ref: '#' },
    },
  }

  /**
   * A separate, pre-existing defect that writing these tests uncovered, pinned
   * here rather than fixed, because it is a different mechanism: `walk`
   * descends into every declared property whether or not the data reaches it,
   * which is deliberate and is what lets an untouched optional field render.
   * A schema referring to itself therefore has no bound on that descent, and
   * the collector's own guard cannot help, because the recursion is not in the
   * collector.
   *
   * Verified against `main` before this change, so it is not a regression from
   * recursive candidate collection. Tracked as issue #119. When it is fixed
   * this test fails, which is the intended way to find it.
   */
  it('overflows the stack on a self-referential property, still', async () => {
    const adapter = await createJsonSchemaAdapter(tree, { defaultDialect: 'draft-07' })
    expect(() => adapter.project({ name: 'root' })).toThrow(RangeError)
  })

  it('handles a cycle reached through an applicator', async () => {
    const viaApplicator = {
      $id: 'https://example.com/loop',
      type: 'object',
      properties: { flag: { type: 'boolean' } },
      allOf: [{ if: { properties: { flag: { const: true } } }, then: { $ref: '#' } }],
    }
    const pointers = [...(await project(viaApplicator, { flag: true })).nodes.keys()]
    expect(pointers).toContain('/flag')
  })

  it('shares one definition between two properties', async () => {
    const shared = {
      type: 'object',
      definitions: { addr: { type: 'object', properties: { city: { type: 'string' } } } },
      properties: { home: { $ref: '#/definitions/addr' }, work: { $ref: '#/definitions/addr' } },
    }
    const pointers = [...(await project(shared, { home: {}, work: {} })).nodes.keys()]
    // The same schema location at two instance locations: deduplication is per
    // collector call, so neither shadows the other.
    expect(pointers).toContain('/home/city')
    expect(pointers).toContain('/work/city')
  })
})

/**
 * The regression condition for keeping this change separate from the
 * `oneOf`-inside-`dependencies` crash. That defect is downstream of the
 * candidate collector: `walk` reduces the node before it collects candidates,
 * so recursive collection cannot repair or mask it. If this test starts
 * passing, the two concerns were conflated and the crash's own fix needs
 * rewriting rather than deleting this.
 */
describe('the oneOf-inside-dependencies crash is untouched', () => {
  const crashing = {
    type: 'object',
    properties: { flag: { type: 'boolean' } },
    dependencies: {
      flag: {
        oneOf: [
          { properties: { flag: { const: false } } },
          { properties: { flag: { const: true } }, required: ['extra'] },
        ],
      },
    },
  }

  it('still throws while the data satisfies no branch', async () => {
    const adapter = await createJsonSchemaAdapter(crashing, { defaultDialect: 'draft-07' })
    expect((await adapter.validate({ flag: true })).valid).toBe(false)
    expect(() => adapter.project({ flag: true })).toThrow(TypeError)
  })

  it('still projects once a branch is satisfied', async () => {
    const adapter = await createJsonSchemaAdapter(crashing, { defaultDialect: 'draft-07' })
    expect(() => adapter.project({ flag: true, extra: 'x' })).not.toThrow()
  })
})

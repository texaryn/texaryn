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
   * `tree` is deliberately not projected here.
   *
   * A self-referential property overflows the stack, because `walk` descends
   * into every declared property whether the data reaches it or not, so the
   * descent has no bound. That is a pre-existing defect on a different
   * mechanism from this collector's guard, verified against `main` before this
   * change, and it is tracked as issue #119 with the reproduction.
   *
   * It is documented and tracked, not pinned. There is no regression test for
   * it here, so nothing will fail when it is fixed, and the first attempt to
   * write one is the reason:
   * `toThrow(RangeError)` passed locally and failed in CI, because available
   * stack depth varies with the platform and with the coverage instrumentation
   * CI runs. A test that depends on where the stack happens to run out is not
   * evidence of anything. The deterministic half of the same behaviour, that
   * descent is static rather than data-driven, is already pinned by
   * "derives a shape at every depth" in `implicit-types.test.ts`.
   */

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
 * The regression condition that kept the nested-applicator work separate from
 * the `oneOf`-inside-`dependencies` crash has been retired, having done its
 * job. It asserted the crash still threw, so that recursive candidate
 * discovery could be shown not to have fixed it by accident, and it stayed red
 * until the crash was fixed on purpose. The behaviour it guarded now lives in
 * `dependency-composition.test.ts`, which asserts the projection succeeds
 * rather than that it throws.
 */

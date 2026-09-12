import { describe, it, expect } from 'vitest'
import type { JsonPointer, SchemaEvaluationPort } from '@texaryn/core'

type AdapterFactory = (schema: Record<string, unknown>) => Promise<SchemaEvaluationPort>

/**
 * Two `default` declarations that both apply to one location, as a port
 * contract rather than one adapter's merge order.
 *
 * `AnnotationSet.default` is a single value, so an adapter that merges before
 * core sees anything reports whichever declaration its merge happened to keep.
 * Measured on `main` before this suite existed, for
 * `allOf: [{ x: default 'a' }, { x: default 'b' }]`:
 * json-schema-library reported `'b'`, @hyperjump/json-schema reported `'a'`.
 * Neither is wrong, which is the point: there is no value here that both
 * adapters could agree on, so the port reports the disagreement and omits the
 * annotation.
 *
 * Scope, and it is deliberately narrow: declarations that apply to every
 * instance. A location's own declaration and those reached from it through
 * `allOf` and `$ref` are unconditional, so whether they disagree is a fact
 * about the schema. A `oneOf` branch's declaration competing with the base is
 * the same defect, and it is not reported here, because `SchemaProjection.
 * diagnostics` describes schemas rather than states of the data: that conflict
 * appears and disappears as the discriminator is typed, and a channel that
 * flaps is a channel callers learn to ignore.
 *
 * `items` is an unconditional edge for the same reason `properties` is: it
 * addresses a different location rather than conditioning on the instance, so
 * an element the data provides reports its conflicts like any other node.
 */
export function defaultConflictSuite(name: string, createAdapter: AdapterFactory): void {
  const project = async (schema: Record<string, unknown>, data: unknown) => {
    const port = await createAdapter(schema)
    return port.project(data)
  }

  /**
   * The annotation and the diagnostic at one pointer.
   *
   * `sources` comes back sorted. Which order an adapter walks its own
   * applicators in is not a contract, and pinning it would fail a suite over a
   * traversal detail; that the set is exactly the conflicting declarations is
   * the contract.
   */
  const at = async (schema: Record<string, unknown>, data: unknown, pointer: string) => {
    const projection = await project(schema, data)
    const node = projection.nodes.get(pointer as JsonPointer)
    const reported = (projection.diagnostics ?? []).filter(
      (d) => d.pointer === pointer && d.code === 'ambiguous-default',
    )
    return {
      present: node !== undefined,
      hasDefault: node !== undefined && 'default' in node.annotations,
      default: node?.annotations.default,
      reported: reported.length,
      sources: reported[0]?.sources ? [...reported[0].sources].sort() : undefined,
    }
  }

  describe(`${name}: disagreeing applicable defaults`, () => {
    it('omits the default and reports both branches, for the issue #128 fixture', async () => {
      const schema = {
        type: 'object',
        allOf: [
          { properties: { x: { type: 'string', default: 'a' } } },
          { properties: { x: { type: 'string', default: 'b' } } },
        ],
      }
      expect(await at(schema, {}, '/x')).toEqual({
        present: true,
        hasDefault: false,
        default: undefined,
        reported: 1,
        sources: ['/allOf/0/properties/x', '/allOf/1/properties/x'],
      })
    })

    // The tempting wrong rule, and the reason the fix is not "nearest wins".
    // json-schema-library's own merge resolves this to the branch, not to the
    // property, so "own declaration" is not nearer in any sense the evaluator
    // recognises. In JSON Schema the two are conjunctive and neither is nearer.
    it('treats the node own declaration as one competing declaration, not as the nearest', async () => {
      const schema = {
        type: 'object',
        properties: { x: { type: 'string', default: 'own' } },
        allOf: [{ properties: { x: { default: 'branch' } } }],
      }
      expect(await at(schema, {}, '/x')).toEqual({
        present: true,
        hasDefault: false,
        default: undefined,
        reported: 1,
        sources: ['/allOf/0/properties/x', '/properties/x'],
      })
    })

    it('keeps the default when two declarations agree', async () => {
      const schema = {
        type: 'object',
        allOf: [
          { properties: { x: { type: 'string', default: 'same' } } },
          { properties: { x: { type: 'string', default: 'same' } } },
        ],
      }
      expect(await at(schema, {}, '/x')).toEqual({
        present: true,
        hasDefault: true,
        default: 'same',
        reported: 0,
        sources: undefined,
      })
    })

    // Agreement is on the value, not on the reference. ADR-003's own pass
    // compares declarations with a deep equality, so two branches declaring the
    // same object have nothing to choose between.
    it('compares declarations by value rather than by identity', async () => {
      const schema = {
        type: 'object',
        allOf: [
          { properties: { x: { type: 'object', default: { k: [1, 2] } } } },
          { properties: { x: { type: 'object', default: { k: [1, 2] } } } },
        ],
      }
      expect(await at(schema, {}, '/x')).toEqual({
        present: true,
        hasDefault: true,
        default: { k: [1, 2] },
        reported: 0,
        sources: undefined,
      })
    })

    it('reports nothing for a single declaration', async () => {
      const schema = {
        type: 'object',
        properties: { x: { type: 'string', default: 'only' } },
      }
      expect(await at(schema, {}, '/x')).toEqual({
        present: true,
        hasDefault: true,
        default: 'only',
        reported: 0,
        sources: undefined,
      })
    })

    it('reports a conflict declared by the location own allOf', async () => {
      const schema = {
        type: 'object',
        properties: { x: { type: 'string', allOf: [{ default: 'a' }, { default: 'b' }] } },
      }
      expect(await at(schema, {}, '/x')).toEqual({
        present: true,
        hasDefault: false,
        default: undefined,
        reported: 1,
        sources: ['/properties/x/allOf/0', '/properties/x/allOf/1'],
      })
    })

    it('reports a conflict at the root', async () => {
      const schema = {
        type: 'object',
        allOf: [{ default: { k: 'a' } }, { default: { k: 'b' } }],
      }
      expect(await at(schema, {}, '')).toEqual({
        present: true,
        hasDefault: false,
        default: undefined,
        reported: 1,
        sources: ['/allOf/0', '/allOf/1'],
      })
    })

    // A `$ref` is unconditional, so it carries declarations into the conflict,
    // and the source that names one is the location it resolves to rather than
    // the position that pointed at it. Both adapters already track it that way.
    it('names the resolved location of a declaration reached through $ref', async () => {
      const schema = {
        type: 'object',
        properties: { x: { type: 'string', default: 'own' } },
        allOf: [{ $ref: '#/$defs/other' }],
        $defs: { other: { properties: { x: { default: 'other' } } } },
      }
      expect(await at(schema, {}, '/x')).toEqual({
        present: true,
        hasDefault: false,
        default: undefined,
        reported: 1,
        sources: ['/$defs/other/properties/x', '/properties/x'],
      })
    })

    // Inside a branch, `allOf` is unconditional relative to that branch, and
    // that is a weaker thing than applying to every instance: the two
    // declarations compete only where the branch is selected. So this is the
    // conditional case in a different position, and it stays unreported for the
    // same reason. Pinned as a boundary rather than left to be discovered,
    // because the rule reads as if it should catch this.
    it('leaves a disagreement carried by one conditional branch unreported', async () => {
      const schema = {
        type: 'object',
        properties: { kind: { type: 'string' } },
        oneOf: [
          {
            properties: { kind: { const: 'a' } },
            allOf: [
              { properties: { x: { type: 'string', default: 'a' } } },
              { properties: { x: { type: 'string', default: 'b' } } },
            ],
          },
        ],
      }
      expect((await at(schema, { kind: 'a' }, '/x')).reported).toBe(0)
    })

    it('reports a conflict under an array item the data provides', async () => {
      const schema = {
        type: 'object',
        properties: {
          rows: {
            type: 'array',
            items: {
              type: 'object',
              allOf: [
                { properties: { x: { type: 'string', default: 'a' } } },
                { properties: { x: { type: 'string', default: 'b' } } },
              ],
            },
          },
        },
      }
      expect(await at(schema, { rows: [{}] }, '/rows/0/x')).toEqual({
        present: true,
        hasDefault: false,
        default: undefined,
        reported: 1,
        sources: [
          '/properties/rows/items/allOf/0/properties/x',
          '/properties/rows/items/allOf/1/properties/x',
        ],
      })
    })

    // The boundary, pinned so that narrowing it later is a deliberate change
    // rather than an accident. The base and the selected branch both apply and
    // disagree, which is the same defect, and it stays unreported because
    // whether it holds is a fact about the data: an adapter reports a default
    // here and the two adapters need not report the same one.
    it('leaves a conditional disagreement unreported', async () => {
      const schema = {
        type: 'object',
        properties: { kind: { type: 'string' }, x: { type: 'string', default: 'own' } },
        oneOf: [
          { properties: { kind: { const: 'a' }, x: { default: 'from-a' } } },
          { properties: { kind: { const: 'b' }, x: { default: 'from-b' } } },
        ],
      }
      const result = await at(schema, { kind: 'b' }, '/x')
      expect(result.reported).toBe(0)
      expect(result.hasDefault).toBe(true)
    })

    // Declarations from two branches of one `oneOf` never apply together, so
    // they are not a disagreement however different they are.
    it('does not report declarations that belong to different branches of one oneOf', async () => {
      const schema = {
        type: 'object',
        properties: { kind: { type: 'string' } },
        oneOf: [
          { properties: { kind: { const: 'a' }, x: { type: 'string', default: 'from-a' } } },
          { properties: { kind: { const: 'b' }, x: { type: 'string', default: 'from-b' } } },
        ],
      }
      expect((await at(schema, { kind: 'a' }, '/x')).reported).toBe(0)
    })
  })
}

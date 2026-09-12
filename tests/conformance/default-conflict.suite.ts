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
 * Two channels, because there are two facts. `NodeProjection.defaultConflict`
 * carries every disagreement that applies to the instance as it stands, which
 * is what a runtime acts on. `SchemaProjection.diagnostics` carries the subset
 * that holds whatever the instance is: a location's own declaration against
 * those reached through `allOf` and `$ref`, which is a contradiction in the
 * schema and is worth telling whoever wrote it. A declaration carried by
 * `oneOf`, `anyOf`, `if`/`then`/`else` or `dependentSchemas` appears on the node
 * only, because it comes and goes as the discriminator is typed and a
 * diagnostics channel that flaps is one callers learn to ignore.
 *
 * Applicability for the node channel is exposure rather than validity: a
 * provisionally selected branch competes, because ADR-003 fills from one.
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
   * The annotation, the node's own conflict, and the diagnostic at one pointer.
   *
   * `sources` and `conflict` come back sorted. Which order an adapter walks its
   * own applicators in is not a contract, and pinning it would fail a suite over
   * a traversal detail; that the set is exactly the conflicting declarations is
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
      conflict: node?.defaultConflict ? [...node.defaultConflict].sort() : undefined,
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
        conflict: ['/allOf/0/properties/x', '/allOf/1/properties/x'],
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
        conflict: ['/allOf/0/properties/x', '/properties/x'],
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
        conflict: ['/properties/x/allOf/0', '/properties/x/allOf/1'],
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
        conflict: ['/allOf/0', '/allOf/1'],
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
        conflict: ['/$defs/other/properties/x', '/properties/x'],
      })
    })

    // Inside a branch, `allOf` is unconditional relative to that branch, and
    // that is a weaker thing than applying to every instance: the two
    // declarations compete only where the branch is selected. So the node
    // carries it and the diagnostic does not.
    it('carries a disagreement inside a selected branch on the node, not as a diagnostic', async () => {
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
      expect(await at(schema, { kind: 'a' }, '/x')).toEqual({
        present: true,
        hasDefault: false,
        default: undefined,
        reported: 0,
        sources: undefined,
        conflict: ['/oneOf/0/allOf/0/properties/x', '/oneOf/0/allOf/1/properties/x'],
      })
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
        conflict: [
          '/properties/rows/items/allOf/0/properties/x',
          '/properties/rows/items/allOf/1/properties/x',
        ],
      })
    })

    /**
     * The base and the selected branch both apply and disagree. Before #142
     * this collapsed to whichever value the adapter's merge kept:
     * json-schema-library reported `'from-b'` and @hyperjump/json-schema
     * reported `'own'`, for the same schema and the same data.
     */
    it('carries a selected branch disagreeing with the base on the node', async () => {
      const schema = {
        type: 'object',
        properties: { kind: { type: 'string' }, x: { type: 'string', default: 'own' } },
        oneOf: [
          { properties: { kind: { const: 'a' }, x: { default: 'from-a' } } },
          { properties: { kind: { const: 'b' }, x: { default: 'from-b' } } },
        ],
      }
      expect(await at(schema, { kind: 'b' }, '/x')).toEqual({
        present: true,
        hasDefault: false,
        default: undefined,
        reported: 0,
        sources: undefined,
        conflict: ['/oneOf/1/properties/x', '/properties/x'],
      })
    })

    // The same location, with the branch not selected: nothing competes with
    // the base, so the base's declaration stands. The conflict has to come and
    // go with the data, which is why it is on the node and not a diagnostic.
    it('keeps the base default while no branch is selected', async () => {
      const schema = {
        type: 'object',
        properties: { kind: { type: 'string' }, x: { type: 'string', default: 'own' } },
        oneOf: [
          { properties: { kind: { const: 'a' }, x: { default: 'from-a' } } },
          { properties: { kind: { const: 'b' }, x: { default: 'from-b' } } },
        ],
      }
      expect(await at(schema, {}, '/x')).toMatchObject({
        hasDefault: true,
        default: 'own',
        conflict: undefined,
      })
    })

    /**
     * Several `anyOf` branches can apply at once, so two of them declaring
     * different values is a disagreement like any other. Before #142 this was
     * the same first-wins/last-wins split #144 measured for `allOf`:
     * json-schema-library kept `'from-second'` and @hyperjump/json-schema kept
     * `'from-first'`.
     */
    it('carries two matching anyOf branches that disagree', async () => {
      const schema = {
        type: 'object',
        properties: { x: { type: 'string' } },
        anyOf: [
          { properties: { flag: { type: 'boolean' }, x: { default: 'from-first' } } },
          { properties: { other: { type: 'string' }, x: { default: 'from-second' } } },
        ],
      }
      expect(await at(schema, { flag: true, other: 'y' }, '/x')).toMatchObject({
        hasDefault: false,
        conflict: ['/anyOf/0/properties/x', '/anyOf/1/properties/x'],
      })
    })

    /**
     * A provisionally selected branch competes, though JSON Schema says it does
     * not apply: `kind: 'person'` names the branch while `name` is required and
     * absent. ADR-003 fills by exposure, so a policy would fill this location
     * from the branch, and a disagreement has to be visible wherever the fill
     * would happen.
     *
     * Measured before #142: json-schema-library filled `'from-branch'` and
     * @hyperjump/json-schema filled `'base'`.
     */
    it('carries a provisionally selected branch disagreeing with the base', async () => {
      const schema = {
        type: 'object',
        properties: { kind: { type: 'string' }, nickname: { type: 'string', default: 'base' } },
        oneOf: [
          {
            properties: { kind: { const: 'person' }, nickname: { default: 'from-branch' } },
            required: ['name'],
          },
          { properties: { kind: { const: 'company' } }, required: ['org'] },
        ],
      }
      expect(await at(schema, { kind: 'person' }, '/nickname')).toMatchObject({
        hasDefault: false,
        conflict: ['/oneOf/0/properties/nickname', '/properties/nickname'],
      })
    })

    /**
     * A branch declaration competing with nothing is still a declaration. This
     * is ADR-003's own `nickname: 'anon'` row, and it is why the rule cannot be
     * "refuse anything a conditional branch declared": that would empty a field
     * whose schema says exactly what it should hold.
     */
    it('keeps a branch declaration that competes with nothing', async () => {
      const schema = {
        type: 'object',
        properties: { kind: { type: 'string' } },
        oneOf: [
          {
            properties: { kind: { const: 'person' }, nickname: { type: 'string', default: 'anon' } },
            required: ['name'],
          },
          { properties: { kind: { const: 'company' } }, required: ['org'] },
        ],
      }
      expect(await at(schema, { kind: 'person' }, '/nickname')).toMatchObject({
        hasDefault: true,
        default: 'anon',
        conflict: undefined,
      })
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
      expect(await at(schema, { kind: 'a' }, '/x')).toMatchObject({
        reported: 0,
        conflict: undefined,
      })
    })

    // `if`/`then` is a conditional edge like any other, so a `then` declaration
    // competing with the base is carried while `if` matches.
    it('carries a then branch disagreeing with the base', async () => {
      const schema = {
        type: 'object',
        properties: { flag: { type: 'boolean' }, x: { type: 'string', default: 'own' } },
        if: { properties: { flag: { const: true } }, required: ['flag'] },
        then: { properties: { x: { default: 'from-then' } } },
      }
      expect(await at(schema, { flag: true }, '/x')).toMatchObject({
        hasDefault: false,
        conflict: ['/properties/x', '/then/properties/x'],
      })
    })

    it('keeps the base default while the if does not match', async () => {
      const schema = {
        type: 'object',
        properties: { flag: { type: 'boolean' }, x: { type: 'string', default: 'own' } },
        if: { properties: { flag: { const: true } }, required: ['flag'] },
        then: { properties: { x: { default: 'from-then' } } },
      }
      expect(await at(schema, { flag: false }, '/x')).toMatchObject({
        hasDefault: true,
        default: 'own',
        conflict: undefined,
      })
    })
  })
}

import { describe, it, expect } from 'vitest'
import type { JsonPointer, SchemaEvaluationPort } from '@texaryn/core'

type AdapterFactory = (schema: Record<string, unknown>) => Promise<SchemaEvaluationPort>

/**
 * What a port does with an instance holding `undefined`, which is not a JSON
 * value and which the runtime nonetheless produces.
 *
 * A cleared number input becomes `undefined` in the binding, `SetValue` keeps
 * the key holding it, and ADR-003 depends on that: a location that has been
 * filled must not become absent again, or a cleared field is eligible for its
 * schema default and cannot be cleared at all. So the data reaching the port
 * legitimately contains `undefined`, and the port has to say what it means
 * rather than refuse it. @hyperjump/json-schema's `Instance.fromJs` threw
 * `Not a JSON compatible type: undefined`, out of `dispatch`, on a keystroke.
 *
 * The answer is absent, which is both what json-schema-library already did and
 * what the wire says: `JSON.stringify({ a: undefined })` is `{}`. A validator
 * that disagreed with the payload about which properties exist would accept
 * what the submission rejects.
 *
 * Arrays are deliberately not asserted here. `JSON.stringify([undefined])` is
 * `[null]`, so "absent" and "what will be submitted" stop agreeing, and the two
 * adapters give different answers. Nothing produces such an element today:
 * `InsertItem` writes `null` and `setAtPointer` writes what it is given. What an
 * omitted row should hold is #127, and that is where the array case belongs.
 */
export function undefinedInstanceSuite(name: string, createAdapter: AdapterFactory): void {
  const schema = {
    type: 'object',
    properties: { age: { type: 'number' }, name: { type: 'string' } },
  }

  const requiredSchema = {
    type: 'object',
    properties: { age: { type: 'number' } },
    required: ['age'],
  }

  describe(`${name}: an instance holding undefined`, () => {
    it('validates a property holding undefined as absent', async () => {
      const port = await createAdapter(schema)
      expect(await port.validate({ age: undefined, name: 'x' })).toEqual({
        valid: true,
        errors: [],
      })
    })

    // The other half of "absent", and the one that would go unnoticed: a
    // property the schema requires has to be reported missing when it holds
    // `undefined`, or clearing a required field would silently satisfy it.
    // The pointer is asserted, not only the keyword. A `required` error names
    // the object by default and is narrowed to the missing property by working
    // out which keys the data lacks, so an adapter that converted the instance
    // for the validator and not for that step would report the same keyword
    // against the wrong location.
    it('reports a required property holding undefined as missing', async () => {
      const port = await createAdapter(requiredSchema)
      const result = await port.validate({ age: undefined })
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({ instancePointer: '/age', keyword: 'required' }),
      )
    })

    it('projects an instance holding undefined without throwing', async () => {
      const port = await createAdapter(schema)
      const projection = port.project({ age: undefined, name: 'x' })
      expect(projection.nodes.get('/age' as JsonPointer)?.type).toBe('number')
    })

    // `null` is a value and stays one. The whole point of reading `undefined` as
    // absent is that the two stop being interchangeable, which is the same
    // distinction #124 and #127 are about at their own sites.
    it('keeps null a value rather than an absence', async () => {
      const port = await createAdapter(schema)
      const result = await port.validate({ age: null })
      expect(result.valid).toBe(false)
      expect(result.errors?.map((error) => error.keyword)).toContain('type')
    })

    it('reads undefined as absent at any depth', async () => {
      const nested = {
        type: 'object',
        properties: {
          owner: {
            type: 'object',
            properties: { age: { type: 'number' } },
            required: ['age'],
          },
        },
      }
      const port = await createAdapter(nested)
      const result = await port.validate({ owner: { age: undefined } })
      expect(result.valid).toBe(false)
      expect(result.errors).toContainEqual(
        expect.objectContaining({ instancePointer: '/owner/age', keyword: 'required' }),
      )
    })
  })
}

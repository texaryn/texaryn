import { describe, it, expect } from 'vitest'
import type { JsonPointer, SchemaEvaluationPort } from '@texaryn/core'

type AdapterFactory = (schema: Record<string, unknown>) => Promise<SchemaEvaluationPort>

/**
 * Provisional `oneOf` selection, as a port contract rather than one adapter's
 * feature.
 *
 * `active` says JSON Schema evaluation applies the node. `provisional` says the
 * projection selected the branch so the user can complete it. Issue #120 is
 * what makes the second necessary: `oneOf` selects on full validity, so a
 * branch the data plainly identifies stays unselected while one of its own
 * required properties is absent, and hiding it leaves no way to supply the
 * property that would make it apply.
 *
 * The rule is deliberately narrow, and both adapters have to implement the same
 * one. Adapter choice must not change which fields a form shows, and once
 * ADR-003 makes reachability `active || provisional` it must not change what
 * data an initialization policy writes.
 *
 * - explicit `const` or `enum` on a property, and nothing else, discriminates
 * - the discriminator has to be present in the data by own-property presence,
 *   never read from a `default` annotation
 * - every present common discriminator has to agree
 * - exactly one surviving branch is selected; zero or several select nothing
 * - `type` says nothing about intent and is excluded
 * - `anyOf` is a different problem, since several branches may apply at once
 */
export function provisionalSelectionSuite(name: string, createAdapter: AdapterFactory): void {
  const at = async (schema: Record<string, unknown>, data: unknown, pointer: string) => {
    const port = await createAdapter(schema)
    const node = port.project(data).nodes.get(pointer as JsonPointer)
    return { active: node?.active, provisional: node?.provisional === true }
  }

  const child = async (schema: Record<string, unknown>, data: unknown, key: string) => {
    const port = await createAdapter(schema)
    const root = port.project(data).nodes.get('' as JsonPointer)
    const found = root?.children?.find((c) => c.key === key)
    return { required: found?.required, provisionalRequired: found?.provisionalRequired === true }
  }

  /** Two branches, each identified by a `const`, each with one required property. */
  const constDiscriminated = {
    type: 'object',
    properties: { kind: { type: 'string' } },
    oneOf: [
      { properties: { kind: { const: 'person' }, name: { type: 'string' } }, required: ['name'] },
      { properties: { kind: { const: 'company' }, org: { type: 'string' } }, required: ['org'] },
    ],
  }

  describe(`${name}: provisional oneOf selection`, () => {
    it('selects nothing when the discriminator is absent', async () => {
      expect(await at(constDiscriminated, {}, '/name')).toEqual({
        active: false,
        provisional: false,
      })
    })

    it('selects the branch a unique const identifies', async () => {
      expect(await at(constDiscriminated, { kind: 'person' }, '/name')).toEqual({
        active: false,
        provisional: true,
      })
      expect(await at(constDiscriminated, { kind: 'person' }, '/org')).toEqual({
        active: false,
        provisional: false,
      })
    })

    it('selects the branch a unique enum identifies', async () => {
      const schema = {
        type: 'object',
        properties: { kind: { type: 'string' } },
        oneOf: [
          {
            properties: { kind: { enum: ['person', 'human'] }, name: { type: 'string' } },
            required: ['name'],
          },
          {
            properties: { kind: { enum: ['company'] }, org: { type: 'string' } },
            required: ['org'],
          },
        ],
      }
      expect(await at(schema, { kind: 'human' }, '/name')).toEqual({
        active: false,
        provisional: true,
      })
    })

    it('selects nothing for a discriminator value no branch accepts', async () => {
      expect(await at(constDiscriminated, { kind: 'unknown' }, '/name')).toEqual({
        active: false,
        provisional: false,
      })
    })

    it('selects nothing when overlapping enums both accept the value', async () => {
      const schema = {
        type: 'object',
        properties: { kind: { type: 'string' } },
        oneOf: [
          { properties: { kind: { enum: ['a', 'b'] }, first: { type: 'string' } }, required: ['first'] },
          { properties: { kind: { enum: ['b', 'c'] }, second: { type: 'string' } }, required: ['second'] },
        ],
      }
      expect(await at(schema, { kind: 'b' }, '/first')).toEqual({
        active: false,
        provisional: false,
      })
    })

    /** Two discriminators are conjunctive: both have to agree on one branch. */
    const twoDiscriminators = {
      type: 'object',
      properties: { kind: { type: 'string' }, mode: { type: 'string' } },
      oneOf: [
        {
          properties: {
            kind: { const: 'person' },
            mode: { const: 'simple' },
            first: { type: 'string' },
          },
          required: ['first'],
        },
        {
          properties: {
            kind: { const: 'company' },
            mode: { const: 'detailed' },
            second: { type: 'string' },
          },
          required: ['second'],
        },
      ],
    }

    it('selects when two present discriminators agree', async () => {
      expect(await at(twoDiscriminators, { kind: 'person', mode: 'simple' }, '/first')).toEqual({
        active: false,
        provisional: true,
      })
    })

    it('selects nothing when two present discriminators contradict', async () => {
      expect(await at(twoDiscriminators, { kind: 'person', mode: 'detailed' }, '/first')).toEqual({
        active: false,
        provisional: false,
      })
    })

    /**
     * The narrowing. A generic validation constraint is not a discriminator, so
     * a branch that merely satisfies more of them wins nothing.
     */
    it('selects nothing when a branch would win on a constraint that is not a discriminator', async () => {
      const schema = {
        type: 'object',
        properties: { seen: { type: 'string' } },
        oneOf: [
          { properties: { seen: { minLength: 1 }, first: { type: 'string' } }, required: ['first'] },
          {
            properties: { other: { type: 'string' }, second: { type: 'string' } },
            required: ['other', 'second'],
          },
        ],
      }
      expect(await at(schema, { seen: 'x' }, '/first')).toEqual({
        active: false,
        provisional: false,
      })
    })

    it('selects a single branch whose const the data matches', async () => {
      const schema = {
        type: 'object',
        properties: { kind: { type: 'string' } },
        oneOf: [
          { properties: { kind: { const: 'person' }, name: { type: 'string' } }, required: ['name'] },
        ],
      }
      expect(await at(schema, { kind: 'person' }, '/name')).toEqual({
        active: false,
        provisional: true,
      })
    })

    it('reports a satisfied branch active and not provisional', async () => {
      expect(await at(constDiscriminated, { kind: 'person', name: 'x' }, '/name')).toEqual({
        active: true,
        provisional: false,
      })
    })

    /**
     * A discriminator that exists only as a `default` annotation is not data.
     * ADR-003's pass is what turns a declared default into a value, and only
     * then can it identify a branch, which is what keeps selection from acting
     * on a value nobody supplied.
     */
    it('does not read the discriminator from a default annotation', async () => {
      const schema = {
        type: 'object',
        properties: { kind: { type: 'string', default: 'person' } },
        oneOf: [
          { properties: { kind: { const: 'person' }, name: { type: 'string' } }, required: ['name'] },
          { properties: { kind: { const: 'company' }, org: { type: 'string' } }, required: ['org'] },
        ],
      }
      expect(await at(schema, {}, '/name')).toEqual({ active: false, provisional: false })
    })
  })

  describe(`${name}: what a selected branch is authoritative for`, () => {
    /** The same property declared differently by each branch. */
    const sharedKey = {
      type: 'object',
      properties: { kind: { type: 'string' } },
      oneOf: [
        {
          properties: {
            kind: { const: 'a' },
            value: { type: 'number', title: 'Branch A Value', minimum: 3 },
          },
          required: ['value'],
        },
        {
          properties: {
            kind: { const: 'b' },
            value: { type: 'string', title: 'Branch B Value', format: 'email' },
          },
          required: ['value'],
        },
      ],
    }

    /**
     * Marking the right branch provisional while taking the shape from the
     * wrong one is the failure this catches: a first-branch fallback would give
     * `value` branch A's number type and minimum.
     */
    it('takes shape and annotations from the selected branch', async () => {
      const port = await createAdapter(sharedKey)
      const value = port.project({ kind: 'b' }).nodes.get('/value' as JsonPointer)

      expect(value?.provisional).toBe(true)
      expect(value?.type).toBe('string')
      expect(value?.annotations.title).toBe('Branch B Value')
    })

    it('does not leak the unselected branch constraints or format', async () => {
      const port = await createAdapter(sharedKey)
      const value = port.project({ kind: 'b' }).nodes.get('/value' as JsonPointer)

      expect(value?.constraints.minimum).toBeUndefined()
      expect(value?.format).toBe('email')
    })
  })

  describe(`${name}: requiredness follows the same split`, () => {
    it('reports nothing required for a branch that does not apply', async () => {
      expect(await child(constDiscriminated, {}, 'name')).toEqual({
        required: false,
        provisionalRequired: false,
      })
    })

    it('reports a provisionally selected branch requirement as provisional', async () => {
      expect(await child(constDiscriminated, { kind: 'person' }, 'name')).toEqual({
        required: false,
        provisionalRequired: true,
      })
    })

    it('reports a satisfied branch requirement as required', async () => {
      expect(await child(constDiscriminated, { kind: 'person', name: 'x' }, 'name')).toEqual({
        required: true,
        provisionalRequired: false,
      })
    })
  })
}

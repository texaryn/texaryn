import { describe, it, expect } from 'vitest'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createHyperjumpAdapter } from '@texaryn/schema-json-hyperjump'
import type { JsonPointer, SchemaEvaluationPort } from '@texaryn/core'

/**
 * Where the two adapters disagree about `active`, measured rather than argued.
 *
 * `NodeProjection.active` means JSON Schema evaluation says the node applies.
 * `@texaryn/schema-json` reports exactly that. `@texaryn/schema-json-hyperjump`
 * reports something broader: its `makeBranchChecker` picks a best-match branch
 * by counting valid sub-scopes when no branch is directly valid, and
 * `staticWalk` then marks that branch active. So a branch validation rejects
 * can already be `active: true` there.
 *
 * That is the conflation issue #120 exists to remove, reached before #120 was
 * written. Hyperjump arrives at the useful answer for the case #120 is about
 * and encodes it in the field that is supposed to mean something narrower.
 *
 * These tests pin the divergence as it stands, so whichever way it is resolved
 * has to come back here and say so. They are not an endorsement of either
 * answer.
 */
type Case = { data: unknown; schemaJson: boolean; hyperjump: boolean }

async function activeAt(
  port: SchemaEvaluationPort,
  data: unknown,
  pointer: string,
): Promise<boolean | undefined> {
  return port.project(data).nodes.get(pointer as JsonPointer)?.active
}

describe('the two adapters disagree about a branch the data identifies', () => {
  /** Branch properties declared inside the branches, so selection decides them. */
  const schema = {
    type: 'object',
    properties: { kind: { type: 'string' } },
    oneOf: [
      { properties: { kind: { const: 'person' }, name: { type: 'string' } }, required: ['name'] },
      { properties: { kind: { const: 'company' }, org: { type: 'string' } }, required: ['org'] },
    ],
  }

  it.each<[string, Case]>([
    ['nothing supplied', { data: {}, schemaJson: false, hyperjump: false }],
    [
      'the discriminator identifies a branch the data has not satisfied',
      { data: { kind: 'person' }, schemaJson: false, hyperjump: true },
    ],
    ['a discriminator value no branch accepts', { data: { kind: 'unknown' }, schemaJson: false, hyperjump: false }],
    [
      'the branch satisfied, where both agree',
      { data: { kind: 'person', name: 'x' }, schemaJson: true, hyperjump: true },
    ],
  ])('with %s', async (_label, { data, schemaJson, hyperjump }) => {
    const sj = await createJsonSchemaAdapter(schema)
    const hj = await createHyperjumpAdapter(schema)

    expect(await activeAt(sj, data, '/name')).toBe(schemaJson)
    expect(await activeAt(hj, data, '/name')).toBe(hyperjump)
  })

  /**
   * The difference is one of breadth, not only of encoding. No `const` and no
   * `enum` anywhere: Hyperjump selects a branch because `minLength` was
   * satisfied. A rule restricted to explicit `const` and `enum` discriminators
   * selects nothing here, so narrowing Hyperjump to that rule would stop it
   * exposing a field it exposes today.
   */
  it('hyperjump selects on constraints a const or enum rule would not see', async () => {
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
    const sj = await createJsonSchemaAdapter(schema)
    const hj = await createHyperjumpAdapter(schema)

    expect(await activeAt(sj, { seen: 'x' }, '/first')).toBe(false)
    expect(await activeAt(hj, { seen: 'x' }, '/first')).toBe(true)
  })
})

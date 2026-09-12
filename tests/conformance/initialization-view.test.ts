import { describe, it, expect } from 'vitest'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createHyperjumpAdapter } from '@texaryn/schema-json-hyperjump'
import { viewFromProjection } from '../../packages/core/src/initialization/view.js'
import { initializeDefaults } from '../../packages/core/src/initialization/kernel.js'

/**
 * ADR-003's pass driven by a real projection, through both adapters.
 *
 * Reached by relative path rather than through `@texaryn/core`, because neither
 * module is exported: the contract is Proposed and publishing
 * `FormRuntimeOptions.initialization` would ship it. The import says as much by
 * being awkward.
 *
 * The kernel's own tests hand it a view written by hand, which cannot catch the
 * translation being wrong, and one such gap is why this file exists. The port
 * reports disagreeing defaults by omitting the annotation and raising an
 * `ambiguous-default` diagnostic, so a view built only from `nodes` would show
 * a conflicted location as having no default at all, and a child's default
 * would then create the parent the conflict said to leave absent: rule 5,
 * defeated by the channel the information moved to.
 */
describe.each([
  ['json-schema-library', createJsonSchemaAdapter],
  ['@hyperjump/json-schema', createHyperjumpAdapter],
])('the pass over a real projection (%s)', (_name, createAdapter) => {
  const run = async (schema: Record<string, unknown>, data: unknown) => {
    const port = await (createAdapter as typeof createJsonSchemaAdapter)(schema)
    const result = initializeDefaults(data, (current) =>
      viewFromProjection(port.project(current)),
    )
    if (result.outcome !== 'initialized') throw new Error(`expected initialized, got ${result.outcome}`)
    return result
  }

  it('fills an absent location the schema declares a default for', async () => {
    const result = await run(
      {
        type: 'object',
        properties: { replicas: { type: 'number', default: 3 }, name: { type: 'string' } },
      },
      {},
    )
    expect(result.data).toEqual({ replicas: 3 })
  })

  it('leaves a location the caller already filled', async () => {
    const result = await run(
      { type: 'object', properties: { replicas: { type: 'number', default: 3 } } },
      { replicas: 1 },
    )
    expect(result.data).toEqual({ replicas: 1 })
  })

  it('leaves a location whose applicable declarations disagree, and names them', async () => {
    const result = await run(
      {
        type: 'object',
        allOf: [
          { properties: { x: { type: 'string', default: 'a' } } },
          { properties: { x: { type: 'string', default: 'b' } } },
        ],
      },
      {},
    )
    expect(result.data).toEqual({})
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]!.location).toBe('/x')
    expect([...result.conflicts[0]!.sources].sort()).toEqual([
      '/allOf/0/properties/x',
      '/allOf/1/properties/x',
    ])
  })

  /**
   * The rule that the channel change put at risk, end to end. `/owner`
   * disagrees with itself, `/owner/region` declares `'eu'`, and creating
   * `/owner` to hold it would materialise the location the conflict said to
   * leave alone, with a shape no declaration chose.
   */
  it('does not create a conflicted container to hold a descendant default', async () => {
    const result = await run(
      {
        type: 'object',
        properties: {
          owner: {
            type: 'object',
            properties: { region: { type: 'string', default: 'eu' } },
          },
          name: { type: 'string', default: 'unrelated' },
        },
        allOf: [
          { properties: { owner: { default: { team: 'a' } } } },
          { properties: { owner: { default: { team: 'b' } } } },
        ],
      },
      {},
    )
    expect(result.data).toEqual({ name: 'unrelated' })
    expect(result.conflicts.map((conflict) => conflict.location)).toEqual(['/owner'])
  })

  it('fills beneath that container once the caller supplied it', async () => {
    const result = await run(
      {
        type: 'object',
        properties: {
          owner: {
            type: 'object',
            properties: { region: { type: 'string', default: 'eu' } },
          },
        },
        allOf: [
          { properties: { owner: { default: { team: 'a' } } } },
          { properties: { owner: { default: { team: 'b' } } } },
        ],
      },
      { owner: {} },
    )
    expect(result.data).toEqual({ owner: { region: 'eu' } })
    expect(result.conflicts).toEqual([])
  })

  /**
   * Reachability is exposure. `kind: 'person'` identifies the branch without
   * satisfying it, since `name` is required and absent, so the branch is
   * provisional rather than active and its default has to be written anyway.
   * Under an activity-only rule the field renders empty and the user is shown a
   * branch the pass declined to start.
   */
  it('fills inside a branch the data identifies but has not satisfied', async () => {
    const result = await run(
      {
        type: 'object',
        properties: { kind: { type: 'string' } },
        oneOf: [
          {
            properties: {
              kind: { const: 'person' },
              nickname: { type: 'string', default: 'anon' },
            },
            required: ['name'],
          },
          { properties: { kind: { const: 'company' } }, required: ['org'] },
        ],
      },
      { kind: 'person' },
    )
    expect(result.data).toEqual({ kind: 'person', nickname: 'anon' })
  })

  /**
   * A default that reveals a branch whose own default reveals nothing further.
   * One pass reaches `flag`, the next reaches what `flag` turned on, which is
   * why the pass is a fixpoint rather than a single sweep.
   */
  it('reaches a location revealed by a default it just wrote', async () => {
    const result = await run(
      {
        type: 'object',
        properties: { flag: { type: 'boolean', default: true } },
        if: { properties: { flag: { const: true } }, required: ['flag'] },
        then: { properties: { revealed: { type: 'string', default: 'seen' } } },
      },
      {},
    )
    expect(result.data).toEqual({ flag: true, revealed: 'seen' })
    expect(result.passes).toBeGreaterThan(2)
  })
})

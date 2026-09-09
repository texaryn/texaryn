// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'

/**
 * The outside-in ratchet.
 *
 * Each workaround this spike carries is asserted to still be necessary against
 * the installed published packages. When a fix reaches the registry, the
 * matching test here fails, and the failure is the instruction: delete the
 * workaround, delete the test, and let the published abstraction do the work.
 *
 * Without this the workarounds would quietly outlive the defects they exist
 * for, and the exercise would go on reporting friction that no longer exists.
 * A green run means every workaround is still earning its place.
 */
describe('workarounds that are still load-bearing', () => {
  /**
   * `src/candidate/infer-types.ts`, for friction log entry 2.
   *
   * If this fails, `@texaryn/schema-json` now derives a form shape for a
   * schema that declares `properties` without `type`. Delete `infer-types.ts`
   * and every `inferTypes(` call, then delete this test.
   */
  it('infer-types.ts: the adapter still needs type added before it will project', async () => {
    const asBackstageWritesIt = { properties: { name: { type: 'string' } }, required: ['name'] }
    const adapter = await createJsonSchemaAdapter(asBackstageWritesIt, {
      defaultDialect: 'draft-07',
    })

    expect(
      [...adapter.project(undefined).nodes.keys()],
      'schema-json now projects a typeless object: remove infer-types.ts and this test',
    ).toEqual([])
  })

  /**
   * The silent half of the same entry, kept separate because it is the more
   * dangerous one and could be fixed independently: a nested object with an
   * implicit type is dropped from the form without any error.
   */
  it('infer-types.ts: a nested typeless object is still dropped in silence', async () => {
    const adapter = await createJsonSchemaAdapter(
      { type: 'object', properties: { owner: { properties: { name: { type: 'string' } } } } },
      { defaultDialect: 'draft-07' },
    )
    const projection = adapter.project(undefined)

    expect([...projection.nodes.keys()]).toEqual([''])
    // And nothing is reported about the field that vanished.
    expect(
      (projection as { diagnostics?: unknown }).diagnostics ?? [],
      'schema-json now reports what it could not project: revisit entry 2',
    ).toEqual([])
  })
})

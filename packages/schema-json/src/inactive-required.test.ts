import { describe, it, expect } from 'vitest'
import { createJsonSchemaAdapter } from './index.js'
import type { JsonPointer } from '@texaryn/core'

/**
 * What `ChildProjection.required` currently says about a child of a branch that
 * does not apply, which is not what it means.
 *
 * `required` is documented as whether JSON Schema evaluation demands the
 * property of the current data. Nothing is demanded here: the `then` branch
 * does not apply, so neither `/group` nor `/group/inner` is required of `{}`.
 * The projection reports `inner` as required anyway, because `computeRequiredSet`
 * reads the branch's own `required` array without gating on whether the
 * containing node is active.
 *
 * Harmless while the whole subtree is invisible, and not harmless once
 * provisional selection exposes such a branch: the field would appear with a
 * required marker attributed to a validator that is not asking for it. The
 * requirement belongs on `provisionalRequired` instead.
 *
 * Pinned as it behaves rather than as it should, so the fix has to come back
 * here and say so.
 */
const schema = {
  type: 'object',
  properties: { flag: { type: 'boolean' } },
  allOf: [
    {
      if: { properties: { flag: { const: true } }, required: ['flag'] },
      then: {
        properties: {
          group: {
            type: 'object',
            properties: { inner: { type: 'string' } },
            required: ['inner'],
          },
        },
      },
    },
  ],
}

describe('requiredness inside a branch that does not apply', () => {
  it('reports the child required even though nothing demands it', async () => {
    const port = await createJsonSchemaAdapter(schema, { defaultDialect: 'draft-07' })
    const data = {}

    const verdict = await port.validate(data)
    expect(verdict.errors).toEqual([])

    const projection = port.project(data)
    const group = projection.nodes.get('/group' as JsonPointer)
    expect(group?.active).toBe(false)

    const inner = group?.children?.find((child) => child.key === 'inner')
    expect(inner?.required).toBe(true)
    expect(inner?.provisionalRequired).toBeUndefined()
  })
})

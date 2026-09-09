import { describe, it, expect } from 'vitest'
import { createJsonSchemaAdapter } from './index.js'
import type { JsonPointer } from '@texaryn/core'

/**
 * What `ChildProjection.required` says about a child of a branch that does not
 * apply.
 *
 * `required` means JSON Schema evaluation demands the property of the current
 * data. Nothing is demanded here: the `then` branch does not apply, so neither
 * `/group` nor `/group/inner` is required of `{}`.
 *
 * This used to report `inner` as required anyway, because `computeRequiredSet`
 * reads a branch's own `required` array and nothing gated the result on whether
 * the containing node was active. Harmless while the whole subtree was
 * invisible, and not harmless once provisional selection exposes such a branch:
 * the field would appear carrying a required marker attributed to a validator
 * that is not asking for it.
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
  it('demands nothing, matching what the validator says', async () => {
    const port = await createJsonSchemaAdapter(schema, { defaultDialect: 'draft-07' })
    const data = {}

    const verdict = await port.validate(data)
    expect(verdict.errors).toEqual([])

    const projection = port.project(data)
    const group = projection.nodes.get('/group' as JsonPointer)
    expect(group?.active).toBe(false)
    expect(group?.provisional).toBeUndefined()

    const inner = group?.children?.find((child) => child.key === 'inner')
    expect(inner?.required).toBe(false)
    expect(inner?.provisionalRequired).toBeUndefined()
  })

  it('demands it once the branch applies', async () => {
    const port = await createJsonSchemaAdapter(schema, { defaultDialect: 'draft-07' })
    const data = { flag: true, group: {} }

    const projection = port.project(data)
    const group = projection.nodes.get('/group' as JsonPointer)
    expect(group?.active).toBe(true)

    const inner = group?.children?.find((child) => child.key === 'inner')
    expect(inner?.required).toBe(true)
  })
})

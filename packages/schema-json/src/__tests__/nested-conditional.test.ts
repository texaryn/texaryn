import { describe, it, expect } from 'vitest'
import { createJsonSchemaAdapter } from '../index.js'
import type { JsonPointer } from '@texaryn/core'

/**
 * Conditional fields that a form must be able to reach, when the branch
 * declaring them sits under more than one applicator.
 *
 * The invariant at stake is not about conditionals as such: it is that a
 * property validation demands must be a property the form can collect. When
 * the validator says `/lastName` is required and the projection has no
 * `/lastName`, the form declares the data invalid, names the missing property,
 * and offers no way to supply it. That is worse than ignoring the conditional.
 */
async function project(schema: unknown, data: unknown) {
  const adapter = await createJsonSchemaAdapter(schema, { defaultDialect: 'draft-07' })
  return adapter.project(data)
}

async function verdict(schema: unknown, data: unknown) {
  const adapter = await createJsonSchemaAdapter(schema, { defaultDialect: 'draft-07' })
  const result = await adapter.validate(data)
  return {
    valid: result.valid,
    errors: result.errors.map((e) => `${e.instancePointer}:${e.keyword}`),
  }
}

/**
 * Copied from "Use parameters as conditional for fields" in Backstage's
 * `docs/features/software-templates/input-examples.md`. This is the form the
 * documentation tells template authors to write, and it is the shape that
 * blocked the adoption exercise.
 */
const documented = {
  type: 'object',
  properties: { includeName: { title: 'Include Name?', type: 'boolean', default: true } },
  dependencies: {
    includeName: {
      allOf: [
        {
          if: { properties: { includeName: { const: true } } },
          then: {
            properties: { lastName: { title: 'Last Name', type: 'string' } },
            required: ['lastName'],
          },
        },
      ],
    },
  },
}

describe('the documented Backstage conditional', () => {
  it('projects the field its own validation requires', async () => {
    const data = { includeName: true }

    // The validator has always seen this correctly.
    expect(await verdict(documented, data)).toEqual({
      valid: false,
      errors: ['/lastName:required'],
    })

    const projection = await project(documented, data)
    expect([...projection.nodes.keys()]).toEqual(['', '/includeName', '/lastName'])
  })

  it('marks it required and active when the branch applies', async () => {
    const projection = await project(documented, { includeName: true })

    expect(projection.nodes.get('/lastName' as JsonPointer)?.active).toBe(true)
    expect(projection.nodes.get('' as JsonPointer)?.children).toEqual([
      { pointer: '/includeName', key: 'includeName', required: false },
      { pointer: '/lastName', key: 'lastName', required: true },
    ])
  })

  it('keeps it as an inactive candidate when the branch does not apply', async () => {
    // The inactive-node contract: a field belonging to an unselected branch is
    // still projected, so a renderer can decide what to do about it, rather
    // than the pointer disappearing and reappearing.
    const projection = await project(documented, { includeName: false })

    expect(projection.nodes.get('/lastName' as JsonPointer)?.active).toBe(false)
    expect(projection.nodes.get('' as JsonPointer)?.children).toEqual([
      { pointer: '/includeName', key: 'includeName', required: false },
      { pointer: '/lastName', key: 'lastName', required: false },
    ])
  })

  it('carries the branch annotations onto the projected field', async () => {
    const projection = await project(documented, { includeName: true })
    expect(projection.nodes.get('/lastName' as JsonPointer)?.annotations.title).toBe('Last Name')
  })

  /**
   * draft-07 `dependencies` applies only when the named property is present,
   * so an absent trigger requires nothing. Asserted so it is not read as part
   * of the defect.
   *
   * The candidate is still projected, and that is the point of separating the
   * two halves: which pointers can exist is a question about the schema and
   * does not move with the data, while `active` is what tracks the data. A
   * candidate set that shrank here would make the pointer appear and disappear
   * as someone typed.
   */
  it('requires nothing when the trigger property is absent, but still offers the field', async () => {
    expect((await verdict(documented, {})).valid).toBe(true)

    const projection = await project(documented, {})
    expect([...projection.nodes.keys()]).toEqual(['', '/includeName', '/lastName'])
    expect(projection.nodes.get('/lastName' as JsonPointer)?.active).toBe(false)
    expect(projection.nodes.get('' as JsonPointer)?.children).toEqual([
      { pointer: '/includeName', key: 'includeName', required: false },
      { pointer: '/lastName', key: 'lastName', required: false },
    ])
  })
})

describe('a conditional branch at other depths', () => {
  it('reaches a then inside a top-level allOf', async () => {
    const schema = {
      type: 'object',
      properties: { flag: { type: 'boolean' } },
      allOf: [
        {
          if: { properties: { flag: { const: true } } },
          then: { properties: { extra: { type: 'string' } }, required: ['extra'] },
        },
      ],
    }
    const projection = await project(schema, { flag: true })
    expect([...projection.nodes.keys()]).toContain('/extra')
    expect(projection.nodes.get('/extra' as JsonPointer)?.active).toBe(true)
  })

  it('reaches a then nested two applicators deep', async () => {
    const schema = {
      type: 'object',
      properties: { flag: { type: 'boolean' } },
      allOf: [
        {
          allOf: [
            {
              if: { properties: { flag: { const: true } } },
              then: { properties: { deep: { type: 'string' } } },
            },
          ],
        },
      ],
    }
    expect([...(await project(schema, { flag: true })).nodes.keys()]).toContain('/deep')
  })

  it('reaches a property inside an else', async () => {
    const schema = {
      type: 'object',
      properties: { flag: { type: 'boolean' } },
      allOf: [
        {
          if: { properties: { flag: { const: true } } },
          then: { properties: { whenTrue: { type: 'string' } } },
          else: { properties: { whenFalse: { type: 'string' } } },
        },
      ],
    }
    const pointers = [...(await project(schema, { flag: true })).nodes.keys()]
    expect(pointers).toContain('/whenTrue')
    expect(pointers).toContain('/whenFalse')
  })

  it('reaches a dependent schema nested inside a dependent schema', async () => {
    const schema = {
      type: 'object',
      properties: { a: { type: 'boolean' } },
      dependencies: {
        a: {
          properties: { b: { type: 'boolean' } },
          dependencies: { b: { properties: { c: { type: 'string' } } } },
        },
      },
    }
    const pointers = [...(await project(schema, { a: true, b: true })).nodes.keys()]
    expect(pointers).toContain('/b')
    expect(pointers).toContain('/c')
  })
})

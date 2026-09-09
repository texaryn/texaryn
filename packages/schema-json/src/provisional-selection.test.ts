import { describe, it, expect } from 'vitest'
import { createJsonSchemaAdapter } from './index.js'
import type { JsonPointer, NodeProjection, SchemaProjection } from '@texaryn/core'

/**
 * Provisional `oneOf` selection, from issue #120.
 *
 * `oneOf` selects on full validity, so a branch the data plainly identifies is
 * not selected while one of its own required properties is still absent. The
 * projection then falls back to the object's declared properties and the branch
 * fields are all inactive, which hides the very field that would make the
 * branch apply. The exit exists and the form cannot reach it.
 *
 * The rule is deliberately narrow: `const` and `enum` only, the discriminator
 * has to be present in the data, every present discriminator has to agree, and
 * zero or several surviving branches select nothing. No scoring.
 *
 * These use a direct `oneOf` rather than the `dependencies` shape #120 opens
 * with, because that one still throws through the upstream defect in #121.
 */
const schema = {
  type: 'object',
  properties: { kind: { enum: ['person', 'company'] } },
  oneOf: [
    {
      properties: { kind: { const: 'person' }, name: { type: 'string' } },
      required: ['name'],
    },
    {
      properties: { kind: { const: 'company' }, companyName: { type: 'string' } },
      required: ['companyName'],
    },
  ],
}

async function project(data: unknown): Promise<SchemaProjection> {
  const port = await createJsonSchemaAdapter(schema, { defaultDialect: 'draft-07' })
  return port.project(data)
}

function at(projection: SchemaProjection, pointer: string): NodeProjection | undefined {
  return projection.nodes.get(pointer as JsonPointer)
}

function childOf(projection: SchemaProjection, key: string) {
  return at(projection, '')?.children?.find((child) => child.key === key)
}

describe('a oneOf branch the data identifies but has not satisfied', () => {
  it('selects nothing when no discriminator is present', async () => {
    const projection = await project({})
    expect(at(projection, '/name')?.provisional).toBeFalsy()
    expect(at(projection, '/companyName')?.provisional).toBeFalsy()
  })

  it('provisionally exposes the identified branch, and its requiredness', async () => {
    const projection = await project({ kind: 'person' })

    const name = at(projection, '/name')
    expect(name).toBeDefined()
    expect(name?.active).toBe(false)
    expect(name?.provisional).toBe(true)
    expect(childOf(projection, 'name')?.provisionalRequired).toBe(true)

    expect(at(projection, '/companyName')?.provisional).toBeFalsy()
  })

  it('reports the branch active once it applies, and provisional stops mattering', async () => {
    const projection = await project({ kind: 'person', name: 'x' })
    expect(at(projection, '/name')?.active).toBe(true)
    expect(childOf(projection, 'name')?.required).toBe(true)
  })

  it('selects nothing for a discriminator value no branch accepts', async () => {
    const projection = await project({ kind: 'unknown' })
    expect(at(projection, '/name')?.provisional).toBeFalsy()
    expect(at(projection, '/companyName')?.provisional).toBeFalsy()
  })

  it('selects nothing when two branches accept the value', async () => {
    const port = await createJsonSchemaAdapter(
      {
        type: 'object',
        properties: { kind: { type: 'string' } },
        oneOf: [
          { properties: { kind: { enum: ['a', 'b'] }, first: { type: 'string' } } },
          { properties: { kind: { enum: ['b', 'c'] }, second: { type: 'string' } } },
        ],
      },
      { defaultDialect: 'draft-07' },
    )
    const projection = port.project({ kind: 'b' })
    expect(at(projection, '/first')?.provisional).toBeFalsy()
    expect(at(projection, '/second')?.provisional).toBeFalsy()
  })

  /**
   * Two discriminators pointing at different branches select nothing rather
   * than letting whichever property was read first decide.
   */
  it('selects nothing when present discriminators contradict each other', async () => {
    const port = await createJsonSchemaAdapter(
      {
        type: 'object',
        properties: { kind: { type: 'string' }, mode: { type: 'string' } },
        oneOf: [
          {
            properties: {
              kind: { const: 'person' },
              mode: { const: 'simple' },
              first: { type: 'string' },
            },
          },
          {
            properties: {
              kind: { const: 'company' },
              mode: { const: 'detailed' },
              second: { type: 'string' },
            },
          },
        ],
      },
      { defaultDialect: 'draft-07' },
    )
    const projection = port.project({ kind: 'person', mode: 'detailed' })
    expect(at(projection, '/first')?.provisional).toBeFalsy()
    expect(at(projection, '/second')?.provisional).toBeFalsy()
  })

  /**
   * A discriminator that exists only as a `default` annotation is not data. The
   * fixpoint in the initialization pass is what turns a declared default into a
   * value, and only then can it identify a branch, which is what keeps branch
   * selection from acting on a value nobody supplied.
   */
  it('does not read a discriminator from a default annotation', async () => {
    const port = await createJsonSchemaAdapter(
      {
        type: 'object',
        properties: { kind: { type: 'string', default: 'person' } },
        oneOf: [
          { properties: { kind: { const: 'person' }, first: { type: 'string' } } },
          { properties: { kind: { const: 'company' }, second: { type: 'string' } } },
        ],
      },
      { defaultDialect: 'draft-07' },
    )
    const projection = port.project({})
    expect(at(projection, '/first')?.provisional).toBeFalsy()
    expect(at(projection, '/second')?.provisional).toBeFalsy()
  })
})

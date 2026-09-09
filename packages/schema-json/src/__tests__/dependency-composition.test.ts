import { describe, it, expect } from 'vitest'
import { createJsonSchemaAdapter } from '../index.js'
import type { JsonPointer } from '@texaryn/core'

/**
 * A `oneOf` inside a dependent schema, which is the conditional idiom
 * [Backstage issue #30090](https://github.com/backstage/backstage/issues/30090)
 * recommends when `allOf`/`if`/`then` misbehaves.
 *
 * Projecting one used to throw a `TypeError` out of `json-schema-library`,
 * exactly while the value satisfied none of the branches. That is not an edge
 * case reachable by unusual input: the revealed branch requires a field which
 * by definition has no value at the moment it is revealed, so the first
 * keystroke that sets the discriminator took the render down.
 *
 * A projection cannot throw because a form's data is temporarily invalid.
 * Being unable to tell which branch applies is a state this file already has
 * semantics for, and these hold the adapter to them.
 */
async function project(schema: unknown, data: unknown) {
  const adapter = await createJsonSchemaAdapter(schema, { defaultDialect: 'draft-07' })
  return adapter.project(data)
}

/**
 * `project` is synchronous on the adapter, and that matters for the assertion:
 * wrapping the async helper above in `expect(() => …).not.toThrow()` tests
 * nothing, because a rejected promise is not a thrown error. The adapter is
 * built first so the throw being asserted is the real one.
 */
async function projector(schema: unknown) {
  const adapter = await createJsonSchemaAdapter(schema, { defaultDialect: 'draft-07' })
  return (data: unknown) => adapter.project(data)
}

async function verdict(schema: unknown, data: unknown) {
  const adapter = await createJsonSchemaAdapter(schema, { defaultDialect: 'draft-07' })
  return (await adapter.validate(data)).valid
}

/** The shape from the Backstage issue: a discriminator revealing a required field. */
const discriminated = {
  type: 'object',
  properties: { includeName: { title: 'Include Name?', type: 'boolean' } },
  dependencies: {
    includeName: {
      oneOf: [
        { properties: { includeName: { const: false } } },
        {
          properties: {
            includeName: { const: true },
            lastName: { title: 'Last Name', type: 'string' },
          },
          required: ['lastName'],
        },
      ],
    },
  },
}

describe('a oneOf inside a dependent schema', () => {
  it('does not throw while the value satisfies no branch', async () => {
    // `includeName: true` fails the first branch on `const`, and the second on
    // its own `required`, so no branch applies. This is the state the form is
    // in from the moment the box is ticked until the revealed field is filled.
    expect(await verdict(discriminated, { includeName: true })).toBe(false)

    const projectWith = await projector(discriminated)
    expect(() => projectWith({ includeName: true })).not.toThrow()
    expect([...projectWith({ includeName: true }).nodes.keys()]).toContain('')
  })

  it('still projects every candidate while no branch applies', async () => {
    const projection = await project(discriminated, { includeName: true })
    const pointers = [...projection.nodes.keys()]

    expect(pointers).toContain('/includeName')
    // The field the revealed branch declares has to be reachable, or the step
    // reports it as required and offers no way to supply it: the same defect
    // the nested-applicator work fixed, arrived at by a different route.
    expect(pointers).toContain('/lastName')
  })

  it('resolves normally once a branch applies', async () => {
    const filled = await project(discriminated, { includeName: true, lastName: 'Lovelace' })
    expect(await verdict(discriminated, { includeName: true, lastName: 'Lovelace' })).toBe(true)
    expect(filled.nodes.get('/lastName' as JsonPointer)?.active).toBe(true)

    const off = await project(discriminated, { includeName: false })
    expect(await verdict(discriminated, { includeName: false })).toBe(true)
    expect(off.nodes.get('/lastName' as JsonPointer)?.active).toBe(false)
  })

  it('reports the same verdict whether or not a branch applies', async () => {
    // Validation is untouched by any of this: the adapter's inability to pick a
    // branch must not change what the schema says about the data.
    expect(await verdict(discriminated, { includeName: true })).toBe(false)
    expect(await verdict(discriminated, { includeName: true, lastName: 'x' })).toBe(true)
    expect(await verdict(discriminated, {})).toBe(true)
  })
})

describe('the neighbouring compositions, which never threw', () => {
  const withBranch = (branch: Record<string, unknown>) => ({
    type: 'object',
    properties: { flag: { type: 'boolean' } },
    dependencies: { flag: branch },
  })

  it.each([
    ['anyOf', { anyOf: [{ required: ['extra'] }] }],
    ['a plain subschema', { required: ['extra'] }],
    ['allOf', { allOf: [{ required: ['extra'] }] }],
  ])('%s inside a dependent schema', async (_label, branch) => {
    const schema = withBranch(branch)
    expect(await verdict(schema, { flag: true })).toBe(false)
    const projectWith = await projector(schema)
    expect(() => projectWith({ flag: true })).not.toThrow()
  })

  it('a top-level oneOf that no value satisfies', async () => {
    const schema = {
      type: 'object',
      properties: { flag: { type: 'boolean' } },
      oneOf: [
        { properties: { flag: { const: false } } },
        { properties: { flag: { const: true } }, required: ['extra'] },
      ],
    }
    expect(await verdict(schema, { flag: true })).toBe(false)
    const projectWith = await projector(schema)
    expect(() => projectWith({ flag: true })).not.toThrow()
  })
})

describe('several dependent schemas', () => {
  /**
   * The reduction merges each dependent schema in turn, so one that cannot be
   * resolved must not cost the ones that can.
   */
  const twoDependencies = {
    type: 'object',
    properties: { a: { type: 'boolean' }, b: { type: 'boolean' } },
    dependencies: {
      a: {
        oneOf: [
          { properties: { a: { const: false } } },
          { properties: { a: { const: true } }, required: ['fromA'] },
        ],
      },
      b: { properties: { fromB: { type: 'string' } } },
    },
  }

  it('keeps the resolvable dependency when another cannot resolve', async () => {
    const projection = await project(twoDependencies, { a: true, b: true })
    const pointers = [...projection.nodes.keys()]
    expect(pointers).toContain('/fromB')
    expect(pointers).toContain('/fromA')
  })
})

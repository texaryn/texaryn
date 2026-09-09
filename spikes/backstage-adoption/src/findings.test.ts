// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { inferTypes } from './candidate/infer-types.js'

/**
 * The findings of the adoption exercise, pinned as assertions.
 *
 * Written against the behaviour that was measured, not the behaviour that
 * would be preferable, so each one fails when the behaviour changes in either
 * direction. A test here going red is the intended way to learn that a finding
 * has been addressed; the friction log entry it names says what was expected
 * instead.
 */

describe('entry 2: a node without an explicit type is not projected', () => {
  const project = async (schema: unknown) => {
    const port = await createJsonSchemaAdapter(schema, {
      defaultDialect: 'draft-07',
    })
    return [...port.project(undefined).nodes.keys()]
  }

  it('projects nothing for an object schema written the way Backstage writes it', async () => {
    expect(await project({ properties: { a: { type: 'string' } } })).toEqual([])
    expect(await project({ title: 'S', properties: { a: { type: 'string' } } })).toEqual([])
    expect(await project({ required: ['a'], properties: { a: { type: 'string' } } })).toEqual([])
  })

  it('drops a nested field whose type is implicit, without reporting anything', async () => {
    expect(await project({ type: 'object', properties: { a: {} } })).toEqual([''])
    expect(await project({ type: 'object', properties: { a: { enum: ['x'] } } })).toEqual([''])
    expect(
      await project({
        type: 'object',
        properties: { a: { properties: { b: { type: 'string' } } } },
      }),
    ).toEqual([''])
  })

  it('is fixed for these schemas by the inferTypes preprocessing pass', async () => {
    expect(await project(inferTypes({ properties: { a: { type: 'string' } } }))).toEqual(['', '/a'])
    expect(
      await project(
        inferTypes({
          type: 'object',
          properties: { a: { properties: { b: { type: 'string' } } } },
        }),
      ),
    ).toEqual(['', '/a', '/a/b'])
  })
})

describe('entry 3: the documented conditional validates against a field it never projects', () => {
  const documented = inferTypes({
    type: 'object',
    properties: {
      includeName: { title: 'Include Name?', type: 'boolean', default: true },
    },
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
  })

  it('reports /lastName as required while offering no /lastName node', async () => {
    const port = await createJsonSchemaAdapter(documented, {
      defaultDialect: 'draft-07',
    })
    const data = { includeName: true }

    const verdict = await port.validate(data)
    expect(verdict.valid).toBe(false)
    expect(verdict.errors.map((e) => `${e.instancePointer}:${e.keyword}`)).toEqual([
      '/lastName:required',
    ])

    expect([...port.project(data).nodes.keys()]).toEqual(['', '/includeName'])
  })

  it('applies nothing when the dependency property is absent, which is correct', async () => {
    const port = await createJsonSchemaAdapter(documented, {
      defaultDialect: 'draft-07',
    })
    // draft-07 `dependencies` only applies when the named property is present.
    expect((await port.validate({})).valid).toBe(true)
  })
})

describe('entry 4: a oneOf inside dependencies crashes the projection when unsatisfied', () => {
  const schema = inferTypes({
    type: 'object',
    properties: { flag: { type: 'boolean' } },
    dependencies: {
      flag: {
        oneOf: [
          { properties: { flag: { const: false } } },
          { properties: { flag: { const: true } }, required: ['extra'] },
        ],
      },
    },
  })

  it('throws exactly when the data is invalid, and not when it is valid', async () => {
    const port = await createJsonSchemaAdapter(schema, {
      defaultDialect: 'draft-07',
    })

    // No branch matches: `flag` is true so branch one fails, and `extra` is
    // missing so branch two fails. This is the state the form is in for as
    // long as the revealed field has not been filled in yet.
    expect((await port.validate({ flag: true })).valid).toBe(false)
    expect(() => port.project({ flag: true })).toThrow(TypeError)

    // One branch matches once the required field has a value.
    expect((await port.validate({ flag: true, extra: 'x' })).valid).toBe(true)
    expect(() => port.project({ flag: true, extra: 'x' })).not.toThrow()
  })

  it('does not happen for anyOf, a plain subschema, or a top-level oneOf', async () => {
    const shapes: unknown[] = [
      {
        type: 'object',
        properties: { flag: { type: 'boolean' } },
        dependencies: { flag: { anyOf: [{ required: ['extra'] }] } },
      },
      {
        type: 'object',
        properties: { flag: { type: 'boolean' } },
        dependencies: { flag: { required: ['extra'] } },
      },
      {
        type: 'object',
        properties: { flag: { type: 'boolean' } },
        oneOf: [
          { properties: { flag: { const: false } } },
          { properties: { flag: { const: true } }, required: ['extra'] },
        ],
      },
    ]

    for (const shape of shapes) {
      const port = await createJsonSchemaAdapter(shape, {
        defaultDialect: 'draft-07',
      })
      expect((await port.validate({ flag: true })).valid).toBe(false)
      expect(() => port.project({ flag: true })).not.toThrow()
    }
  })
})

// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'

/**
 * The findings of the adoption exercise, pinned as assertions against the
 * installed published packages.
 *
 * Each one is written against the behaviour that was measured, not the
 * behaviour that would be preferable, so it fails when the behaviour changes
 * in either direction. For a blocker that is still open, a test here going red
 * is the intended way to learn that a fix has been published. For one that is
 * closed, the same test is the outside-in check that the published API does
 * the work the spike once did for itself; the friction log entry it names says
 * what was measured before.
 */

const project = async (schema: unknown, data?: unknown) => {
  const port = await createJsonSchemaAdapter(schema, { defaultDialect: 'draft-07' })
  return port.project(data)
}

const pointers = (projection: { nodes: Map<unknown, unknown> }) => [...projection.nodes.keys()]

describe('entry 2: a node without an explicit type is projected from its keywords', () => {
  it('projects an object schema written the way Backstage writes it', async () => {
    expect(pointers(await project({ properties: { a: { type: 'string' } } }))).toEqual([
      '',
      '/a',
    ])
    expect(pointers(await project({ title: 'S', properties: { a: { type: 'string' } } }))).toEqual([
      '',
      '/a',
    ])
    expect(
      pointers(await project({ required: ['a'], properties: { a: { type: 'string' } } })),
    ).toEqual(['', '/a'])
  })

  it('projects a nested object and an array whose types are implicit', async () => {
    expect(
      pointers(
        await project({
          type: 'object',
          properties: { a: { properties: { b: { type: 'string' } } } },
        }),
      ),
    ).toEqual(['', '/a', '/a/b'])

    const withItems = await project({
      type: 'object',
      properties: { a: { items: { type: 'string' } } },
    })
    expect(pointers(withItems)).toEqual(['', '/a'])
    expect(withItems.nodes.get('/a' as never)?.type).toBe('array')
  })

  /**
   * The silent half of the entry. A node that declares neither `type` nor a
   * keyword implying one is still not projected, and the projection says so,
   * naming the pointer, rather than dropping the field with a successful
   * render. `enum` alone implies nothing, because its members may be of
   * different types.
   */
  it('reports a node it cannot shape instead of dropping it in silence', async () => {
    for (const child of [{}, { enum: ['x'] }]) {
      const projection = await project({ type: 'object', properties: { a: child } })
      expect(pointers(projection)).toEqual([''])
      const diagnostics = projection.diagnostics ?? []
      expect(diagnostics.map(({ pointer, code }) => ({ pointer, code }))).toEqual([
        { pointer: '/a', code: 'unresolved-projection-shape' },
      ])
    }
  })

  /**
   * The shortcut the spike's own preprocessing took and the published fix
   * does not: writing `type` into the schema before compiling it would make
   * `{ properties: { name: … } }` reject a string, which JSON Schema accepts.
   * The shape is derived for the form and the schema is left as written.
   */
  it('leaves validation unchanged: a typeless root still accepts a string', async () => {
    const port = await createJsonSchemaAdapter(
      { properties: { name: { type: 'string' } } },
      { defaultDialect: 'draft-07' },
    )
    expect((await port.validate('a string')).valid).toBe(true)
    expect((await port.validate({ name: 'x' })).valid).toBe(true)
    expect(pointers(port.project({ name: 'x' }))).toEqual(['', '/name'])
  })
})

describe('entry 3: the documented conditional projects the field it validates', () => {
  const documented = {
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
  }

  const lastNameIn = (projection: Awaited<ReturnType<typeof project>>) => {
    const root = projection.nodes.get('' as never)
    const child = root?.children?.find((entry) => entry.pointer === '/lastName')
    return { node: projection.nodes.get('/lastName' as never), required: child?.required }
  }

  it('offers /lastName, active and required, exactly when the validator demands it', async () => {
    const port = await createJsonSchemaAdapter(documented, { defaultDialect: 'draft-07' })
    const data = { includeName: true }

    const verdict = await port.validate(data)
    expect(verdict.valid).toBe(false)
    expect(verdict.errors.map((e) => `${e.instancePointer}:${e.keyword}`)).toEqual([
      '/lastName:required',
    ])

    const projection = port.project(data)
    expect(pointers(projection)).toEqual(['', '/includeName', '/lastName'])
    expect(lastNameIn(projection).node?.active).toBe(true)
    expect(lastNameIn(projection).required).toBe(true)
  })

  it('keeps /lastName inactive and optional while the branch does not apply', async () => {
    const port = await createJsonSchemaAdapter(documented, { defaultDialect: 'draft-07' })

    for (const data of [{ includeName: false }, {}]) {
      expect((await port.validate(data)).valid).toBe(true)
      const projection = port.project(data)
      expect(pointers(projection)).toEqual(['', '/includeName', '/lastName'])
      expect(lastNameIn(projection).node?.active).toBe(false)
      expect(lastNameIn(projection).required).toBe(false)
    }
  })
})

describe('entry 4: a oneOf inside dependencies crashes the projection when unsatisfied', () => {
  const schema = {
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
  }

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

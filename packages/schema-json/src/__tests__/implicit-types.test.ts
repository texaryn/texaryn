import { describe, it, expect } from 'vitest'
import { createJsonSchemaAdapter } from '../index.js'
import type { JsonPointer, SchemaProjection } from '@texaryn/core'

/**
 * A schema is not obliged to declare `type`, and one that declares
 * `properties` without it is both valid and widespread: not one parameter step
 * in a Backstage Software Template declares `type: object`, and every such
 * step used to project nothing at all.
 *
 * The invariant these tests hold in place: a deterministic form shape may be
 * derived from type-specific structural keywords when exactly one shape is
 * implied, that decision is never represented as a JSON Schema type assertion,
 * and nothing is guessed when the schema is structurally ambiguous.
 */
async function project(schema: unknown, data: unknown = undefined): Promise<SchemaProjection> {
  const adapter = await createJsonSchemaAdapter(schema, { defaultDialect: 'draft-07' })
  return adapter.project(data)
}

async function pointers(schema: unknown, data: unknown = undefined): Promise<string[]> {
  return [...(await project(schema, data)).nodes.keys()]
}

async function shapeAt(schema: unknown, pointer: string, data?: unknown) {
  return (await project(schema, data)).nodes.get(pointer as JsonPointer)?.type
}

describe('an object shape derived from object keywords', () => {
  it.each([
    ['properties', { properties: { a: { type: 'string' } } }],
    ['patternProperties', { patternProperties: { '^a': { type: 'string' } } }],
    ['additionalProperties', { additionalProperties: false }],
    ['propertyNames', { propertyNames: { pattern: '^a' } }],
    ['required', { required: ['a'] }],
    ['minProperties', { minProperties: 1 }],
    ['maxProperties', { maxProperties: 3 }],
    ['dependentSchemas', { dependentSchemas: { a: { required: ['b'] } } }],
    ['dependentRequired', { dependentRequired: { a: ['b'] } }],
    ['unevaluatedProperties', { unevaluatedProperties: false }],
  ])('%s implies an object', async (_keyword, schema) => {
    expect(await shapeAt(schema, '')).toBe('object')
  })

  /** The shape every Backstage parameter step is written in. */
  it('projects a root written the way Backstage writes it', async () => {
    expect(
      await pointers({
        title: 'Basic widgets',
        required: ['name', 'email'],
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
        },
      }),
    ).toEqual(['', '/name', '/email'])
  })

  /**
   * The case that was silent rather than loud, and so the more dangerous one:
   * a nested object with an implicit type was dropped along with everything
   * beneath it, and the form rendered and submitted without ever collecting it.
   */
  it('projects a nested object without a type, rather than dropping it', async () => {
    expect(
      await pointers({
        properties: {
          owner: { properties: { name: { type: 'string' }, slack: { type: 'string' } } },
        },
      }),
    ).toEqual(['', '/owner', '/owner/name', '/owner/slack'])
  })

  it('derives a shape at every depth', async () => {
    expect(
      await pointers({
        properties: { a: { properties: { b: { properties: { c: { type: 'string' } } } } } },
      }),
    ).toEqual(['', '/a', '/a/b', '/a/b/c'])
  })

  it('keeps required and annotations on the derived node', async () => {
    const root = (
      await project({
        title: 'Step',
        required: ['name'],
        properties: { name: { type: 'string' }, optional: { type: 'string' } },
      })
    ).nodes.get('' as JsonPointer)

    expect(root?.annotations.title).toBe('Step')
    expect(root?.children).toEqual([
      { pointer: '/name', key: 'name', required: true },
      { pointer: '/optional', key: 'optional', required: false },
    ])
  })

  it('keeps required on a nested derived object too', async () => {
    const owner = (
      await project({
        properties: { owner: { required: ['name'], properties: { name: { type: 'string' } } } },
      })
    ).nodes.get('/owner' as JsonPointer)

    expect(owner?.children).toEqual([{ pointer: '/owner/name', key: 'name', required: true }])
  })
})

describe('an array shape derived from array keywords', () => {
  it.each([
    ['items', { items: { type: 'string' } }],
    ['prefixItems', { prefixItems: [{ type: 'string' }] }],
    ['additionalItems', { additionalItems: { type: 'string' } }],
    ['contains', { contains: { type: 'string' } }],
    ['minItems', { minItems: 1 }],
    ['maxItems', { maxItems: 5 }],
    ['uniqueItems', { uniqueItems: true }],
    ['minContains', { minContains: 1 }],
    ['maxContains', { maxContains: 2 }],
    ['unevaluatedItems', { unevaluatedItems: false }],
  ])('%s implies an array', async (_keyword, schema) => {
    expect(await shapeAt(schema, '')).toBe('array')
  })

  it('descends into the items present in the data', async () => {
    expect(
      await pointers({ properties: { tags: { items: { type: 'string' } } } }, { tags: ['a', 'b'] }),
    ).toEqual(['', '/tags', '/tags/0', '/tags/1'])
  })

  it('derives the item shape from the item schema', async () => {
    expect(
      await shapeAt({ items: { properties: { name: { type: 'string' } } } }, '/0', [{ name: 'x' }]),
    ).toBe('object')
  })
})

describe('validation semantics are untouched', () => {
  /**
   * The core separation. JSON Schema does not read `{ properties: … }` as an
   * assertion that the instance is an object: the object keywords are
   * inapplicable to anything else, so a string, a number, null and an array
   * all validate. Deriving an object shape for the form must not change that,
   * which is why nothing writes a `type` into the schema.
   *
   * Measured before the change and asserted after it, so the two halves of the
   * invariant are pinned by the same test.
   */
  const typeless = { properties: { name: { type: 'string' } }, required: ['name'] }

  it.each([
    ['a string', 'a string'],
    ['a number', 42],
    ['null', null],
    ['an array', []],
  ])('accepts %s, exactly as the schema says', async (_label, data) => {
    const adapter = await createJsonSchemaAdapter(typeless, { defaultDialect: 'draft-07' })
    expect((await adapter.validate(data)).valid).toBe(true)
  })

  it('still applies the object keywords to an object', async () => {
    const adapter = await createJsonSchemaAdapter(typeless, { defaultDialect: 'draft-07' })
    expect((await adapter.validate({})).valid).toBe(false)
    expect((await adapter.validate({ name: 'x' })).valid).toBe(true)
    expect((await adapter.validate({ name: 1 })).valid).toBe(false)
  })

  it('projects an object shape for the very same schema', async () => {
    expect(await shapeAt(typeless, '')).toBe('object')
  })

  /**
   * The schema handed to the adapter is not modified, so a caller that keeps a
   * reference to it, or reuses it for a second adapter, sees what it wrote.
   */
  it('does not mutate the schema it was given', async () => {
    const schema: Record<string, unknown> = { properties: { a: { type: 'string' } } }
    const before = JSON.stringify(schema)
    const adapter = await createJsonSchemaAdapter(schema, { defaultDialect: 'draft-07' })
    adapter.project({ a: 'x' })
    await adapter.validate({ a: 'x' })
    expect(JSON.stringify(schema)).toBe(before)
    expect('type' in schema).toBe(false)
  })
})

describe('an explicit type always wins', () => {
  it('is not overridden by keywords from another type', async () => {
    // `properties` alongside `type: string` is legal and inert: the keyword
    // applies to objects, and the instance is declared a string.
    expect(await shapeAt({ type: 'string', properties: { a: { type: 'string' } } }, '')).toBe(
      'string',
    )
    expect(await shapeAt({ type: 'string', minLength: 3, properties: {} }, '')).toBe('string')
  })

  it('is not overridden where inference would otherwise report ambiguity', async () => {
    const projection = await project({
      type: 'object',
      properties: { a: { type: 'string' } },
      minLength: 3,
    })
    expect(projection.nodes.get('' as JsonPointer)?.type).toBe('object')
    expect(projection.diagnostics).toEqual([])
  })
})

describe('ambiguity is reported, not guessed', () => {
  /**
   * A schema may legitimately carry keywords belonging to different types.
   * There is no single shape to derive, so nothing is chosen, and the pointer
   * is named in a diagnostic instead of vanishing without a word.
   */
  it('reports a schema mixing object and string keywords', async () => {
    const projection = await project({ properties: { name: { type: 'string' } }, minLength: 3 })

    expect([...projection.nodes.keys()]).toEqual([])
    expect(projection.diagnostics).toHaveLength(1)
    const [diagnostic] = projection.diagnostics!
    expect(diagnostic.pointer).toBe('')
    expect(diagnostic.code).toBe('ambiguous-projection-shape')
    expect(diagnostic.message).toContain('object, string')
  })

  it.each([
    ['object and array', { properties: { a: {} }, items: { type: 'string' } }, 'array, object'],
    ['object and number', { required: ['a'], minimum: 1 }, 'number, object'],
    ['array and string', { items: {}, pattern: '^a' }, 'array, string'],
    ['string and number', { minLength: 1, minimum: 1 }, 'number, string'],
  ])('reports %s as ambiguous', async (_label, schema, families) => {
    const projection = await project(schema)
    expect(projection.nodes.size).toBe(0)
    expect(projection.diagnostics?.[0]?.message).toContain(families)
  })

  /** Order of the keywords in the schema must not change the outcome. */
  it('is deterministic regardless of keyword order', async () => {
    const one = await project({ minLength: 3, properties: { a: { type: 'string' } } })
    const two = await project({ properties: { a: { type: 'string' } }, minLength: 3 })
    expect(one.diagnostics).toEqual(two.diagnostics)
  })

  it('names the pointer of a nested ambiguity, and keeps the rest of the form', async () => {
    const projection = await project({
      properties: {
        good: { type: 'string' },
        muddled: { properties: { a: { type: 'string' } }, minLength: 3 },
      },
    })

    expect([...projection.nodes.keys()]).toEqual(['', '/good'])
    expect(projection.diagnostics?.map((d) => d.pointer)).toEqual(['/muddled'])
  })
})

describe('nothing scalar or generic is inferred', () => {
  /**
   * A scalar shape would need a rule that is right rather than symmetrical,
   * and there is not one: `minimum` cannot tell `number` from `integer`. A
   * single scalar family therefore resolves to nothing, which is not the same
   * as ambiguous, so no diagnostic is raised either.
   */
  it.each([
    ['minLength alone', { minLength: 1 }],
    ['pattern alone', { pattern: '^a' }],
    ['minimum alone', { minimum: 0 }],
    ['multipleOf alone', { multipleOf: 2 }],
  ])('%s resolves to no shape and no diagnostic', async (_label, schema) => {
    const projection = await project(schema)
    expect(projection.nodes.size).toBe(0)
    expect(projection.diagnostics).toEqual([])
  })

  /**
   * Generic keywords describe or compose a schema without belonging to a type,
   * so none of them may decide a shape. `enum` is the tempting one: its
   * members are strings here and it still resolves to nothing.
   */
  it.each([
    ['title', { title: 'A' }],
    ['description', { description: 'A' }],
    ['default', { default: 'a' }],
    ['examples', { examples: ['a'] }],
    ['readOnly', { readOnly: true }],
    ['writeOnly', { writeOnly: true }],
    ['deprecated', { deprecated: true }],
    ['const', { const: 'a' }],
    ['enum', { enum: ['a', 'b'] }],
    ['not', { not: { type: 'number' } }],
    ['an empty schema', {}],
  ])('%s decides nothing', async (_label, schema) => {
    expect(await pointers(schema)).toEqual([])
  })

  /**
   * `format` annotates a string's contents rather than describing structure,
   * and schemas apply it to non-strings in practice, so it is not a signal.
   */
  it('does not infer a string from format', async () => {
    expect(await pointers({ format: 'email' })).toEqual([])
  })
})

describe('deriving a shape does not pre-empt branch resolution', () => {
  /**
   * A typeless wrapper carrying both `properties` and `oneOf` needs its branch
   * resolved against the data first. Deriving `object` from `properties`
   * before that would take it down the object path with no branch selected, so
   * the discriminator would render and the branch's own fields would not.
   */
  const discriminated = {
    properties: { kind: { type: 'string' } },
    oneOf: [
      { properties: { kind: { const: 'a' }, onlyA: { type: 'string' } } },
      { properties: { kind: { const: 'b' }, onlyB: { type: 'string' } } },
    ],
  }

  it('projects the discriminator and every branch candidate', async () => {
    const found = await pointers(discriminated, { kind: 'a' })
    expect(found).toContain('')
    expect(found).toContain('/kind')
    expect(found).toContain('/onlyA')
    expect(found).toContain('/onlyB')
  })

  it('marks the selected branch active and the other inactive', async () => {
    const projection = await project(discriminated, { kind: 'a' })
    expect(projection.nodes.get('/onlyA' as JsonPointer)?.active).toBe(true)
    expect(projection.nodes.get('/onlyB' as JsonPointer)?.active).toBe(false)
  })
})

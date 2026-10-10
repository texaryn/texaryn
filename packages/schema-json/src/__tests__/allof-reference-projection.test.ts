import { describe, expect, it } from 'vitest'
import { createJsonSchemaAdapter } from '../index.js'
import { createAdapter } from '../adapter.js'
import type { JsonPointer } from '@texaryn/core'

const draft07 = 'http://json-schema.org/draft-07/schema#'

describe('Draft 7 allOf references', () => {
  it('projects an object shape and required properties from a referenced branch', async () => {
    const adapter = await createJsonSchemaAdapter(
      {
        $schema: draft07,
        definitions: {
          object: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
          },
        },
        allOf: [{ $ref: '#/definitions/object' }],
      },
      { defaultDialect: 'draft-07' },
    )

    const projection = adapter.project({})

    expect(projection.nodes.get('' as JsonPointer)?.type).toBe('object')
    expect(projection.nodes.get('/name' as JsonPointer)?.type).toBe('string')
    expect(projection.nodes.get('' as JsonPointer)?.children).toEqual([
      { pointer: '/name', key: 'name', required: true },
    ])
    expect(projection.diagnostics).toEqual([])
  })

  it('merges a referenced object branch with local object properties', async () => {
    const adapter = await createJsonSchemaAdapter(
      {
        $schema: draft07,
        properties: { local: { type: 'string' } },
        definitions: {
          object: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
          },
        },
        allOf: [{ $ref: '#/definitions/object' }],
      },
      { defaultDialect: 'draft-07' },
    )

    const projection = adapter.project({})

    expect(projection.nodes.get('/local' as JsonPointer)?.type).toBe('string')
    expect(projection.nodes.get('/name' as JsonPointer)?.type).toBe('string')
    expect(projection.nodes.get('' as JsonPointer)?.children).toEqual([
      { pointer: '/local', key: 'local', required: false },
      { pointer: '/name', key: 'name', required: true },
    ])
  })

  it('projects array items and annotations from a referenced branch', async () => {
    const adapter = await createJsonSchemaAdapter(
      {
        $schema: draft07,
        definitions: {
          list: {
            type: 'array',
            items: { type: 'string', default: 'item default' },
          },
        },
        allOf: [{ $ref: '#/definitions/list' }],
      },
      { defaultDialect: 'draft-07' },
    )

    const projection = adapter.project(['value'])

    expect(projection.nodes.get('' as JsonPointer)?.type).toBe('array')
    expect(projection.nodes.get('' as JsonPointer)?.itemAnnotations?.default).toBe('item default')
    expect(projection.nodes.get('/0' as JsonPointer)?.annotations.default).toBe('item default')
    expect(projection.diagnostics).toEqual([])
  })

  it('reduces inline array keywords before walking elements', async () => {
    const adapter = await createJsonSchemaAdapter(
      {
        $schema: draft07,
        type: 'array',
        allOf: [{ items: { type: 'string', default: 'inline default' } }],
      },
      { defaultDialect: 'draft-07' },
    )

    const projection = adapter.project(['value'])

    expect(projection.nodes.get('' as JsonPointer)?.itemAnnotations?.default).toBe('inline default')
    expect(projection.nodes.get('/0' as JsonPointer)?.annotations.default).toBe('inline default')
  })

  it('keeps later inline constraints after a referenced branch', async () => {
    const adapter = await createJsonSchemaAdapter(
      {
        $schema: draft07,
        definitions: {
          base: { type: 'object', properties: { name: { type: 'string', minLength: 2 } } },
        },
        allOf: [
          { $ref: '#/definitions/base' },
          { properties: { name: { type: 'string', minLength: 5 } } },
        ],
      },
      { defaultDialect: 'draft-07' },
    )

    const projection = adapter.project({ name: 'abc' })

    expect(projection.nodes.get('/name' as JsonPointer)?.constraints.minLength).toBe(5)
    expect((await adapter.validate({ name: 'abc' })).valid).toBe(false)
  })

  it('keeps conditional reducer order around referenced branches', async () => {
    const adapter = await createJsonSchemaAdapter(
      {
        $schema: draft07,
        type: 'object',
        properties: { flag: { type: 'boolean' } },
        definitions: {
          base: { properties: { name: { type: 'string', minLength: 2 } } },
        },
        allOf: [{ $ref: '#/definitions/base' }],
        if: { properties: { flag: { const: true } } },
        then: { properties: { name: { type: 'string', minLength: 5 } } },
      },
      { defaultDialect: 'draft-07' },
    )

    const projection = adapter.project({ name: 'abc', flag: true })

    expect(projection.nodes.get('/name' as JsonPointer)?.constraints.minLength).toBe(5)
    expect((await adapter.validate({ name: 'abc', flag: true })).valid).toBe(false)
  })

  it('composes repeated sibling references with their nested allOf branches', async () => {
    const adapter = await createJsonSchemaAdapter(
      {
        $schema: draft07,
        type: 'object',
        definitions: {
          base: { allOf: [{ $ref: '#/definitions/details' }] },
          details: { properties: { name: { type: 'string', minLength: 5 } } },
        },
        allOf: [
          { $ref: '#/definitions/base' },
          { properties: { name: { type: 'string', minLength: 2 } } },
          { $ref: '#/definitions/base' },
        ],
      },
      { defaultDialect: 'draft-07' },
    )

    const projection = adapter.project({ name: 'abc' })

    expect(projection.nodes.get('/name' as JsonPointer)?.constraints.minLength).toBe(5)
    expect((await adapter.validate({ name: 'abc' })).valid).toBe(false)
  })

  it.each([
    ['draft-07', draft07, 'definitions'],
    ['2019-09', 'https://json-schema.org/draft/2019-09/schema', '$defs'],
    ['2020-12', 'https://json-schema.org/draft/2020-12/schema', '$defs'],
  ] as const)('composes references nested inside inline allOf branches in %s', async (dialect, schemaUri, defsKeyword) => {
    const reference = `#/${defsKeyword}/object`
    for (const type of [undefined, 'object'] as const) {
      const adapter = await createJsonSchemaAdapter(
        {
          $schema: schemaUri,
          ...(type ? { type } : {}),
          [defsKeyword]: {
            object: {
              type: 'object',
              properties: { name: { type: 'string' } },
              required: ['name'],
            },
          },
          allOf: [{ allOf: [{ $ref: reference }] }],
        },
        { defaultDialect: dialect },
      )

      const projection = adapter.project({})

      expect(projection.nodes.get('' as JsonPointer)?.type).toBe('object')
      expect(projection.nodes.get('/name' as JsonPointer)?.active).toBe(true)
      expect(projection.nodes.get('' as JsonPointer)?.children).toEqual([
        { pointer: '/name', key: 'name', required: true },
      ])
      expect(projection.diagnostics).toEqual([])
    }
  })

  it.each([
    ['draft-07', draft07, 'definitions'],
    ['2019-09', 'https://json-schema.org/draft/2019-09/schema', '$defs'],
    ['2020-12', 'https://json-schema.org/draft/2020-12/schema', '$defs'],
  ] as const)('uses explicit types from allOf references before local shape inference in %s', async (dialect, schemaUri, defsKeyword) => {
    const objectAdapter = await createJsonSchemaAdapter(
      {
        $schema: schemaUri,
        items: { type: 'string' },
        [defsKeyword]: {
          target: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
        },
        allOf: [{ $ref: `#/${defsKeyword}/target` }],
      },
      { defaultDialect: dialect },
    )
    const arrayAdapter = await createJsonSchemaAdapter(
      {
        $schema: schemaUri,
        properties: { name: { type: 'string' } },
        [defsKeyword]: {
          target: { type: 'array', items: { type: 'string', default: 'item default' } },
        },
        allOf: [{ $ref: `#/${defsKeyword}/target` }],
      },
      { defaultDialect: dialect },
    )

    const objectProjection = objectAdapter.project({ name: 'value' })
    const arrayProjection = arrayAdapter.project(['value'])

    expect(objectProjection.nodes.get('' as JsonPointer)?.type).toBe('object')
    expect(objectProjection.nodes.get('/name' as JsonPointer)?.type).toBe('string')
    expect(objectProjection.nodes.get('' as JsonPointer)?.children).toEqual([
      { pointer: '/name', key: 'name', required: true },
    ])
    expect(arrayProjection.nodes.get('' as JsonPointer)?.type).toBe('array')
    expect(arrayProjection.nodes.get('/0' as JsonPointer)?.annotations.default).toBe('item default')
  })

  it.each([
    ['draft-07', draft07, 'definitions'],
    ['2019-09', 'https://json-schema.org/draft/2019-09/schema', '$defs'],
    ['2020-12', 'https://json-schema.org/draft/2020-12/schema', '$defs'],
  ] as const)('keeps an unresolved referenced branch on the diagnostic path in %s', async (dialect, schemaUri, defsKeyword) => {
    const variants = [
      { allOf: [{ $ref: `#/${defsKeyword}/missing` }] },
      { type: 'object', allOf: [{ $ref: `#/${defsKeyword}/missing` }] },
      { properties: { child: { type: 'string' } }, allOf: [{ $ref: `#/${defsKeyword}/missing` }] },
    ]
    for (const nameSchema of variants) {
      const adapter = await createJsonSchemaAdapter(
        { $schema: schemaUri, type: 'object', properties: { name: nameSchema } },
        { defaultDialect: dialect },
      )

      expect(() => adapter.project({})).not.toThrow()
      if (!('type' in nameSchema) && !('properties' in nameSchema)) {
        expect(adapter.project({}).diagnostics?.map(({ pointer, code }) => [pointer, code])).toContainEqual([
          '/name',
          'unresolved-projection-shape',
        ])
      }
    }
  })

  it('does not charge an unresolved reference against recursive expansion limits', async () => {
    const adapter = await createAdapter(
      {
        $schema: draft07,
        type: 'object',
        properties: {
          container: {
            type: 'object',
            properties: {
              invalid: { $ref: '#/missing' },
              repeat: { $ref: '#/properties/container' },
              value: { type: 'string' },
            },
          },
        },
      },
      undefined,
      { objects: 1, nodes: 2 },
    )

    const projection = adapter.project({})

    expect(projection.nodes.get('/container' as JsonPointer)?.boundaries).toEqual(['recursion'])
    expect(projection.nodes.has('/container/value' as JsonPointer)).toBe(true)
    expect(projection.diagnostics?.map(({ pointer, code }) => [pointer, code])).toContainEqual([
      '/container/invalid',
      'unresolved-projection-shape',
    ])
  })
})

describe('static reference projection composition', () => {
  it.each(['oneOf', 'anyOf'] as const)('selects a referenced %s branch with scalar siblings', async (keyword) => {
    const adapter = await createJsonSchemaAdapter({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $defs: {
        target: {
          [keyword]: [{ type: 'string' }, { type: 'number' }],
        },
      },
      type: 'object',
      properties: {
        field: {
          $ref: '#/$defs/target',
          title: 'Selected value',
          pattern: '^a',
        },
      },
    })

    const projection = adapter.project({ field: 'apple' })
    const field = projection.nodes.get('/field' as JsonPointer)

    expect(field?.type).toBe('string')
    expect(field?.constraints.pattern).toBe('^a')
    expect(field?.annotations.title).toBe('Selected value')
  })

  it('keeps a provisionally selected object branch when a referenced oneOf is incomplete', async () => {
    const adapter = await createJsonSchemaAdapter({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $defs: {
        target: {
          oneOf: [
            { properties: { kind: { const: 'a' }, value: { type: 'string' } }, required: ['kind', 'value'] },
            { properties: { kind: { const: 'b' }, count: { type: 'number' } }, required: ['kind', 'count'] },
          ],
        },
      },
      type: 'object',
      properties: {
        field: {
          $ref: '#/$defs/target',
          title: 'Selected object',
          properties: { note: { type: 'string' } },
          required: ['note'],
        },
      },
    })

    const projection = adapter.project({ field: { kind: 'a' } })

    expect(projection.nodes.get('/field' as JsonPointer)?.active).toBe(true)
    expect(projection.nodes.get('/field/value' as JsonPointer)?.provisional).toBe(true)
    expect(projection.nodes.get('/field/note' as JsonPointer)?.active).toBe(true)
    const children = projection.nodes.get('/field' as JsonPointer)?.children
    expect(children?.find(({ key }) => key === 'note')).toMatchObject({ required: true })
    expect(children?.find(({ key }) => key === 'value')).toMatchObject({
      required: false,
      provisionalRequired: true,
    })
  })

  it('preserves each reference component resource scope', async () => {
    const adapter = await createJsonSchemaAdapter({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'https://example.test/root.json',
      $defs: {
        Local: { type: 'string' },
        External: {
          $id: 'https://example.test/external.json',
          type: 'object',
          properties: { remote: { type: 'string' } },
        },
      },
      type: 'object',
      properties: {
        field: {
          $ref: 'https://example.test/external.json',
          properties: { local: { $ref: '#/$defs/Local' } },
        },
      },
    })

    const projection = adapter.project({ field: {} })

    expect(projection.nodes.get('/field/local' as JsonPointer)?.type).toBe('string')
    expect(projection.nodes.get('/field/remote' as JsonPointer)?.type).toBe('string')
  })
})

describe('allOf reduction with missing object data', () => {
  it.each([
    ['draft-07', draft07],
    ['2019-09', 'https://json-schema.org/draft/2019-09/schema'],
    ['2020-12', 'https://json-schema.org/draft/2020-12/schema'],
  ] as const)('keeps the applicable else branch when data is absent in %s', async (dialect, schemaUri) => {
    const adapter = await createJsonSchemaAdapter(
      {
        $schema: schemaUri,
        properties: { x: { type: 'string' } },
        allOf: [{}],
        if: { required: ['a'] },
        else: { properties: { no: { type: 'string' } }, required: ['no'] },
      },
      { defaultDialect: dialect },
    )

    const projection = adapter.project(undefined)

    expect(projection.nodes.get('/no' as JsonPointer)?.active).toBe(true)
    expect(projection.nodes.get('' as JsonPointer)?.children).toContainEqual({
      pointer: '/no',
      key: 'no',
      required: true,
    })
  })

  it.each([
    ['draft-07', draft07, 'definitions'],
    ['2019-09', 'https://json-schema.org/draft/2019-09/schema', '$defs'],
    ['2020-12', 'https://json-schema.org/draft/2020-12/schema', '$defs'],
  ] as const)('recognizes an inferred object shape through an allOf reference in %s', async (dialect, schemaUri, defsKeyword) => {
    const adapter = await createJsonSchemaAdapter(
      {
        $schema: schemaUri,
        [defsKeyword]: {
          object: {
            properties: { x: { type: 'string' } },
            if: { required: ['a'] },
            else: {
              properties: { no: { type: 'string', default: 'child' } },
              required: ['no'],
              default: { no: 'else' },
            },
          },
        },
        allOf: [{ $ref: `#/${defsKeyword}/object` }],
      },
      { defaultDialect: dialect },
    )

    for (const data of [undefined, null, {}]) {
      const projection = adapter.project(data)

      expect(projection.nodes.get('/no' as JsonPointer)?.active).toBe(true)
      expect(projection.nodes.get('' as JsonPointer)?.children).toContainEqual({
        pointer: '/no',
        key: 'no',
        required: true,
      })
      expect(projection.nodes.get('' as JsonPointer)?.annotations.default).toEqual({ no: 'else' })
      expect(projection.nodes.get('/no' as JsonPointer)?.annotations.default).toBe('child')
    }
  })
})

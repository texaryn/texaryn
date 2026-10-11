import { describe, expect, it } from 'vitest'
import * as z from 'zod'
import type { JsonPointer } from '@texaryn/core'
import { createZodAdapter } from '../index.js'

describe('createZodAdapter', () => {
  it('projects Zod input shape, constraints, and annotations through the JSON Schema adapter', async () => {
    const schema = z.object({
      name: z.string().min(2).max(20).meta({ title: 'Display name' }),
      active: z.boolean().optional(),
    })
    const adapter = await createZodAdapter(schema)
    const projection = adapter.project({})
    const name = projection.nodes.get('/name' as JsonPointer)!

    expect(name.type).toBe('string')
    expect(name.constraints.minLength).toBe(2)
    expect(name.constraints.maxLength).toBe(20)
    expect(name.annotations.title).toBe('Display name')
    expect(projection.nodes.has('/active' as JsonPointer)).toBe(true)
  })

  it('can target Draft 7', async () => {
    const adapter = await createZodAdapter(z.object({ name: z.string() }), { target: 'draft-07' })
    expect(adapter.project({}).nodes.has('/name' as JsonPointer)).toBe(true)
  })

  it('maps Zod issue codes and bounds to JSON Schema keywords', async () => {
    const adapter = await createZodAdapter(
      z.object({
        email: z.email(),
        constant: z.literal('fixed'),
        choice: z.enum(['first', 'second']),
        strict: z.object({ known: z.string() }).strict(),
        multiple: z.number().multipleOf(0.5),
        maxString: z.string().max(2),
        minArray: z.array(z.string()).min(2),
        maxArray: z.array(z.string()).max(1),
        minNumber: z.number().min(1),
        exclusiveMin: z.number().gt(1),
        maxNumber: z.number().max(1),
        exclusiveMax: z.number().lt(1),
      }),
    )
    const result = await adapter.validate({
      email: 'invalid',
      constant: 'other',
      choice: 'third',
      strict: { known: 'ok', extra: true },
      multiple: 1.2,
      maxString: 'long',
      minArray: [],
      maxArray: ['first', 'second'],
      minNumber: 0,
      exclusiveMin: 1,
      maxNumber: 2,
      exclusiveMax: 1,
    })

    expect(result.errors.map(({ instancePointer, keyword }) => [instancePointer, keyword])).toEqual([
      ['/email', 'format'],
      ['/constant', 'const'],
      ['/choice', 'enum'],
      ['/strict', 'additionalProperties'],
      ['/multiple', 'multipleOf'],
      ['/maxString', 'maxLength'],
      ['/minArray', 'minItems'],
      ['/maxArray', 'maxItems'],
      ['/minNumber', 'minimum'],
      ['/exclusiveMin', 'exclusiveMinimum'],
      ['/maxNumber', 'maximum'],
      ['/exclusiveMax', 'exclusiveMaximum'],
    ])
  })

  it('validates with Zod and preserves async refinements and custom messages', async () => {
    const schema = z.object({
      code: z.string().refine(async (value) => value === 'approved', 'Code is not approved'),
    })
    const adapter = await createZodAdapter(schema)
    const result = await adapter.validate({ code: 'pending' })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({
        instancePointer: '/code',
        keyword: 'custom',
        message: 'Code is not approved',
      }),
    ])
  })

  it('escapes issue paths and scopes validateAt to that pointer and its descendants', async () => {
    const schema = z.object({
      'a/b~c': z.string().min(2),
      other: z.string().min(2),
    })
    const adapter = await createZodAdapter(schema)
    const result = await adapter.validateAt({ 'a/b~c': '', other: '' }, '/a~1b~0c' as JsonPointer)

    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.instancePointer).toBe('/a~1b~0c')
    expect(result.errors[0]?.keyword).toBe('minLength')
  })

  it('returns all errors for the root pointer and no errors for an unrelated pointer', async () => {
    const adapter = await createZodAdapter(z.object({ name: z.string().min(2) }))

    const rootResult = await adapter.validateAt({ name: '' }, '' as JsonPointer)
    const unrelatedResult = await adapter.validateAt({ name: '' }, '/other' as JsonPointer)

    expect(rootResult.errors).toHaveLength(1)
    expect(unrelatedResult).toEqual({ valid: true, errors: [] })
  })

  it('keeps nested union branch failures visible to validateAt', async () => {
    const schema = z.object({
      payload: z.union([
        z.object({ name: z.string() }),
        z.object({ count: z.number() }),
      ]),
    })
    const adapter = await createZodAdapter(schema)
    const result = await adapter.validateAt({ payload: { name: 123 } }, '/payload/name' as JsonPointer)

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({ instancePointer: '/payload/name', keyword: 'type' }),
    ])
  })

  it('deduplicates equivalent failures shared by union branches', async () => {
    const schema = z.object({
      payload: z.union([
        z.object({ name: z.string(), left: z.string() }),
        z.object({ name: z.string(), right: z.number() }),
      ]),
    })
    const adapter = await createZodAdapter(schema)
    const result = await adapter.validateAt({ payload: { name: 123 } }, '/payload/name' as JsonPointer)

    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({ instancePointer: '/payload/name', keyword: 'type' })
  })

  it('does not merge branch errors with distinct custom parameters', async () => {
    const schemaFor = (params: Record<string, unknown>) =>
      z.string().superRefine((_value, context) => {
        context.addIssue({ code: 'custom', message: 'Different parameters', params })
      })
    const schema = z.object({
      payload: z.union([
        z.object({ name: schemaFor({ value: undefined }), left: z.string() }),
        z.object({ name: schemaFor({ value: { $undefined: true } }), right: z.string() }),
      ]),
    })
    const adapter = await createZodAdapter(schema)
    const result = await adapter.validate({ payload: { name: 'value' } })
    const nameErrors = result.errors.filter((error) => error.instancePointer === '/payload/name')

    expect(nameErrors).toHaveLength(2)
  })

  it('preserves duplicate custom issues emitted by a schema refinement', async () => {
    const schema = z.string().superRefine((_value, context) => {
      context.addIssue({ code: 'custom', message: 'Repeated by the schema' })
      context.addIssue({ code: 'custom', message: 'Repeated by the schema' })
    })
    const adapter = await createZodAdapter(schema)
    const result = await adapter.validate('value')

    expect(result.errors).toHaveLength(2)
  })

  it('preserves duplicate custom issues within a union branch while merging branches', async () => {
    const repeated = z.string().superRefine((_value, context) => {
      context.addIssue({ code: 'custom', message: 'Repeated by the schema' })
      context.addIssue({ code: 'custom', message: 'Repeated by the schema' })
    })
    const adapter = await createZodAdapter(z.union([repeated, z.number()]))
    const result = await adapter.validate('value')

    expect(result.errors.filter((error) => error.keyword === 'custom')).toHaveLength(2)
  })

  it('merges union failures using type aware stable parameters', async () => {
    const withValue = (value: unknown) =>
      z.string().superRefine((_input, context) => {
        context.addIssue({ code: 'custom', message: 'Equivalent value', params: { value } })
      })
    const nullPrototypeA = Object.assign(Object.create(null) as Record<string, unknown>, {
      nested: [null, true],
    })
    const nullPrototypeB = Object.assign(Object.create(null) as Record<string, unknown>, {
      nested: [null, true],
    })
    const shared = { nested: 'value' }
    const sharedGraph = { first: shared, second: shared }
    const repeatedGraph = { first: { nested: 'value' }, second: { nested: 'value' } }
    const schema = z.union([
      withValue(null),
      withValue(null),
      withValue('text'),
      withValue('text'),
      withValue(true),
      withValue(true),
      withValue(-0),
      withValue(-0),
      withValue(0),
      withValue(0),
      withValue(12n),
      withValue(12n),
      withValue(undefined),
      withValue(undefined),
      withValue([1, 'nested']),
      withValue([1, 'nested']),
      withValue({ second: 2, first: 'ordered' }),
      withValue({ first: 'ordered', second: 2 }),
      withValue(nullPrototypeA),
      withValue(nullPrototypeB),
      withValue(sharedGraph),
      withValue(repeatedGraph),
    ])
    const adapter = await createZodAdapter(schema)
    const result = await adapter.validate('value')

    expect(result.errors).toHaveLength(11)
  })

  it('preserves union failures with values that cannot be serialized safely', async () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const withValue = (value: unknown) =>
      z.string().superRefine((_input, context) => {
        context.addIssue({ code: 'custom', message: 'Unsafe value', params: { value } })
      })
    const schema = z.union([
      withValue(Symbol('value')),
      withValue(() => 'value'),
      withValue(new Date(0)),
      withValue(circular),
      withValue([() => 'value']),
      withValue({ nested: () => 'value' }),
    ])
    const adapter = await createZodAdapter(schema)
    const result = await adapter.validate('value')

    expect(result.errors.filter((error) => error.keyword === 'custom')).toHaveLength(6)
  })

  it('uses the input schema for transforms while leaving validation to Zod', async () => {
    const schema = z.string().transform(Number)
    const adapter = await createZodAdapter(schema)

    expect(adapter.project('12').nodes.get('' as JsonPointer)?.type).toBe('string')
    expect((await adapter.validate('12')).valid).toBe(true)
    expect((await adapter.validate(12)).valid).toBe(false)
  })

  it('requires an explicit fallback for unrepresentable Zod types', async () => {
    const schema = z.date()

    await expect(createZodAdapter(schema)).rejects.toThrow()
    const adapter = await createZodAdapter(schema, { unrepresentable: 'any' })
    expect(adapter.project(new Date()).nodes.get('' as JsonPointer)?.type).toBeUndefined()
    expect((await adapter.validate(new Date())).valid).toBe(true)
  })
})

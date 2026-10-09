import { describe, expect, it } from 'vitest'
import { createJsonSchemaAdapter } from '../index.js'

describe('projected submission data', () => {
  it('omits an inactive conditional property without changing form data', async () => {
    const adapter = await createJsonSchemaAdapter({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { flag: { type: 'boolean' } },
      allOf: [{
        if: { properties: { flag: { const: true } }, required: ['flag'] },
        then: { properties: { revealed: { type: 'string' } } },
      }],
      additionalProperties: true,
    })
    const data = { flag: false, revealed: 'typed', extra: 'kept' }
    const projectSubmission = adapter.projectSubmission!

    expect(projectSubmission(data)).toEqual({ flag: false, extra: 'kept' })
    expect(projectSubmission(data)).not.toBe(data)
    expect(data).toEqual({ flag: false, revealed: 'typed', extra: 'kept' })
    expect(projectSubmission({ flag: true, revealed: 'typed' })).toEqual({ flag: true, revealed: 'typed' })
  })

  it('keeps the selected oneOf branch and drops the other branch data', async () => {
    const adapter = await createJsonSchemaAdapter({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      oneOf: [
        { properties: { kind: { const: 'a' }, alpha: { type: 'string' } }, required: ['kind'] },
        { properties: { kind: { const: 'b' }, beta: { type: 'number' } }, required: ['kind'] },
      ],
    })
    const projectSubmission = adapter.projectSubmission!

    expect(projectSubmission({ kind: 'a', alpha: 'kept', beta: 5 })).toEqual({ kind: 'a', alpha: 'kept' })
  })

  it('preserves a subtree when oneOf selection is invalid', async () => {
    const adapter = await createJsonSchemaAdapter({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      oneOf: [
        { properties: { kind: { const: 'a' }, alpha: { type: 'string' } }, required: ['kind', 'alpha'] },
        { properties: { kind: { const: 'b' }, beta: { type: 'number' } }, required: ['kind', 'beta'] },
      ],
    })
    const projectSubmission = adapter.projectSubmission!
    const invalid = { alpha: 'keep', beta: 5 }

    expect(projectSubmission(invalid)).toEqual(invalid)
    expect(projectSubmission(invalid)).not.toBe(invalid)
  })

  it('preserves undeclared data so additionalProperties validation still runs', async () => {
    const adapter = await createJsonSchemaAdapter({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { known: { type: 'string' } },
      additionalProperties: false,
    })
    expect(adapter.projectSubmission).toBeTypeOf('function')
    const data = { known: 'kept', extra: true }
    const submission = adapter.projectSubmission!(data)

    expect(submission).toEqual(data)
    expect((await adapter.validate(submission)).valid).toBe(false)
  })

  it('preserves data rejected by an additionalProperties rule in another allOf position', async () => {
    const adapter = await createJsonSchemaAdapter({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      allOf: [
        {
          properties: { flag: { type: 'boolean' } },
          if: { properties: { flag: { const: true } }, required: ['flag'] },
          then: { properties: { revealed: { type: 'string' } } },
        },
        { additionalProperties: false },
      ],
    })
    const data = { flag: false, revealed: 'typed' }
    const submission = adapter.projectSubmission!(data)

    expect(submission).toEqual(data)
    expect((await adapter.validate(submission)).valid).toBe(false)
  })

  it('keeps unknown data when an inactive branch declares an additionalProperties schema', async () => {
    const adapter = await createJsonSchemaAdapter({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { flag: { type: 'boolean' } },
      if: { properties: { flag: { const: true } }, required: ['flag'] },
      then: { additionalProperties: { type: 'string' } },
    })
    const data = { flag: false, unknown: 123 }

    expect(adapter.projectSubmission!(data)).toEqual(data)
  })

  it('removes an inactive declaration even when an active additionalProperties schema selects the key', async () => {
    const adapter = await createJsonSchemaAdapter({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: {},
      properties: { flag: { type: 'boolean' } },
      if: { properties: { flag: { const: true } }, required: ['flag'] },
      then: { properties: { secret: { type: 'string' } } },
    })
    const data = { flag: false, secret: 'stale' }

    expect(adapter.projectSubmission!(data)).toEqual({ flag: false })
  })

  it('distinguishes a properties map key from the properties keyword in a fallback path', async () => {
    const adapter = await createJsonSchemaAdapter({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: {
        properties: {
          type: 'object',
          additionalProperties: {},
          properties: { flag: { type: 'boolean' } },
          if: { properties: { flag: { const: true } }, required: ['flag'] },
          then: { properties: { secret: { type: 'string' } } },
        },
      },
    })
    const data = { properties: { flag: false, secret: 'stale' } }

    expect(adapter.projectSubmission!(data)).toEqual({ properties: { flag: false } })
  })

  it('removes an inactive declaration when the additionalProperties fallback is referenced', async () => {
    const adapter = await createJsonSchemaAdapter({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: { $ref: '#/$defs/open' },
      $defs: { open: {} },
      properties: { flag: { type: 'boolean' } },
      if: { properties: { flag: { const: true } }, required: ['flag'] },
      then: { properties: { secret: { type: 'string' } } },
    })
    const data = { flag: false, secret: 'stale' }

    expect(adapter.projectSubmission!(data)).toEqual({ flag: false })
  })

  it('recurses through an additionalProperties schema without pruning its own properties', async () => {
    const adapter = await createJsonSchemaAdapter({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      additionalProperties: { properties: { name: { type: 'string' } } },
    })
    const data = { box: { name: 'Alice' } }

    expect(adapter.projectSubmission!(data)).toEqual(data)
  })

  it('does not treat a property named additionalProperties as a fallback', async () => {
    const adapter = await createJsonSchemaAdapter({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { additionalProperties: { type: 'string' } },
      additionalProperties: {},
    })
    const data = { additionalProperties: 'kept' }

    expect(adapter.projectSubmission!(data)).toEqual(data)
  })

  it('does not confuse a slash in a property name with the additionalProperties keyword', async () => {
    const adapter = await createJsonSchemaAdapter({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { 'x/additionalProperties': { type: 'string' } },
      additionalProperties: {},
    })
    const data = { 'x/additionalProperties': 'kept' }

    expect(adapter.projectSubmission!(data)).toEqual(data)
  })

  it('keeps predicate data while retaining the selected branch data', async () => {
    const adapter = await createJsonSchemaAdapter({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      if: { properties: { flag: { const: true } }, required: ['flag'] },
      then: { properties: { secret: { type: 'string' } }, required: ['secret'] },
      else: { properties: { other: { type: 'string' } }, required: ['other'] },
    })
    const data = { flag: true, secret: 'value' }
    const submission = adapter.projectSubmission!(data)

    expect(submission).toEqual(data)
    expect((await adapter.validate(submission)).valid).toBe(true)
  })

  it('applies each prefix and tail item schema while projecting selected fields', async () => {
    const prefixRow = {
      type: 'object',
      properties: { enabled: { type: 'boolean' } },
      if: { properties: { enabled: { const: true } }, required: ['enabled'] },
      then: { properties: { prefixActive: { type: 'string' } } },
      else: { properties: { prefixInactive: { type: 'string' } } },
    }
    const tailRow = {
      type: 'object',
      properties: { enabled: { type: 'boolean' } },
      if: { properties: { enabled: { const: true } }, required: ['enabled'] },
      then: { properties: { tailActive: { type: 'string' } } },
      else: { properties: { tailInactive: { type: 'string' } } },
    }
    const adapter = await createJsonSchemaAdapter({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'array',
      prefixItems: [prefixRow],
      items: tailRow,
    })
    const data = [
      { enabled: true, prefixActive: 'first', prefixInactive: 'stale', tailActive: 'stale', tailInactive: 'stale' },
      { enabled: false, prefixActive: 'stale', prefixInactive: 'stale', tailActive: 'stale', tailInactive: 'second' },
    ]

    expect(adapter.projectSubmission!(data)).toEqual([
      { enabled: true, prefixActive: 'first', tailActive: 'stale', tailInactive: 'stale' },
      { enabled: false, prefixActive: 'stale', prefixInactive: 'stale', tailInactive: 'second' },
    ])
  })

  it('ignores draft-07 reference siblings while retaining undeclared data', async () => {
    const adapter = await createJsonSchemaAdapter({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        row: {
          $ref: '#/definitions/row',
          properties: { siblingOnly: { type: 'string' } },
        },
      },
      definitions: { row: { type: 'object', properties: { kept: { type: 'string' } } } },
    })
    const data = { row: { kept: 'value', siblingOnly: 'unvalidated' } }

    expect(adapter.projectSubmission!(data)).toEqual(data)
  })

  it('includes schema dependencies when projecting a selected draft-07 field', async () => {
    const adapter = await createJsonSchemaAdapter({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: { enabled: { type: 'boolean' }, item: { type: 'object' } },
      dependencies: {
        enabled: {
          properties: {
            item: {
              if: false,
              then: { properties: { stale: { type: 'string' } } },
            },
          },
        },
      },
    })
    const data = { enabled: true, item: { stale: 'discard' } }

    expect(adapter.projectSubmission!(data)).toEqual({ enabled: true, item: {} })
  })

  it('projects pattern-matched fields through their selected conditional schema', async () => {
    const adapter = await createJsonSchemaAdapter({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      patternProperties: {
        '^item': {
          properties: { enabled: { type: 'boolean' } },
          if: { properties: { enabled: { const: true } }, required: ['enabled'] },
          then: { properties: { active: { type: 'string' } } },
          else: { properties: { inactive: { type: 'string' } } },
        },
      },
    })
    const data = { itemRow: { enabled: false, active: 'stale', inactive: 'kept' } }

    expect(adapter.projectSubmission!(data)).toEqual({ itemRow: { enabled: false, inactive: 'kept' } })
  })

  it('deep clones array rows rejected by an items schema', async () => {
    const adapter = await createJsonSchemaAdapter({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'array',
      items: false,
    })
    const row = { nested: { value: 'kept' } }
    const submission = adapter.projectSubmission!([row]) as typeof row[]

    expect(submission).toEqual([row])
    expect(submission[0]).not.toBe(row)
    expect(submission[0]?.nested).not.toBe(row.nested)
  })

  it('terminates when an unreachable recursive branch is inspected for declarations', async () => {
    const adapter = await createJsonSchemaAdapter({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { value: { type: 'string' } },
      if: false,
      then: { $ref: '#' },
    })
    const data = { value: 'kept' }

    expect(adapter.projectSubmission!(data)).toEqual(data)
  })

  it('does not expose the capability for dynamic or unevaluated schemas', async () => {
    const dynamic = await createJsonSchemaAdapter({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $dynamicAnchor: 'node',
      type: 'object',
      properties: { child: { $dynamicRef: '#node' } },
    })
    const unevaluated = await createJsonSchemaAdapter({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      unevaluatedProperties: false,
    })

    expect(dynamic.projectSubmission).toBeUndefined()
    expect(unevaluated.projectSubmission).toBeUndefined()
  })
})

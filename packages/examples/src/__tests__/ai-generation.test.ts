import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import {
  GenerationRejectedError,
  runGenerationExample,
} from '../ai-generation/index.js'

const contractSchema = JSON.parse(readFileSync(
  new URL('../../../../apps/docs/public/schemas/ai-generation/v1/generation.schema.json', import.meta.url),
  'utf8',
)) as unknown

function fixture(name: string): string {
  return readFileSync(new URL(`../ai-generation/fixtures/${name}.json`, import.meta.url), 'utf8')
}

function formOutput(schema: unknown): string {
  const output = JSON.parse(fixture('form')) as Record<string, unknown>
  output.schema = schema
  return JSON.stringify(output)
}

describe('AI generation contract', () => {
  it('accepts the versioned envelope schema and exposes its reusable contracts', async () => {
    const adapter = await createJsonSchemaAdapter(contractSchema)
    const form = JSON.parse(fixture('form')) as unknown
    const display = JSON.parse(fixture('display')) as unknown

    expect(await adapter.validate(form)).toMatchObject({ valid: true })
    expect(await adapter.validate(display)).toMatchObject({ valid: true })
    expect(await adapter.validate({ format: 'texaryn-generation', version: 1, kind: 'form', schema: {}, extra: true }))
      .toMatchObject({ valid: false })
  })

  it('accepts a form only when the adapter compiles it without projection diagnostics', async () => {
    const generate = vi.fn(async () => fixture('form'))
    const result = await runGenerationExample('Build a profile form', generate, {
      kind: 'form',
      contractSchema,
      allowedWidgets: ['textarea'],
    })

    expect(result.kind).toBe('form')
    expect(result.attempts).toBe(1)
    if (result.kind === 'form') {
      expect(Object.keys(result.runtime.document.getSnapshot().nodes)).toHaveLength(3)
      result.runtime.destroy()
    }
  })

  it('accepts a display document through the version 2 runtime', async () => {
    const result = await runGenerationExample('Build a directory display', async () => fixture('display'), {
      kind: 'display',
      contractSchema,
    })

    expect(result.kind).toBe('display')
    if (result.kind === 'display') {
      expect(result.runtime.document.getSnapshot().version).toBe(2)
      result.runtime.destroy()
    }
  })

  it('repairs malformed JSON once and provides bounded diagnostics to the host callback', async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce('```json\n{}\n```')
      .mockResolvedValueOnce(fixture('form'))
    const result = await runGenerationExample('Build a profile form', generate, {
      kind: 'form',
      contractSchema,
      maxRepairs: 1,
      allowedWidgets: ['textarea'],
    })

    expect(result.attempts).toBe(2)
    expect(generate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      attempt: 2,
      maxAttempts: 2,
      feedback: [expect.stringContaining('not valid JSON')],
    }))
    if (result.kind === 'form') result.runtime.destroy()
  })

  it.each([
    ['invalid-hint', 'oneOf'],
    ['invalid-pointer', 'oneOf'],
    ['unreachable-node', 'unreachable nodes'],
    ['duplicate-row-keys', 'duplicate row key'],
    ['unregistered-action', 'not registered by the host'],
  ])('rejects %s before returning a runtime', async (name, expected) => {
    const kind = name === 'invalid-hint' ? 'form' : 'display'
    await expect(runGenerationExample('Generate a safe view', async () => fixture(name), {
      kind,
      contractSchema,
      maxRepairs: 0,
      allowedWidgets: [],
    })).rejects.toMatchObject({
      name: 'GenerationRejectedError',
      attempts: 1,
      diagnostics: expect.arrayContaining([expect.stringContaining(expected)]),
    })
  })

  it('rejects schemas that leave declared fields without a projected node', async () => {
    await expect(runGenerationExample('Generate a complete form', async () => fixture('unprojectable-form'), {
      kind: 'form',
      contractSchema,
      maxRepairs: 0,
    })).rejects.toMatchObject({
      name: 'GenerationRejectedError',
      diagnostics: expect.arrayContaining([expect.stringContaining('unresolved-projection-shape')]),
    })
  })

  it('rejects a form with no projected fields', async () => {
    await expect(runGenerationExample('Generate a form', async () => fixture('empty-form'), {
      kind: 'form',
      contractSchema,
      maxRepairs: 0,
    })).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([expect.stringContaining('no projected fields')]),
    })
  })

  it('rejects oneOf forms whose active branch cannot be selected from the initial data', async () => {
    const output = JSON.parse(fixture('unmatched-one-of')) as { schema: unknown }
    const adapter = await createJsonSchemaAdapter(output.schema)
    expect(adapter.project({}).diagnostics).toEqual([])

    await expect(runGenerationExample('Generate a branch form', async () => fixture('unmatched-one-of'), {
      kind: 'form',
      contractSchema,
      maxRepairs: 0,
    })).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([expect.stringContaining('cannot use oneOf or anyOf')]),
    })
  })

  it('requires an allowlisted widget and validates action arguments through the host registration', async () => {
    await expect(runGenerationExample('Generate a form', async () => fixture('form'), {
      kind: 'form',
      contractSchema,
      maxRepairs: 0,
    })).rejects.toMatchObject({ diagnostics: expect.arrayContaining([expect.stringContaining('host did not allow')]) })

    await expect(runGenerationExample('Generate a view', async () => fixture('action-args-without-validator'), {
      kind: 'display',
      contractSchema,
      maxRepairs: 0,
      actions: { refresh: async () => {} },
    })).rejects.toMatchObject({ diagnostics: expect.arrayContaining([expect.stringContaining('validateArgs')]) })
  })

  it('caps repair attempts at two and rejects oversized model output', async () => {
    await expect(runGenerationExample('Generate a form', async () => '', {
      kind: 'form',
      contractSchema,
      maxRepairs: 3,
    })).rejects.toThrow('maxRepairs must be an integer from 0 to 2')

    const generate = vi.fn(async () => '{')
    await expect(runGenerationExample('Generate a form', generate, {
      kind: 'form',
      contractSchema,
      maxRepairs: 2,
    })).rejects.toBeInstanceOf(GenerationRejectedError)
    expect(generate).toHaveBeenCalledTimes(3)
  })

  it('rejects model output that exceeds the response character limit', async () => {
    await expect(runGenerationExample('Generate a form', async () => ' '.repeat(262_145), {
      kind: 'form',
      contractSchema,
      maxRepairs: 0,
    })).rejects.toMatchObject({
      name: 'GenerationRejectedError',
      diagnostics: expect.arrayContaining([expect.stringContaining('262144 characters')]),
    })
  })

  it('preflights JSON depth and form schema complexity before validation and compilation', async () => {
    const nested = `${'['.repeat(65)}null${']'.repeat(65)}`
    await expect(runGenerationExample('Generate a form', async () => nested, {
      kind: 'form',
      contractSchema,
      maxRepairs: 0,
    })).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([expect.stringContaining('JSON depth limit of 64')]),
    })

    const properties = Object.fromEntries(Array.from({ length: 257 }, (_, index) => [`field${index}`, { type: 'string' }]))
    const tooComplex = JSON.stringify({
      format: 'texaryn-generation',
      version: 1,
      kind: 'form',
      schema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties },
    })
    await expect(runGenerationExample('Generate a form', async () => tooComplex, {
      kind: 'form',
      contractSchema,
      maxRepairs: 0,
    })).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([expect.stringContaining('256 properties')]),
    })

    const tooManyValues = `[${Array.from({ length: 100_000 }, () => '0').join(',')}]`
    await expect(runGenerationExample('Generate a form', async () => tooManyValues, {
      kind: 'form',
      contractSchema,
      maxRepairs: 0,
    })).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([expect.stringContaining('JSON value limit of 100000')]),
    })
  })

  it('requires an explicit host resource map for external schema references', async () => {
    await expect(runGenerationExample('Generate a form', async () => fixture('external-ref-form'), {
      kind: 'form',
      contractSchema,
      maxRepairs: 0,
    })).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([expect.stringContaining('not in the host resource map')]),
    })

    const uri = 'https://schemas.example.test/profile.json'
    const result = await runGenerationExample('Generate a form', async () => fixture('external-ref-form'), {
      kind: 'form',
      contractSchema,
      maxRepairs: 0,
      allowedWidgets: ['textarea'],
      resources: new Map([[uri, { $id: uri, type: 'string' }]]),
    })
    expect(result.kind).toBe('form')
    if (result.kind === 'form') result.runtime.destroy()
  })

  it('validates form schemas against their local dialect metaschema', async () => {
    for (const invalid of [
      { required: 'name' },
      { properties: { name: { type: 'string', minLength: -1 } } },
    ]) {
      await expect(runGenerationExample('Generate a valid form', async () => formOutput({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { name: { type: 'string' } },
        ...invalid,
      }), {
        kind: 'form',
        contractSchema,
        maxRepairs: 0,
        allowedWidgets: ['textarea'],
      })).rejects.toMatchObject({
        name: 'GenerationRejectedError',
        diagnostics: expect.arrayContaining([expect.stringContaining('contract check')]),
      })
    }
  })

  it('checks local and host resource references against the generation subset', async () => {
    const localUri = '#/hiddenSchema'
    await expect(runGenerationExample('Generate a simple form', async () => formOutput({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { name: { type: 'string' } },
      $ref: localUri,
      hiddenSchema: { oneOf: [{ type: 'object' }] },
    }), {
      kind: 'form',
      contractSchema,
      maxRepairs: 0,
      allowedWidgets: ['textarea'],
    })).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([expect.stringContaining('cannot use oneOf or anyOf')]),
    })

    const uri = 'https://schemas.example.test/profile.json'
    await expect(runGenerationExample('Generate a simple form', async () => formOutput({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      $ref: `${uri}#/$defs/hiddenSchema`,
    }), {
      kind: 'form',
      contractSchema,
      maxRepairs: 0,
      allowedWidgets: ['textarea'],
      resources: new Map([[uri, {
        $id: uri,
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $defs: { hiddenSchema: { oneOf: [{ type: 'object' }] } },
      }]]),
    })).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([expect.stringContaining('cannot use oneOf or anyOf')]),
    })
  })

  it('metaschema-validates reference targets hidden under unknown keywords', async () => {
    await expect(runGenerationExample('Generate a simple form', async () => formOutput({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { name: { type: 'string' } },
      $ref: '#/hiddenSchema',
      hiddenSchema: { type: 42 },
    }), {
      kind: 'form',
      contractSchema,
      maxRepairs: 0,
      allowedWidgets: ['textarea'],
    })).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([expect.stringContaining('contract check')]),
    })

    await expect(runGenerationExample('Generate a simple form', async () => formOutput({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: { name: { type: 'string' } },
      $ref: '#/$defs/bad',
      $defs: { bad: { type: 42 } },
    }), {
      kind: 'form',
      contractSchema,
      maxRepairs: 0,
      allowedWidgets: ['textarea'],
    })).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([expect.stringContaining('contract check')]),
    })

    const uri = 'https://schemas.example.test/profile.json'
    await expect(runGenerationExample('Generate a simple form', async () => formOutput({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { name: { type: 'string' } },
      $ref: `${uri}#/hiddenSchema`,
    }), {
      kind: 'form',
      contractSchema,
      maxRepairs: 0,
      allowedWidgets: ['textarea'],
      resources: new Map([[uri, {
        $id: uri,
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        hiddenSchema: { type: 42 },
      }]]),
    })).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([expect.stringContaining('contract check')]),
    })
  })
})

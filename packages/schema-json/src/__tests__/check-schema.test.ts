import { describe, it, expect } from 'vitest'
import { checkSchema } from '../index.js'
import { resolveUnescapedPath } from '../schema-issues.js'

const D2020 = 'https://json-schema.org/draft/2020-12/schema'

async function pointers(schema: unknown): Promise<string[]> {
  return (await checkSchema(schema)).map((issue) => issue.pointer).sort()
}

describe('checkSchema', () => {
  it('reports invalid keyword values with their pointers', async () => {
    expect(
      await pointers({
        $schema: D2020,
        type: 'object',
        properties: { name: { type: 'strin', minLength: '3' } },
        required: 'name',
      }),
    ).toEqual(['/properties/name/minLength', '/properties/name/type', '/required'])
  })

  it('checks inside 2020-12 keywords', async () => {
    expect(await pointers({ $schema: D2020, type: 'array', prefixItems: [{ type: 'strin' }] })).toEqual([
      '/prefixItems/0/type',
    ])
    expect(await pointers({ $schema: D2020, type: 'array', items: [{ type: 'string' }] })).toEqual(['/items'])
    expect(
      await pointers({ $schema: D2020, $defs: { a: { type: 'object', properties: { b: { minimum: 'x' } } } } }),
    ).toEqual(['/$defs/a/properties/b/minimum'])
  })

  it('escapes property names that contain / or ~', async () => {
    expect(
      await pointers({ $schema: D2020, type: 'object', properties: { 'a/b': { minLength: '3' }, 'c~d': { type: 'x' } } }),
    ).toEqual(['/properties/a~1b/minLength', '/properties/c~0d/type'])
  })

  it('accepts a valid schema and detects draft-07', async () => {
    expect(
      await checkSchema({
        $schema: D2020,
        type: 'object',
        properties: { tags: { type: 'array', prefixItems: [{ type: 'string' }] } },
        $defs: { x: { type: 'number' } },
        required: ['tags'],
      }),
    ).toEqual([])
    expect(
      await pointers({ $schema: 'http://json-schema.org/draft-07/schema#', properties: { a: { type: 'strin' } } }),
    ).toEqual(['/properties/a/type'])
  })

  it('gives the message without the location prefix', async () => {
    const [issue] = await checkSchema({ $schema: D2020, type: 'strin' })
    expect(issue.message).not.toMatch(/^Invalid schema found at/)
    expect(issue.message).toContain('strin')
  })

  it('rejects what createJsonSchemaAdapter rejects', async () => {
    await expect(
      checkSchema({ $schema: D2020, $defs: { a: { $ref: '#/$defs/a' } }, type: 'object', properties: { x: { $ref: '#/$defs/a' } } }),
    ).rejects.toThrow()
  })
})

describe('resolveUnescapedPath', () => {
  it('uses the only split that matches the document', () => {
    const document = { properties: { 'a/b': { minLength: 1 } } }
    expect(resolveUnescapedPath(document, '/properties/a/b/minLength')).toBe('/properties/a~1b/minLength')
  })

  it('stops at the shared prefix when two splits match', () => {
    const document = {
      properties: {
        'a/properties/b': { type: 'string' },
        a: { properties: { b: { type: 'strin' } } },
      },
    }
    expect(resolveUnescapedPath(document, '/properties/a/properties/b/type')).toBe('/properties')
  })

  it('handles names with ~ and names that look like indices', () => {
    expect(resolveUnescapedPath({ 'x~y': { 0: true } }, '/x~y/0')).toBe('/x~0y/0')
  })

  it('claims only the root when there are more readings than it examines', () => {
    // Each level holds `a` (one segment) and `a/a` (two), so the path `a`
    // repeated ten times has 89 readings, past the cap of 32.
    const levels: unknown[] = [{ end: true }, { a: { end: true } }]
    while (levels.length <= 10) levels.push({ a: levels.at(-1), 'a/a': levels.at(-2) })
    const path = `/${Array.from({ length: 10 }, () => 'a').join('/')}/end`
    expect(resolveUnescapedPath(levels.at(-1), path)).toBe('')
  })

  it('keeps an unknown path as it is', () => {
    expect(resolveUnescapedPath({}, '/missing/x')).toBe('/missing/x')
  })

  it('maps the root to the empty pointer', () => {
    expect(resolveUnescapedPath({}, '')).toBe('')
  })
})

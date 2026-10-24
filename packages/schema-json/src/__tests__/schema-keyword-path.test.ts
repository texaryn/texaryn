import { describe, expect, it } from 'vitest'
import type { SchemaNode } from '@texaryn/json-schema-library'
import { schemaKeywordPath } from '../adapter.js'

const root = (schema: unknown) => ({ schema }) as unknown as SchemaNode

describe('schemaKeywordPath', () => {
  it('returns undefined when the location has no fragment', () => {
    expect(schemaKeywordPath(root({}), 'https://example.test/schema')).toBeUndefined()
  })

  it.each(['https://example.test/schema#', 'https://example.test/schema#anchor'])(
    'returns an empty path for a non-pointer fragment in %s',
    (location) => {
      expect(schemaKeywordPath(root({}), location)).toEqual([])
    },
  )

  it.each([
    ['map children', { properties: { address: { type: 'object' } } }, '#/properties/address', ['properties']],
    [
      'array children',
      { allOf: [{ properties: { name: { type: 'string' } } }] },
      '#/allOf/0/properties/name',
      ['allOf', 'properties'],
    ],
    [
      'schema items',
      { items: { properties: { name: { type: 'string' } } } },
      '#/items/properties/name',
      ['items', 'properties'],
    ],
    ['tuple items', { items: [{ type: 'string' }] }, '#/items/0', ['prefixItems']],
    [
      'single schema keywords',
      { not: { properties: { name: { type: 'string' } } } },
      '#/not/properties/name',
      ['not', 'properties'],
    ],
  ] as const)('resolves %s', (_name, schema, location, expected) => {
    expect(schemaKeywordPath(root(schema), location)).toEqual(expected)
  })

  it.each([
    ['missing map member', { properties: {} }, '#/properties/missing'],
    ['map keyword without a member', { properties: {} }, '#/properties'],
    ['map keyword with an array value', { properties: [] }, '#/properties/name'],
    ['array keyword without an index', { allOf: [] }, '#/allOf'],
    ['array keyword with an invalid index', { allOf: [{}] }, '#/allOf/invalid'],
    ['array keyword with an out of range index', { allOf: [{}] }, '#/allOf/1'],
    ['array keyword with a non-array value', { allOf: {} }, '#/allOf/0'],
    ['tuple items with an invalid index', { items: [{}] }, '#/items/invalid'],
    ['missing items keyword', {}, '#/items'],
    ['missing single schema keyword', {}, '#/not'],
    ['unknown keyword', { custom: {} }, '#/custom'],
    ['primitive intermediate value', { properties: { name: 'string' } }, '#/properties/name/type'],
  ] as const)('returns undefined for %s', (_name, schema, location) => {
    expect(schemaKeywordPath(root(schema), location)).toBeUndefined()
  })
})

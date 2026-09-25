import { describe, it, expect } from 'vitest'
import { withoutUnreachableBranches } from '../normalize.js'

const S = { type: 'string' }
const dead = () => ({ type: 'object', then: S, else: S })
const removed = { type: 'object' }

describe('withoutUnreachableBranches', () => {
  it.each([
    ['a then without if', { type: 'object', then: S }, { type: 'object' }],
    ['an else without if', { type: 'object', else: S }, { type: 'object' }],
    ['a then under if: false', { if: false, then: S, else: S }, { if: false, else: S }],
    ['an else under if: true', { if: true, then: S, else: S }, { if: true, then: S }],
    ['boolean branches without if', { then: true, else: false }, {}],
  ])('removes %s', (_label, schema, expected) => {
    expect(withoutUnreachableBranches(schema)).toEqual(expected)
  })

  it('keeps both branches of a condition that can go either way', () => {
    const schema = { if: { required: ['a'] }, then: S, else: S }
    expect(withoutUnreachableBranches(schema)).toEqual(schema)
  })

  it('visits every schema-valued keyword of every dialect', () => {
    const schema = {
      properties: { p: dead() },
      patternProperties: { '^x': dead() },
      additionalProperties: dead(),
      propertyNames: dead(),
      unevaluatedProperties: dead(),
      dependentSchemas: { a: dead() },
      dependencies: { a: dead(), b: ['c'] },
      $defs: { d: dead() },
      definitions: { d: dead() },
      items: [dead()],
      prefixItems: [dead()],
      additionalItems: dead(),
      unevaluatedItems: dead(),
      contains: dead(),
      contentSchema: dead(),
      allOf: [dead()],
      anyOf: [dead()],
      oneOf: [dead()],
      not: dead(),
      if: dead(),
      then: dead(),
      else: dead(),
    }
    expect(withoutUnreachableBranches(schema)).toEqual({
      properties: { p: removed },
      patternProperties: { '^x': removed },
      additionalProperties: removed,
      propertyNames: removed,
      unevaluatedProperties: removed,
      dependentSchemas: { a: removed },
      dependencies: { a: removed, b: ['c'] },
      $defs: { d: removed },
      definitions: { d: removed },
      items: [removed],
      prefixItems: [removed],
      additionalItems: removed,
      unevaluatedItems: removed,
      contains: removed,
      contentSchema: removed,
      allOf: [removed],
      anyOf: [removed],
      oneOf: [removed],
      not: removed,
      if: removed,
      then: removed,
      else: removed,
    })
    expect(withoutUnreachableBranches({ items: dead() })).toEqual({ items: removed })
  })

  it('reads value keywords, unknown keywords and property names as values', () => {
    const value = { then: 1, else: { then: 2 } }
    const schema = {
      default: value,
      const: value,
      enum: [value],
      examples: [value],
      'x-extension': dead(),
      properties: { then: dead(), else: S },
      required: ['then'],
    }
    expect(withoutUnreachableBranches(schema)).toEqual({ ...schema, properties: { then: removed, else: S } })
  })

  it('does not change its argument and shares no object with it', () => {
    const schema = { properties: { p: dead() }, default: { a: [1] }, allOf: [{ else: S }] }
    const before = structuredClone(schema)
    const result = withoutUnreachableBranches(schema) as typeof schema
    expect(schema).toEqual(before)
    expect(result.default).not.toBe(schema.default)
    expect(result.default.a).not.toBe(schema.default.a)
    expect(result.properties.p).not.toBe(schema.properties.p)
    expect(withoutUnreachableBranches(true)).toBe(true)
  })

  it('removes a branch at one position and keeps it at another when the source object is shared', () => {
    const shared = dead()
    const result = withoutUnreachableBranches({
      properties: { a: shared, b: shared, r: { $ref: '#/properties/b/then' } },
    })
    expect(result).toEqual({
      properties: { a: removed, b: { type: 'object', then: S }, r: { $ref: '#/properties/b/then' } },
    })
  })

  describe('a branch a reference reaches', () => {
    const p = { type: 'object', then: { properties: { q: S } } }
    it.each([
      ['the branch', { $ref: '#/properties/p/then' }],
      ['a member of the branch', { $ref: '#/properties/p/then/properties/q' }],
      ['the branch through a percent-encoded pointer', { $ref: '#/%70roperties/p/then' }],
      ['the branch through $dynamicRef', { $dynamicRef: '#/properties/p/then' }],
      ['the branch from inside a value keyword', { default: { $ref: '#/properties/p/then' } }],
    ])('keeps it when the reference points at %s', (_label, site) => {
      const schema = { properties: { p, r: site } }
      expect(withoutUnreachableBranches(schema)).toEqual(schema)
    })

    it('matches a key that needs escaping', () => {
      const schema = { properties: { 'a/b~c': p, r: { $ref: '#/properties/a~1b~0c/then' } } }
      expect(withoutUnreachableBranches(schema)).toEqual(schema)
    })

    it.each([
      ['the schema that holds the branch', '#/properties/p'],
      ['a sibling whose name extends the branch keyword', '#/properties/p/thenx'],
      ['another document', 'other.json'],
    ])('still removes it when the reference points at %s', (_label, $ref) => {
      const schema = { properties: { p: { ...p, thenx: S }, r: { $ref } } }
      expect(withoutUnreachableBranches(schema)).toEqual({ properties: { p: { type: 'object', thenx: S }, r: { $ref } } })
    })

    it('keeps it when a reference into an embedded resource points at it', () => {
      const schema = { $defs: { node: { $id: 'https://x.test/node', ...p } }, properties: { r: { $ref: 'https://x.test/node#/then' } } }
      expect(withoutUnreachableBranches(schema)).toEqual(schema)
    })

    it.each([
      ['$anchor', { $anchor: 'a' }],
      ['$dynamicAnchor', { $dynamicAnchor: 'a' }],
      ['$id', { $id: 'https://x.test/a' }],
    ])('keeps it when it declares %s', (_label, identifier) => {
      const schema = { properties: { p: { type: 'object', then: { properties: { q: { ...S, ...identifier } } } } } }
      expect(withoutUnreachableBranches(schema)).toEqual(schema)
    })
  })
})

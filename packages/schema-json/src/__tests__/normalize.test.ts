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
    ['if: false with the then it removes', { type: 'object', if: false, then: S }, { type: 'object' }],
    ['if: true with the else it removes', { type: 'object', if: true, else: S }, { type: 'object' }],
  ])('removes %s', (_label, schema, expected) => {
    expect(withoutUnreachableBranches(schema)).toEqual(expected)
  })

  it('keeps an if beside no branch it removed', () => {
    for (const schema of [{ if: false }, { if: true }, { if: false, then: S, properties: { r: { $ref: '#/then' } } }]) {
      expect(withoutUnreachableBranches(schema)).toEqual(schema)
    }
  })

  it('keeps an if a reference reaches, without the branch it removed', () => {
    const schema = { properties: { p: { if: false, then: S }, r: { $ref: '#/properties/p/if' } } }
    expect(withoutUnreachableBranches(schema)).toEqual({ properties: { p: { if: false }, r: { $ref: '#/properties/p/if' } } })
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
      ['the branch with a trailing #', { $ref: '#/properties/p/then#' }],
      ['the branch with two trailing #', { $ref: '#/properties/p/then##' }],
      ['the branch without a leading slash', { $ref: '#properties/p/then' }],
      ['the branch without a #', { $ref: '/properties/p/then' }],
      ['the branch after the last #', { $ref: '#/x#/properties/p/then' }],
    ])('keeps it when the reference points at %s', (_label, site) => {
      const schema = { properties: { p, r: site } }
      expect(withoutUnreachableBranches(schema)).toEqual(schema)
    })

    it('matches a key that needs escaping', () => {
      const schema = { properties: { 'a/b~c': p, r: { $ref: '#/properties/a~1b~0c/then' } } }
      expect(withoutUnreachableBranches(schema)).toEqual(schema)
    })

    it.each([
      ['application/json', '#/properties/application/json/then'],
      ['a%20b', '#/properties/a%20b/then'],
    ])('keeps it when the reference spells the key %s unescaped', (key, $ref) => {
      const schema = { properties: { [key]: p, r: { $ref } } }
      expect(withoutUnreachableBranches(schema)).toEqual(schema)
    })

    it.each([
      ['definitions', '$defs'],
      ['$defs', 'definitions'],
    ])('keeps it when the reference spells %s for a branch under %s', (spelled, declared) => {
      const schema = { $id: 'https://x.test/root', [declared]: { foo: p }, properties: { r: { $ref: `#/${spelled}/foo/then` } } }
      expect(withoutUnreachableBranches(schema)).toEqual(schema)
    })

    it.each([
      ['prefixItems', { type: 'array', items: [p] }, '#/properties/a/prefixItems/0/then'],
      ['items for additionalItems', { type: 'array', items: [{}], additionalItems: p }, '#/properties/a/items/then'],
      ['dependentSchemas', { type: 'object', dependencies: { w: p } }, '#/properties/a/dependentSchemas/w/then'],
    ])('keeps it when the reference names the compiled field %s under a root $id', (_label, holder, $ref) => {
      const schema = { $id: 'https://x.test/root', properties: { a: holder, r: { $ref } } }
      expect(withoutUnreachableBranches(schema)).toEqual(schema)
    })

    it.each([
      [
        'an escaped $defs name and a raw property name',
        { $defs: { 'a/b': { type: 'object', properties: { 'c/d': p } } }, properties: { r: { $ref: '#/$defs/a~1b/properties/c/d/then' } } },
      ],
      [
        'an encoded $defs name and a raw percent property name',
        { $defs: { 'a b': { type: 'object', properties: { 'c%20d': p } } }, properties: { r: { $ref: '#/$defs/a%20b/properties/c%20d/then' } } },
      ],
      [
        '%2F in one segment and ~1 in another',
        { properties: { 'a/b': { type: 'object', properties: { 'c/d': p } }, r: { $ref: '#/properties/a%2Fb/properties/c~1d/then' } } },
      ],
    ])('keeps it when the reference mixes spellings: %s', (_label, schema) => {
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

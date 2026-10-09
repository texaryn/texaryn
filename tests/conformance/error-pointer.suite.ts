import { describe, it, expect } from 'vitest'
import type { SchemaEvaluationPort, JsonPointer } from '@texaryn/core'

type AdapterFactory = (schema: Record<string, unknown>) => Promise<SchemaEvaluationPort>

const DIALECTS = {
  'draft-07': 'http://json-schema.org/draft-07/schema#',
  '2019-09': 'https://json-schema.org/draft/2019-09/schema',
  '2020-12': 'https://json-schema.org/draft/2020-12/schema',
}

const string = { type: 'string' }
const number = { type: 'number' }
const object = (properties: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  type: 'object',
  properties,
  ...extra,
})

interface Row {
  name: string
  dialects?: string[]
  schema: Record<string, unknown>
  data: unknown
  pointers: string[]
  projected?: boolean
  keywords?: string[]
}

const rows: Row[] = [
  { name: 'a required key with a slash', schema: object({ 'a/b': string }, { required: ['a/b'] }), data: {}, pointers: ['/a~1b'] },
  { name: 'a required key with a tilde', schema: object({ 'a~b': string }, { required: ['a~b'] }), data: {}, pointers: ['/a~0b'] },
  { name: 'a type error under a key with a slash', schema: object({ 'a/b': string }), data: { 'a/b': 1 }, pointers: ['/a~1b'], projected: true },
  { name: 'a type error under a key with a tilde', schema: object({ 'a~b': string }), data: { 'a~b': 1 }, pointers: ['/a~0b'], projected: true },
  { name: 'a key that spells an escape', schema: object({ 'a~1b': string }), data: { 'a~1b': 1 }, pointers: ['/a~01b'], projected: true },
  {
    name: 'nested keys that read the same when unescaped',
    schema: object({ 'a/b': object({ c: number }), a: object({ 'b/c': number }) }),
    data: { 'a/b': { c: 'x' }, a: { 'b/c': 'y' } },
    pointers: ['/a/b~1c', '/a~1b/c'],
    projected: true,
  },
  { name: 'a key with several slashes', schema: object({ 'application/vnd.api/json': string }), data: { 'application/vnd.api/json': 1 }, pointers: ['/application~1vnd.api~1json'], projected: true },
  { name: 'a required key under a key with a slash', schema: object({ 'a/b': object({ c: string }, { required: ['c'] }) }), data: { 'a/b': {} }, pointers: ['/a~1b/c'] },
  { name: 'an object with slash keys inside an array', schema: { type: 'array', items: object({ 'a/b': string }) }, data: [{ 'a/b': 1 }], pointers: ['/0/a~1b'], projected: true },
  { name: 'a required empty key', schema: object({ '': string }, { required: [''] }), data: {}, pointers: ['/'] },
  { name: 'an empty key', schema: object({ '': string }), data: { '': 1 }, pointers: ['/'], projected: true },
  { name: 'a space and a percent sign', schema: object({ 'a b': string, '50%': string }), data: { 'a b': 1, '50%': 2 }, pointers: ['/50%', '/a b'], projected: true },
  { name: 'a forbidden additional property under a colliding key', schema: object({ a: {} }, { additionalProperties: false }), data: { a: { b: 1 }, 'a/b': 1 }, pointers: ['/a~1b'] },
  { name: 'equal values under keys that read the same', schema: object({ 'a/b': object({ c: number }), a: object({ 'b/c': number }) }), data: { 'a/b': { c: 'x' }, a: { 'b/c': 'x' } }, pointers: ['/a/b~1c', '/a~1b/c'] },
  { name: 'a one-of error under a colliding key', schema: object({ 'a/b': { oneOf: [string, { type: 'boolean' }] }, a: object({ b: string }) }), data: { 'a/b': 1, a: { b: 'ok' } }, pointers: ['/a~1b'] },
  { name: 'an additional item under a colliding key', dialects: ['draft-07', '2019-09'], schema: object({ 'a/b': { items: [{}], additionalItems: false } }), data: { 'a/b': [1, 2], a: { b: [3, 4] } }, pointers: ['/a~1b/1'] },
  { name: 'an unevaluated property under a colliding key', dialects: ['2019-09', '2020-12'], schema: object({ a: {} }, { unevaluatedProperties: false }), data: { a: { b: 2 }, 'a/b': 1 }, pointers: ['/a~1b'] },
  { name: 'an unevaluated item under a colliding key', dialects: ['2019-09', '2020-12'], schema: object({ 'a/b': { unevaluatedItems: false } }), data: { 'a/b': [1], a: { b: [2] } }, pointers: ['/a~1b/0'] },
  { name: 'a pattern property with a slash', schema: { type: 'object', patternProperties: { '^p/': string } }, data: { 'p/q': 1 }, pointers: ['/p~1q'] },
  { name: 'an additional property schema with a slash key', schema: object({}, { additionalProperties: string }), data: { 'x/y': 1 }, pointers: ['/x~1y'] },
  { name: 'a forbidden additional property with a slash', schema: object({ a: string }, { additionalProperties: false }), data: { 'x/y': 1 }, pointers: ['/x~1y'] },
  {
    name: 'a required annotation under a namespaced key',
    schema: object({
      metadata: object({ annotations: object({ 'backstage.io/techdocs-ref': string }, { required: ['backstage.io/techdocs-ref'] }) }),
    }),
    data: { metadata: { annotations: {} } },
    pointers: ['/metadata/annotations/backstage.io~1techdocs-ref'],
  },
  {
    name: 'a property name constraint points to its containing object',
    schema: { propertyNames: { maxLength: 2 } },
    data: { abc: 1 },
    pointers: [''],
    keywords: ['propertyNames'],
  },
  {
    name: 'a nested property name constraint points to its containing object',
    schema: { properties: { profile: { propertyNames: { maxLength: 2 } } } },
    data: { profile: { abc: 1 } },
    pointers: ['/profile'],
    keywords: ['propertyNames'],
  },
  {
    name: 'a hash in the containing property name is decoded',
    schema: object({ 'a#b': { propertyNames: { maxLength: 2 } } }),
    data: { 'a#b': { abc: 1 } },
    pointers: ['/a#b'],
    keywords: ['propertyNames'],
  },
  {
    name: 'a star in a data key is not a propertyNames marker',
    schema: object({ propertyNames: { properties: { '*': string } } }),
    data: { propertyNames: { '*': 1 } },
    pointers: ['/propertyNames/*'],
    keywords: ['type'],
    projected: true,
  },
  {
    name: 'an asterisk in a data key remains part of the instance pointer',
    schema: { properties: { '*': { properties: { value: { type: 'string' } } } } },
    data: { '*': { value: 1 } },
    pointers: ['/*/value'],
    keywords: ['type'],
  },
  {
    name: 'items false after prefix items points to the array',
    dialects: ['2020-12'],
    schema: { properties: { k: { type: 'array', prefixItems: [{}], items: false } } },
    data: { k: [1, 2] },
    pointers: ['/k'],
    keywords: ['type'],
  },
  {
    name: 'items and prefixItems property names stay ordinary properties',
    dialects: ['2020-12'],
    schema: { properties: { items: false, prefixItems: { type: 'string' } } },
    data: { items: 123 },
    pointers: ['/items'],
  },
]

export function errorPointerConformanceSuite(name: string, create: AdapterFactory): void {
  describe(`error pointers: ${name}`, () => {
    for (const [dialect, $schema] of Object.entries(DIALECTS)) {
      describe(dialect, () => {
        const applicable = rows.filter((row) => row.dialects === undefined || row.dialects.includes(dialect))
        it.each(applicable)('reports $name as an RFC 6901 pointer', async ({ schema, data, pointers, projected, keywords }) => {
          const adapter = await create({ $schema, ...schema })
          const result = await adapter.validate(data)
          const reported = [...new Set(result.errors.map((error) => error.instancePointer as string))].sort()
          expect(reported).toEqual([...new Set(pointers)].sort())
          if (keywords !== undefined) {
            expect([...new Set(result.errors.map((error) => error.keyword))].sort()).toEqual([...new Set(keywords)].sort())
          }
          if (projected) {
            const nodes = adapter.project(data).nodes
            for (const pointer of reported) expect(nodes.has(pointer as JsonPointer)).toBe(true)
          }
        })
      })
    }
  })
}

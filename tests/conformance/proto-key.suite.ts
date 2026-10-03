import { describe, it, expect } from 'vitest'
import type { SchemaEvaluationPort } from '@texaryn/core'

type AdapterFactory = (schema: Record<string, unknown>) => Promise<SchemaEvaluationPort>

const DIALECTS = {
  'draft-07': 'http://json-schema.org/draft-07/schema#',
  '2019-09': 'https://json-schema.org/draft/2019-09/schema',
  '2020-12': 'https://json-schema.org/draft/2020-12/schema',
}

const string = { type: 'string' }
const object = (properties: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  type: 'object',
  properties,
  ...extra,
})
const json = (text: string): unknown => JSON.parse(text)

interface Row {
  name: string
  dialects?: string[]
  schema: Record<string, unknown>
  data: unknown
  pointers: string[]
}

const rows: Row[] = [
  { name: 'an undeclared key', schema: object({ a: string }), data: json('{"__proto__":{"x":1}}'), pointers: [] },
  { name: 'an undeclared key beside a declared one', schema: object({ a: string }), data: json('{"a":"s","__proto__":5}'), pointers: [] },
  { name: 'an undeclared key with additional properties forbidden', schema: object({ a: string }, { additionalProperties: false }), data: json('{"__proto__":{"x":1}}'), pointers: ['/__proto__'] },
  { name: 'a nested undeclared key', schema: object({ n: object({ a: string }) }), data: json('{"n":{"__proto__":{}}}'), pointers: [] },
  { name: 'an undeclared key inside an array', schema: { type: 'array', items: object({ a: string }) }, data: json('[{"__proto__":{}}]'), pointers: [] },
  { name: 'an undeclared key under oneOf', schema: { oneOf: [object({ a: string }), string] }, data: json('{"__proto__":{"x":1}}'), pointers: [] },
  { name: 'an undeclared key under if and then', schema: { if: object({ a: { const: 'x' } }), then: object({ b: string }) }, data: json('{"__proto__":{"x":1}}'), pointers: [] },
  { name: 'a declared key that is violated', schema: object(json('{"__proto__":{"type":"number"}}') as Record<string, unknown>), data: json('{"__proto__":"x"}'), pointers: ['/__proto__'] },
  { name: 'a declared key that is satisfied', schema: object(json('{"__proto__":{"type":"number"}}') as Record<string, unknown>), data: json('{"__proto__":5}'), pointers: [] },
  { name: 'an undeclared constructor key with additional properties forbidden', schema: object({ a: string }, { additionalProperties: false }), data: json('{"constructor":1}'), pointers: ['/constructor'] },
  { name: 'an undeclared toString key', schema: object({ a: string }), data: json('{"toString":1}'), pointers: [] },
  { name: 'a declared constructor key that is violated', schema: object({ constructor: { type: 'number' } }), data: json('{"constructor":"x"}'), pointers: ['/constructor'] },
  { name: 'a required key that names a prototype member', schema: { type: 'object', required: ['toString'] }, data: {}, pointers: ['/toString'] },
  { name: 'a nested undeclared hasOwnProperty key', schema: object({ n: object({ a: string }, { additionalProperties: false }) }), data: json('{"n":{"hasOwnProperty":1}}'), pointers: ['/n/hasOwnProperty'] },
  { name: 'a key triggering a dependent schema', dialects: ['2019-09', '2020-12'], schema: { dependentSchemas: json('{"__proto__":{"required":["x"]}}') }, data: json('{"__proto__":1}'), pointers: ['/x'] },
  { name: 'an undeclared key under a dependent schema', dialects: ['2019-09', '2020-12'], schema: { dependentSchemas: { a: { required: ['b'] } } }, data: json('{"__proto__":1}'), pointers: [] },
  { name: 'an undeclared key under dependencies', dialects: ['draft-07'], schema: { dependencies: { a: ['b'] } }, data: json('{"__proto__":1}'), pointers: [] },
]

export function protoKeyConformanceSuite(name: string, create: AdapterFactory): void {
  describe(`data keys named like Object.prototype members: ${name}`, () => {
    for (const [dialect, $schema] of Object.entries(DIALECTS)) {
      describe(dialect, () => {
        const applicable = rows.filter((row) => row.dialects === undefined || row.dialects.includes(dialect))
        it.each(applicable)('validates $name', async ({ schema, data, pointers }) => {
          const adapter = await create({ $schema, ...schema })
          const result = await adapter.validate(data)
          expect([...new Set(result.errors.map((error) => error.instancePointer as string))].sort()).toEqual([...pointers].sort())
        })
        it.each(applicable)('projects $name', async ({ schema, data }) => {
          const adapter = await create({ $schema, ...schema })
          expect(() => adapter.project(data)).not.toThrow()
        })
      })
    }
  })
}

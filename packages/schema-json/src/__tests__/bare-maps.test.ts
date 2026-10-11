import { describe, it, expect } from 'vitest'
import { compileSchema, type JsonSchema } from '@texaryn/json-schema-library'
import { DRAFTS } from '../bare-maps.js'

const compile = (schema: object, draft = 'draft-2020-12') =>
  compileSchema(schema as JsonSchema, { drafts: DRAFTS, draft })

describe('drafts with bare maps', () => {
  it('give the compiled property map no prototype', () => {
    const root = compile({ type: 'object', properties: { a: { type: 'string' } } })
    expect(Object.getPrototypeOf(root.properties)).toBeNull()
    expect(root.properties?.['__proto__']).toBeUndefined()
    expect(root.properties?.['constructor']).toBeUndefined()
    expect(Object.keys(root.properties ?? {})).toEqual(['a'])
  })

  it('keep a declared __proto__ property', () => {
    const root = compile({ type: 'object', properties: JSON.parse('{"__proto__":{"type":"number"}}') })
    expect(root.properties?.['__proto__']).toBeDefined()
    expect(root.validate(JSON.parse('{"__proto__":"x"}')).valid).toBe(false)
    expect(root.validate(JSON.parse('{"__proto__":5}')).valid).toBe(true)
  })

  it('give the dependent maps no prototype', () => {
    const modern = compile({ dependentSchemas: { a: { required: ['b'] } }, dependentRequired: { c: ['d'] } })
    expect(Object.getPrototypeOf(modern.dependentSchemas)).toBeNull()
    expect(Object.getPrototypeOf(modern.dependentRequired)).toBeNull()
    const legacy = compile({ dependencies: { a: { required: ['b'] }, c: ['d'] } }, 'draft-07')
    expect(Object.getPrototypeOf(legacy.dependentSchemas)).toBeNull()
    expect(Object.getPrototypeOf(legacy.dependentRequired)).toBeNull()
  })

  it('leave a schema without these keywords untouched', () => {
    const root = compile({ type: 'string', minLength: 2 })
    expect(root.validate('a').valid).toBe(false)
    expect(root.validate('ab').valid).toBe(true)
  })
})

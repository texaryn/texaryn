import { describe, expect, it } from 'vitest'
import type { FieldNode } from '@texaryn/core'
import { displayValue, fieldKind, sameEnumValue } from '../src/lib/field.js'

function field(overrides: Partial<FieldNode> = {}): FieldNode {
  return {
    id: 'field',
    type: 'field',
    parentId: null,
    dataPointer: '/field',
    order: 0,
    visible: true,
    disabled: false,
    readOnly: false,
    annotations: {},
    fieldType: 'string',
    constraints: {},
    ...overrides,
  }
}

describe('Svelte field helpers', () => {
  it('classifies primitive and enum fields', () => {
    expect(fieldKind(undefined)).toBe('string')
    expect(fieldKind(field({ enumValues: [{ value: 'x' }] }))).toBe('enum')
    expect(fieldKind(field({ fieldType: 'boolean' }))).toBe('boolean')
    expect(fieldKind(field({ fieldType: 'number' }))).toBe('number')
    expect(fieldKind(field({ fieldType: 'integer' }))).toBe('number')
    expect(fieldKind(field({ enumValues: [] }))).toBe('string')
    expect(fieldKind(field())).toBe('string')
  })

  it('formats values for text and numeric controls', () => {
    expect(displayValue('number', 0)).toBe(0)
    expect(displayValue('number', '12')).toBe('12')
    expect(displayValue('string', 'Ada')).toBe('Ada')
    expect(displayValue('boolean', false)).toBe('false')
    expect(displayValue('string', undefined)).toBe('')
    expect(displayValue('string', null)).toBe('')
  })

  it('compares JSON enum values recursively without conflating types', () => {
    expect(sameEnumValue(1, 1)).toBe(true)
    expect(sameEnumValue(1, '1')).toBe(false)
    expect(sameEnumValue(null, null)).toBe(true)
    expect(sameEnumValue([1, { label: 'A' }], [1, { label: 'A' }])).toBe(true)
    expect(sameEnumValue([1], [1, 2])).toBe(false)
    expect(sameEnumValue({ b: 2, a: 1 }, { a: 1, b: 2 })).toBe(true)
    expect(sameEnumValue({ a: 1 }, { a: '1' })).toBe(false)
    expect(sameEnumValue({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(sameEnumValue({ a: 1 }, null)).toBe(false)
  })
})

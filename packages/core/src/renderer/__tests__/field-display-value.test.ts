import { describe, expect, it } from 'vitest'
import { formatFieldDisplayValue } from '../field-display-value.js'

describe('formatFieldDisplayValue', () => {
  it('formats primitive and missing values', () => {
    const callable = () => 1
    expect(formatFieldDisplayValue(undefined)).toBe('')
    expect(formatFieldDisplayValue(null)).toBe('')
    expect(formatFieldDisplayValue('text')).toBe('text')
    expect(formatFieldDisplayValue(12)).toBe('12')
    expect(formatFieldDisplayValue(false)).toBe('false')
    expect(formatFieldDisplayValue(4n)).toBe('4')
    expect(formatFieldDisplayValue(Symbol('value'))).toBe('Symbol(value)')
    expect(formatFieldDisplayValue(callable)).toBe(callable.toString())
  })

  it('serializes object and array values as JSON', () => {
    expect(formatFieldDisplayValue({ name: 'Ada' })).toBe('{"name":"Ada"}')
    expect(formatFieldDisplayValue([1, 'two'])).toBe('[1,"two"]')
  })

  it('returns empty text when JSON serialization returns undefined', () => {
    expect(formatFieldDisplayValue({ toJSON: () => undefined })).toBe('')
  })

  it('uses a stable fallback when JSON serialization throws', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(formatFieldDisplayValue(circular)).toBe('[unserializable value]')
  })
})

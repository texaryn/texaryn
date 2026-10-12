import { describe, expect, it } from 'vitest'
import { validationParameters } from '../validation-parameters.js'

describe('JSON Schema validation parameter normalization', () => {
  it('normalizes required and format diagnostics with safe fallbacks', () => {
    expect(validationParameters('required', { key: 'email' }, 'required-property-error'))
      .toEqual({ missingProperty: 'email' })
    expect(validationParameters('required', { key: 3 }, 'required-property-error')).toEqual({})
    expect(validationParameters('format', { format: 'email' }, 'format-error')).toEqual({ format: 'email' })
    expect(validationParameters('format', {}, 'format-uri-warning')).toEqual({ format: 'uri' })
    expect(validationParameters('format', {}, 'format--error')).toEqual({})
    expect(validationParameters('format', {}, 'unknown-error')).toEqual({})
  })

  it('only emits finite numeric limits for known keywords', () => {
    expect(validationParameters('minLength', { minLength: 3 }, 'min-length-error')).toEqual({ limit: 3 })
    expect(validationParameters('minLength', { minLength: Number.POSITIVE_INFINITY }, 'min-length-error')).toEqual({})
    expect(validationParameters('futureKeyword', { limit: 3 }, 'future-keyword-error')).toEqual({})
  })
})

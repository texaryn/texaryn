import { describe, expect, it } from 'vitest'
import { validationParameters } from '../validation-parameters.js'

describe('Zod validation parameter normalization', () => {
  it('normalizes formats and numeric constraints with safe fallbacks', () => {
    expect(validationParameters('format', { format: 'email' })).toEqual({ format: 'email' })
    expect(validationParameters('format', {})).toEqual({})
    expect(validationParameters('minLength', { minimum: 3 })).toEqual({ limit: 3 })
    expect(validationParameters('minLength', { minimum: Number.NaN })).toEqual({})
    expect(validationParameters('maxLength', { maximum: Number.POSITIVE_INFINITY })).toEqual({})
    expect(validationParameters('multipleOf', { divisor: 0.5 })).toEqual({ limit: 0.5 })
    expect(validationParameters('multipleOf', { divisor: '0.5' })).toEqual({})
    expect(validationParameters('futureKeyword', { minimum: 3 })).toEqual({})
  })
})

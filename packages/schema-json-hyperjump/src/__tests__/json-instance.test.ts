import { describe, it, expect } from 'vitest'
import { toJsonInstance } from '../json-instance.js'

describe('toJsonInstance', () => {
  it('drops a property holding undefined', () => {
    expect(toJsonInstance({ a: undefined, b: 1 })).toEqual({ b: 1 })
  })

  it('keeps a property holding null', () => {
    expect(toJsonInstance({ a: null })).toEqual({ a: null })
  })

  // Dropping the element instead would renumber everything after it, which
  // changes which schema applies under `prefixItems` and which pointer names
  // which row. `null` is also what the payload will carry.
  it('maps an undefined array element to null rather than dropping it', () => {
    expect(toJsonInstance(['a', undefined, 'c'])).toEqual(['a', null, 'c'])
  })

  it('converts at any depth, through both container kinds', () => {
    expect(toJsonInstance({ rows: [{ a: undefined, b: 2 }] })).toEqual({ rows: [{ b: 2 }] })
  })

  it('passes scalars and null through', () => {
    expect(toJsonInstance(null)).toBe(null)
    expect(toJsonInstance(3)).toBe(3)
    expect(toJsonInstance('x')).toBe('x')
    expect(toJsonInstance(undefined)).toBe(undefined)
  })

  /**
   * The copy is shallow where it can be, so validating an unchanged document
   * costs what it did before this conversion existed. Asserted by identity
   * rather than by equality, because equality would pass either way and the
   * claim is in the docstring.
   */
  it('returns the same object when there is nothing to convert', () => {
    const clean = { a: 1, rows: [{ b: 2 }], nothing: null }
    expect(toJsonInstance(clean)).toBe(clean)
    expect(toJsonInstance(clean.rows)).toBe(clean.rows)
  })

  it('copies only the branch that changed', () => {
    const untouched = { b: 2 }
    const value = { rows: [{ a: undefined }], other: untouched }
    const converted = toJsonInstance(value) as { other: unknown }
    expect(converted).not.toBe(value)
    expect(converted.other).toBe(untouched)
  })
})

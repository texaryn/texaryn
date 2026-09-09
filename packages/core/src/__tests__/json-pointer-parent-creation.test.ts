import { describe, it, expect } from 'vitest'
import { setAtPointer } from '../json-pointer.js'
import type { JsonPointer } from '../types.js'

/**
 * How far `setAtPointer` will create missing parents, which is one level.
 *
 * The two throwing cases are a defect rather than a decision, tracked as #129:
 * a `SetValue` on a field two levels below an absent parent, which a form with
 * `initialData: {}` and a nested object produces, raises a `TypeError` out of
 * the command handler. They are pinned so the fix has to come back here and say
 * so.
 */
describe('setAtPointer with missing parents', () => {
  it('creates one missing level', () => {
    expect(setAtPointer({}, '/a/b' as JsonPointer, 1)).toEqual({ a: { b: 1 } })
  })

  it('throws on two missing levels', () => {
    expect(() => setAtPointer({}, '/a/b/c' as JsonPointer, 1)).toThrow(TypeError)
  })

  it('also throws when the array index is the missing level', () => {
    expect(() => setAtPointer({}, '/rows/0/name' as JsonPointer, 'x')).toThrow(TypeError)
  })
})

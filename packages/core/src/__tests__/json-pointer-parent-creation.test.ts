import { describe, it, expect } from 'vitest'
import { setAtPointer } from '../json-pointer.js'
import type { JsonPointer } from '../types.js'

const at = (s: string) => s as JsonPointer

/**
 * How far `setAtPointer` creates missing parents, which is now all the way.
 *
 * It used to create exactly one level and raise a `TypeError` on two, because
 * `setRecursive` read the child before recursing and the read of a missing
 * level threw. The last segment happened to tolerate absence, since
 * `{ ...undefined }` is `{}`, which is why one level worked and two did not. A
 * form built with `initialData: {}` over a schema nested two levels deep threw
 * out of `dispatch` on the first keystroke in that field, and `dispatch`
 * returns `void` from an event handler, so the exception landed in the host's
 * render. That was #129.
 *
 * The decision this file previously deferred is the container kind. A missing
 * level whose key is an array index would have to become `[]`, and a JSON
 * Pointer cannot say whether `/rows/0` means an array or an object keyed
 * `"0"`. Rather than guess, that case refuses. It is unreachable through the
 * runtime: every array command writes the whole array at the container's own
 * pointer, and the compiler mints item nodes only from rows already present in
 * the data, so the level above an index is never the missing one. What is left
 * is a host calling the exported helper directly, where either guess would
 * silently produce a shape the schema may not describe.
 */
describe('setAtPointer with missing parents', () => {
  it('creates one missing level', () => {
    expect(setAtPointer({}, at('/a/b'), 1)).toEqual({ a: { b: 1 } })
  })

  it('creates two missing levels', () => {
    expect(setAtPointer({}, at('/a/b/c'), 1)).toEqual({ a: { b: { c: 1 } } })
  })

  it('creates as many levels as the pointer has', () => {
    expect(setAtPointer({}, at('/a/b/c/d'), 1)).toEqual({ a: { b: { c: { d: 1 } } } })
  })

  it('creates the missing levels below a level that exists', () => {
    expect(setAtPointer({ owner: { name: 'x' } }, at('/owner/address/city'), 'Lyon')).toEqual({
      owner: { name: 'x', address: { city: 'Lyon' } },
    })
  })

  it('creates through a null level, as it does through an absent one', () => {
    expect(setAtPointer({ owner: null }, at('/owner/address/city'), 'Lyon')).toEqual({
      owner: { address: { city: 'Lyon' } },
    })
  })

  /**
   * The refusal names the segment, so a caller can tell it from the scalar
   * refusal #124 introduced in the same function.
   */
  it('refuses when the missing level would have to be an array', () => {
    expect(() => setAtPointer({}, at('/rows/0/name'), 'x')).toThrow(/cannot tell/)
    expect(() => setAtPointer({}, at('/rows/0/name'), 'x')).toThrow(/"0"/)
  })

  it('refuses the same way when the index is the last segment', () => {
    expect(() => setAtPointer({}, at('/rows/0'), 'x')).toThrow(/cannot tell/)
  })

  it('writes into an array that is already there', () => {
    expect(setAtPointer({ rows: [] }, at('/rows/0'), 'x')).toEqual({ rows: ['x'] })
    expect(setAtPointer({ rows: [{}] }, at('/rows/0/name'), 'x')).toEqual({
      rows: [{ name: 'x' }],
    })
  })

  /**
   * A key that merely contains digits is not an index. The predicate is the
   * canonical form, so `01` and `1x` are ordinary object keys and creating an
   * object for them is not a guess.
   */
  it.each([['01'], ['1x'], ['-1'], ['1.0']])(
    'treats %s as an ordinary key rather than an index',
    (segment) => {
      expect(setAtPointer({}, at(`/a/${segment}/b`), 1)).toEqual({ a: { [segment]: { b: 1 } } })
    },
  )

  /**
   * The pointer in the message has to address the location it names.
   * `parsePointer` unescapes, so rebuilding from its output without re-escaping
   * printed `/a/b` for the single key `a/b`, and a caller copying that pointer
   * out of the message would have addressed somewhere else. The write itself
   * was always correct; only the message lied.
   */
  it('re-escapes the segments it names in a refusal', () => {
    expect(() => setAtPointer({ 'a/b': 'plain' }, at('/a~1b/inner'), 'x')).toThrow(
      /the value at "\/a~1b"/,
    )
    expect(() => setAtPointer({}, at('/a~1b/0'), 'x')).toThrow(/the value at "\/a~1b"/)
    expect(() => setAtPointer({ 'c~d': 'plain' }, at('/c~0d/inner'), 'x')).toThrow(
      /the value at "\/c~0d"/,
    )
  })

  it('writes an escaped key to the location the pointer names', () => {
    expect(setAtPointer({}, at('/a~1b/inner'), 'x')).toEqual({ 'a/b': { inner: 'x' } })
  })

  it('still refuses to write through a scalar, which is the other refusal', () => {
    expect(() => setAtPointer({ a: 'plain' }, at('/a/b/c'), 1)).toThrow(
      /cannot hold a property/,
    )
  })
})

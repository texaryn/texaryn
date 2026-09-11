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
 * The decision this file previously deferred is the container kind, and it is
 * that a missing level is created as an object whatever its key looks like.
 *
 * A numeric segment does not imply an array. An object property may be named
 * `"0"`, and the runtime generates exactly that pointer from the schema's own
 * property names, so refusing `/rows/0` would break a legitimate schema. It
 * would also guard a case that cannot arise: an array item's pointer exists
 * only once its row is in the data, which means its array already exists, so
 * the level above an index is never the missing one. An array that has to be
 * created is the caller's to create.
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
   * A numeric key creates an object, which is the case that decides the rule:
   * a schema may declare a property named `"0"`, and the projection builds
   * `/rows/0` for it from the property name.
   */
  it('creates an object for a numeric key, because a property may be named 0', () => {
    expect(setAtPointer({}, at('/rows/0/name'), 'x')).toEqual({ rows: { '0': { name: 'x' } } })
  })

  it('creates an object when the numeric key is the last segment', () => {
    expect(setAtPointer({}, at('/rows/0'), 'x')).toEqual({ rows: { '0': 'x' } })
  })

  it('writes into an array that is already there', () => {
    expect(setAtPointer({ rows: [] }, at('/rows/0'), 'x')).toEqual({ rows: ['x'] })
    expect(setAtPointer({ rows: [{}] }, at('/rows/0/name'), 'x')).toEqual({
      rows: [{ name: 'x' }],
    })
  })

  it.each([['0'], ['12'], ['01'], ['1x'], ['-1'], ['1.0']])(
    'creates an object level for the key %s',
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

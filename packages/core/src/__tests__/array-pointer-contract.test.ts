import { describe, it, expect } from 'vitest'
import { getAtPointer, setAtPointer } from '../json-pointer.js'
import type { JsonPointer } from '../types.js'

const at = (s: string) => s as JsonPointer

/**
 * What a pointer segment means when the container is an array.
 *
 * The writer used to coerce the token with `Number(key)` while the reader used
 * it as a property key, so the two addressed different places. `/01` read
 * nothing and wrote element 1. Worse, `Number('1x')` and `Number('-')` are
 * `NaN`, so those writes set a property named `"NaN"` on the array, which
 * `JSON.stringify` drops: the value was accepted, stored, and then silently
 * absent from the submission. That is #124's failure again in a different
 * place, an instance no schema described, produced without a signal.
 *
 * RFC 6901 settles which tokens are indices: digits with no leading zero, or
 * `-` for the position after the last element. Everything else is an error
 * condition, and the reader was already right about that by accident.
 */
describe('a pointer segment against an array', () => {
  it.each([
    ['the first element', ['a', 'b'], '/0', 'x', ['x', 'b']],
    ['a later element', ['a', 'b'], '/1', 'x', ['a', 'x']],
    ['the position after the last, by index', ['a'], '/1', 'x', ['a', 'x']],
    ['the position after the last, by dash', ['a'], '/-', 'x', ['a', 'x']],
    ['an append to an empty array', [], '/-', 'x', ['x']],
  ])('writes %s', (_label, input, pointer, value, expected) => {
    expect(setAtPointer(input, at(pointer), value)).toEqual(expected)
  })

  it('writes through an index into a nested container', () => {
    expect(setAtPointer({ rows: [{ a: 1 }] }, at('/rows/0/a'), 2)).toEqual({ rows: [{ a: 2 }] })
  })

  it.each([['/01'], ['/1x'], ['/-1'], ['/1.0'], ['/+1'], ['/ 1'], ['//']])(
    'refuses %s, which is not an index',
    (pointer) => {
      expect(() => setAtPointer(['a', 'b'], at(pointer), 'x')).toThrow(/not an array index/)
    },
  )

  it('refuses an index past the end rather than leaving holes', () => {
    expect(() => setAtPointer(['a'], at('/5'), 'x')).toThrow(/past the end/)
    expect(() => setAtPointer([], at('/1'), 'x')).toThrow(/past the end/)
  })

  it('names the array and the offending token', () => {
    expect(() => setAtPointer({ rows: ['a'] }, at('/rows/01'), 'x')).toThrow(/"01"/)
    expect(() => setAtPointer({ rows: ['a'] }, at('/rows/01'), 'x')).toThrow(/\/rows/)
  })

  /**
   * The reader stays total. Reading a location that does not exist is a miss,
   * not a mistake, and every node's initial value is seeded through it.
   */
  it.each([['/01'], ['/1x'], ['/-1'], ['/-'], ['/5']])(
    'reads %s as undefined rather than throwing',
    (pointer) => {
      expect(getAtPointer(['a', 'b'], at(pointer))).toBeUndefined()
    },
  )

  it('reads a canonical index', () => {
    expect(getAtPointer(['a', 'b'], at('/1'))).toBe('b')
  })

  /**
   * The reader and the writer have to agree on where a token points, which is
   * the invariant the coercion broke. Where the reader finds nothing and the
   * writer can create it, they agree; where the reader finds nothing because
   * the token addresses nothing, the writer refuses.
   */
  it.each([['/01'], ['/1x'], ['/-1']])(
    'never writes somewhere %s cannot be read back from',
    (pointer) => {
      let written: unknown
      try {
        written = setAtPointer(['a', 'b'], at(pointer), 'x')
      } catch {
        return
      }
      expect(getAtPointer(written, at(pointer))).toBe('x')
    },
  )

  it('no longer loses a write into a property serialization drops', () => {
    expect(() => setAtPointer([], at('/1x'), 'x')).toThrow()
    expect(() => setAtPointer([], at('/-1'), 'x')).toThrow()
  })

  /** An object keyed with the same tokens is untouched: this is about arrays. */
  it.each([['01'], ['1x'], ['-1'], ['-']])('still writes the object key %s', (key) => {
    expect(setAtPointer({}, at(`/${key}`), 'x')).toEqual({ [key]: 'x' })
  })
})

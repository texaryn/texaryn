import { describe, it, expect } from 'vitest'
import { setAtPointer, getAtPointer } from '../json-pointer.js'
import type { JsonPointer } from '../types.js'

const at = (s: string) => s as JsonPointer

/**
 * What `setAtPointer` does when a value on the path cannot hold a property.
 *
 * It used to spread it. `{ ...'plain' }` is
 * `{0:'p',1:'l',2:'a',3:'i',4:'n'}` and `{ ...7 }` is `{}`, so a string on the
 * path turned into character keys and a number was silently discarded, in both
 * cases producing data no schema described. That is #124's corruption, recorded
 * there at the root; the same spread reached any depth, which is why #129 asked
 * for the same answer.
 *
 * The invariant is per write rather than per root: a write through a value that
 * cannot hold a property is refused. Absent is not such a value, which is the
 * distinction the guard has to keep.
 */
describe('setAtPointer through a value that cannot hold a property', () => {
  it.each([
    ['a string', 'plain'],
    ['a number', 7],
    ['a boolean', false],
    ['the empty string', ''],
    ['zero', 0],
  ])('refuses to write through %s at the root', (_label, root) => {
    expect(() => setAtPointer(root, at('/a'), 'x')).toThrow(/cannot hold a property/)
  })

  it('refuses at depth rather than only at the root', () => {
    expect(() => setAtPointer({ owner: 'plain' }, at('/owner/name'), 'x')).toThrow(
      /cannot hold a property/,
    )
  })

  it('names the pointer and the type in the message', () => {
    expect(() => setAtPointer({ owner: 7 }, at('/owner/name'), 'x')).toThrow(
      /\/owner.*number|number.*\/owner/,
    )
  })

  it('is not a TypeError, which is what #129 still raises', () => {
    let thrown: unknown
    try {
      setAtPointer('plain', at('/a'), 'x')
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(Error)
    expect(thrown).not.toBeInstanceOf(TypeError)
  })

  /**
   * `null` creates, because `getAtPointer` already reads through `null` and
   * `undefined` identically, and a schema of `{ type: ['object', 'null'] }`
   * with data `null` is a legitimate starting state where typing into a field
   * means "make the object". Refusing here would make reading and writing
   * disagree about what `null` is.
   */
  it('creates through null, as it does through an absent level', () => {
    expect(getAtPointer(null, at('/a'))).toBeUndefined()
    expect(setAtPointer(null, at('/a'), 'x')).toEqual({ a: 'x' })
  })

  it('still writes through an object and an array', () => {
    expect(setAtPointer({ a: 1 }, at('/b'), 2)).toEqual({ a: 1, b: 2 })
    expect(setAtPointer([{ a: 1 }], at('/0/a'), 2)).toEqual([{ a: 2 }])
  })

  it('leaves a whole-document replacement alone, since it walks nothing', () => {
    expect(setAtPointer('plain', at(''), 'other')).toBe('other')
  })
})

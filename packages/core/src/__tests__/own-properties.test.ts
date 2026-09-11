import { describe, it, expect } from 'vitest'
import { getAtPointer, setAtPointer } from '../json-pointer.js'
import type { JsonPointer } from '../types.js'

const at = (s: string) => s as JsonPointer

/**
 * A JSON object has the members it was given, and no others.
 *
 * Both helpers walked with `current[key]`, which finds inherited properties,
 * so `{}` appeared to have `constructor`, `toString` and `__proto__`. Those
 * are JavaScript's, not the instance's, and `"constructor"` is a perfectly
 * legal JSON Schema property name.
 *
 * The read was always wrong and the consequence was mostly hidden: the
 * inherited function was spread, `{ ...Function }` is `{}`, and the write
 * happened to produce the right shape by accident. #124's guard then refused
 * to write through a value that cannot hold a property, and a function cannot,
 * so the same input started throwing. The guard is right; the read under it
 * was not.
 */
describe('inherited properties are not members', () => {
  it.each([['constructor'], ['toString'], ['valueOf'], ['hasOwnProperty']])(
    'reads %s as absent rather than as a function',
    (key) => {
      expect(getAtPointer({}, at(`/${key}`))).toBeUndefined()
    },
  )

  it('reads an own property that shadows an inherited one', () => {
    expect(getAtPointer({ constructor: 'mine' }, at('/constructor'))).toBe('mine')
  })

  it('does not read through the prototype chain', () => {
    expect(getAtPointer({}, at('/__proto__'))).toBeUndefined()
    expect(getAtPointer({}, at('/__proto__/constructor'))).toBeUndefined()
  })

  it.each([['constructor'], ['toString'], ['valueOf']])(
    'writes under the legal property name %s instead of refusing',
    (key) => {
      expect(setAtPointer({}, at(`/${key}/name`), 'x')).toEqual({ [key]: { name: 'x' } })
    },
  )

  it('creates the level at depth, under an inherited name', () => {
    expect(setAtPointer({}, at('/a/constructor/b'), 1)).toEqual({ a: { constructor: { b: 1 } } })
  })

  /**
   * Writing `__proto__` has to land as an own property rather than reassigning
   * the prototype. Object spread already copies rather than invoking setters,
   * so this pins the property that made it safe.
   */
  it('writes __proto__ as an ordinary own key', () => {
    const result = setAtPointer({}, at('/__proto__/x'), 'y') as Record<string, unknown>
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(true)
    expect(getAtPointer(result, at('/__proto__/x'))).toBe('y')
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
  })

  it('still refuses to write through an own scalar', () => {
    expect(() => setAtPointer({ constructor: 'plain' }, at('/constructor/name'), 'x')).toThrow(
      /cannot hold a property/,
    )
  })

  /**
   * An array's `length` is an own property, so it is still read. Whether a
   * pointer should address it at all is a question about array semantics and
   * belongs with the segment-coercion work, not here.
   */
  it('leaves an array length alone, which is a separate question', () => {
    expect(getAtPointer(['a'], at('/length'))).toBe(1)
  })
})

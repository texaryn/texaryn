import { describe, it, expect } from 'vitest'
import { deepEqual, toJson } from '../json.js'
import type { OutsideJson } from '../json.js'
import { append, isCanonicalIndex, isWithin, segmentsOf } from '../pointer.js'

function copy(input: unknown) {
  const outside: OutsideJson[] = []
  const value = toJson(input, outside)
  return { value, outside }
}

describe('pointer', () => {
  it('escapes ~ before /', () => {
    expect(append('', 'a/b')).toBe('/a~1b')
    expect(append('', 'a~b')).toBe('/a~0b')
    expect(append('', '~1')).toBe('/~01')
    expect(append('/x', '')).toBe('/x/')
  })

  it('decodes segments and refuses a pointer without a leading slash', () => {
    expect(segmentsOf('')).toEqual([])
    expect(segmentsOf('/a~1b/~01')).toEqual(['a/b', '~1'])
    expect(segmentsOf('a')).toBeUndefined()
  })

  it('accepts canonical indices only', () => {
    expect(['0', '7', '10'].map(isCanonicalIndex)).toEqual([true, true, true])
    expect(['01', '-', '', '1.5', '-1'].map(isCanonicalIndex)).toEqual([false, false, false, false, false])
  })

  it('treats a pointer as within itself and its ancestors only', () => {
    expect(isWithin('/a/b', '/a')).toBe(true)
    expect(isWithin('/ab', '/a')).toBe(false)
    expect(isWithin('/a', '')).toBe(true)
  })
})

describe('toJson', () => {
  it('copies JSON and keeps a __proto__ key as an own member', () => {
    const input: unknown = JSON.parse('{"a":[1,"x",true,null],"__proto__":{"b":2}}')
    const { value, outside } = copy(input)
    expect(outside).toEqual([])
    expect(value).toEqual(input)
    expect(value).not.toBe(input)
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype)
    expect(Object.keys(value as object)).toEqual(['a', '__proto__'])
  })

  it('drops every value outside JSON and reports it by path', () => {
    const cyclic: Record<string, unknown> = { name: 'x' }
    cyclic.self = cyclic
    const { value, outside } = copy({
      a: () => 1,
      b: Number.NaN,
      c: undefined,
      d: new Date(0),
      e: Symbol('s'),
      f: cyclic,
      g: [1, Number.POSITIVE_INFINITY],
    })
    expect(value).toEqual({ f: { name: 'x' }, g: [1, null] })
    expect(outside.map((entry) => entry.path)).toEqual(['/a', '/b', '/c', '/d', '/e', '/f/self', '/g/1'])
  })

  it('reports a throwing getter and a hostile proxy without throwing', () => {
    const getter = Object.defineProperty({ kept: 1 }, 'boom', {
      enumerable: true,
      get() {
        throw new Error('no')
      },
    })
    const proxy = new Proxy({}, {
      ownKeys() {
        throw new Error('no')
      },
    })
    const { value, outside } = copy({ getter, proxy })
    expect(value).toEqual({ getter: { kept: 1 } })
    expect(outside.map((entry) => [entry.path, entry.reason])).toEqual([
      ['/getter/boom', 'reading it threw'],
      ['/proxy', 'reading it threw'],
    ])
  })

  it('reports a top level value outside JSON at the root', () => {
    expect(copy(() => 1)).toEqual({
      value: undefined,
      outside: [{ path: '', key: '', reason: 'a function is not a JSON value' }],
    })
  })
})

describe('deepEqual', () => {
  it('compares structure, not identity or key order', () => {
    expect(deepEqual({ a: [1, { b: 2 }], c: null }, { c: null, a: [1, { b: 2 }] })).toBe(true)
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(deepEqual([1, 2], [2, 1])).toBe(false)
    expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false)
  })
})

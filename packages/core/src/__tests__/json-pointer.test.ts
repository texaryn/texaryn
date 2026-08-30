import { describe, it, expect } from 'vitest'
import type { JsonPointer } from '../types.js'
import { getAtPointer, setAtPointer, parsePointer } from '../json-pointer.js'

const jp = (s: string) => s as JsonPointer

describe('parsePointer', () => {
  it('parses empty string as root', () => {
    expect(parsePointer(jp(''))).toEqual([])
  })

  it('parses single-level pointer', () => {
    expect(parsePointer(jp('/name'))).toEqual(['name'])
  })

  it('parses multi-level pointer', () => {
    expect(parsePointer(jp('/a/b/c'))).toEqual(['a', 'b', 'c'])
  })

  it('handles array indices', () => {
    expect(parsePointer(jp('/items/0/city'))).toEqual(['items', '0', 'city'])
  })

  it('unescapes ~1 as / and ~0 as ~', () => {
    expect(parsePointer(jp('/a~1b/c~0d'))).toEqual(['a/b', 'c~d'])
  })
})

describe('getAtPointer', () => {
  const data = { name: 'Alice', address: { city: 'Paris' }, items: [1, 2, 3] }

  it('returns root for empty pointer', () => {
    expect(getAtPointer(data, jp(''))).toBe(data)
  })

  it('gets a top-level property', () => {
    expect(getAtPointer(data, jp('/name'))).toBe('Alice')
  })

  it('gets a nested property', () => {
    expect(getAtPointer(data, jp('/address/city'))).toBe('Paris')
  })

  it('gets an array element', () => {
    expect(getAtPointer(data, jp('/items/1'))).toBe(2)
  })

  it('returns undefined for missing path', () => {
    expect(getAtPointer(data, jp('/missing'))).toBeUndefined()
  })
})

describe('setAtPointer', () => {
  it('sets a top-level property immutably', () => {
    const data = { name: 'Alice' }
    const result = setAtPointer(data, jp('/name'), 'Bob')
    expect(result).toEqual({ name: 'Bob' })
    expect(data.name).toBe('Alice')
  })

  it('sets a nested property immutably', () => {
    const data = { a: { b: 1 } }
    const result = setAtPointer(data, jp('/a/b'), 2)
    expect(result).toEqual({ a: { b: 2 } })
    expect(data.a.b).toBe(1)
  })

  it('sets an array element immutably', () => {
    const data = { items: [1, 2, 3] }
    const result = setAtPointer(data, jp('/items/1'), 99) as typeof data
    expect(result.items).toEqual([1, 99, 3])
    expect(data.items[1]).toBe(2)
  })

  it('replaces root when pointer is empty', () => {
    const result = setAtPointer({ a: 1 }, jp(''), { b: 2 })
    expect(result).toEqual({ b: 2 })
  })
})

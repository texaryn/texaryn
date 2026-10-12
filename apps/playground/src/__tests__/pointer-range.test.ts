import { describe, it, expect } from 'vitest'
import { parser } from '@lezer/json'
import { rangeForPointer } from '../editor/pointer-range.js'

const doc = JSON.stringify(
  {
    type: 'object',
    properties: { name: { type: 'strin' }, 'a/b': { minLength: '3' }, 'c~d': { type: 'x' } },
    prefixItems: [{ type: 'strin' }],
    items: [{ type: 'string' }],
  },
  null,
  2,
)
const tree = parser.parse(doc)

function textAt(pointer: string): string {
  const { from, to } = rangeForPointer(tree, doc, pointer)
  return doc.slice(from, to)
}

describe('rangeForPointer', () => {
  it('finds a nested value', () => {
    expect(textAt('/properties/name/type')).toBe('"strin"')
  })

  it('unescapes ~1 and ~0 in property names', () => {
    expect(textAt('/properties/a~1b/minLength')).toBe('"3"')
    expect(textAt('/properties/c~0d/type')).toBe('"x"')
  })

  it('walks array elements by index', () => {
    expect(textAt('/prefixItems/0/type')).toBe('"strin"')
  })

  it('marks only the first line of a container', () => {
    expect(textAt('/items')).toBe('[')
  })

  it('falls back to the deepest node it found', () => {
    expect(textAt('/properties/missing/type').startsWith('{')).toBe(true)
  })

  it('marks the first line of the root for the empty pointer', () => {
    expect(textAt('')).toBe('{')
  })

  it('matches property names after JSON string escapes are decoded', () => {
    const escaped = String.raw`{
  "a\"b": { "type": "quoted" },
  "a\/b": { "type": "slash" },
  "a": { "type": "plain" }
}`
    const escapedTree = parser.parse(escaped)
    const textIn = (pointer: string) => {
      const { from, to } = rangeForPointer(escapedTree, escaped, pointer)
      return escaped.slice(from, to)
    }
    expect(textIn('/a"b/type')).toBe('"quoted"')
    expect(textIn('/a~1b/type')).toBe('"slash"')
    expect(textIn('/a/type')).toBe('"plain"')
  })

  it('accepts only RFC 6901 array indexes', () => {
    const arrayDoc = '{"arr": [1, 2, 3]}'
    const arrayTree = parser.parse(arrayDoc)
    const textIn = (pointer: string) => {
      const { from, to } = rangeForPointer(arrayTree, arrayDoc, pointer)
      return arrayDoc.slice(from, to)
    }
    expect(textIn('/arr/1')).toBe('2')
    for (const pointer of ['/arr/01', '/arr/1e0', '/arr/']) {
      expect(textIn(pointer)).toBe('[1, 2, 3]')
    }
  })
})

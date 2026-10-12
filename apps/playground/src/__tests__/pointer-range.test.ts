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
})

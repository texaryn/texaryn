import { describe, it, expect } from 'vitest'
import { objectChildKey } from '../child-key.js'
import type { UINode } from '../types.js'

function field(id: string, dataPointer: string | null): UINode {
  return {
    id, type: 'field', fieldType: 'string', parentId: 'n0', dataPointer, order: 0,
    visible: true, disabled: false, readOnly: false, annotations: {}, constraints: {},
  } as UINode
}

describe('objectChildKey', () => {
  it('is the last pointer segment, whatever the node id', () => {
    expect(objectChildKey(field('n7', '/rows/0/name'))).toBe('name')
    expect(objectChildKey(field('n9', '/rows/1/name'))).toBe('name')
  })

  it('keeps an escaped segment escaped', () => {
    expect(objectChildKey(field('n1', '/a~1b'))).toBe('a~1b')
  })

  it('falls back to the node id without a data pointer', () => {
    expect(objectChildKey(field('n3', null))).toBe('n3')
  })
})

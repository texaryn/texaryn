import { describe, it, expect } from 'vitest'
import { identityKey, ROOT_IDENTITY_KEY } from '../key.js'
import type { StableItemId } from '../../types.js'

const item = (s: string) => s as StableItemId

describe('identityKey', () => {
  it('is empty for the root', () => {
    expect(identityKey([])).toBe(ROOT_IDENTITY_KEY)
    expect(ROOT_IDENTITY_KEY).toBe('')
  })

  it('is deterministic for the same segments', () => {
    const a = identityKey([
      { kind: 'property', name: 'rows' },
      { kind: 'item', id: item('item_1') },
      { kind: 'property', name: 'tags' },
    ])
    const b = identityKey([
      { kind: 'property', name: 'rows' },
      { kind: 'item', id: item('item_1') },
      { kind: 'property', name: 'tags' },
    ])
    expect(a).toBe(b)
  })

  it('keeps a property and an item with the same text apart', () => {
    const property = identityKey([{ kind: 'property', name: 'item_1' }])
    const itemKey = identityKey([{ kind: 'item', id: item('item_1') }])
    expect(property).not.toBe(itemKey)
  })

  it('keeps property names containing the separator apart from nesting', () => {
    const nested = identityKey([
      { kind: 'property', name: 'a' },
      { kind: 'property', name: 'b' },
    ])
    const flat = identityKey([{ kind: 'property', name: 'a/b' }])
    expect(nested).not.toBe(flat)
  })

  it('does not read as a JSON Pointer', () => {
    const key = identityKey([{ kind: 'property', name: 'rows' }])
    expect(key.startsWith('/')).toBe(false)
  })
})

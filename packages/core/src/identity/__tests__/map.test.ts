import { describe, it, expect } from 'vitest'
import type { NodeId, StableItemId } from '../../types.js'
import {
  createIdentityMap,
  registerArray,
  insertItem,
  removeItem,
  moveItem,
  resolvePointer,
} from '../map.js'

const nid = (s: string) => s as NodeId

describe('IdentityMap', () => {
  it('registerArray creates an empty identity list', () => {
    const map = registerArray(createIdentityMap(), nid('arr'))
    expect(map.arrayIdentities.get(nid('arr'))).toEqual([])
  })

  describe('insertItem', () => {
    it('generates a StableItemId and inserts at index', () => {
      let map = registerArray(createIdentityMap(), nid('arr'))
      const r0 = insertItem(map, nid('arr'), 0)
      map = r0.map
      const r1 = insertItem(map, nid('arr'), 1)
      map = r1.map

      const ids = map.arrayIdentities.get(nid('arr'))!
      expect(ids).toHaveLength(2)
      expect(ids[0]).toBe(r0.itemId)
      expect(ids[1]).toBe(r1.itemId)
      expect(r0.itemId).not.toBe(r1.itemId)
    })

    it('inserts at the beginning', () => {
      let map = registerArray(createIdentityMap(), nid('arr'))
      const r0 = insertItem(map, nid('arr'), 0)
      map = r0.map
      const r1 = insertItem(map, nid('arr'), 0)
      map = r1.map

      const ids = map.arrayIdentities.get(nid('arr'))!
      expect(ids[0]).toBe(r1.itemId)
      expect(ids[1]).toBe(r0.itemId)
    })

    it('updates reverse lookup indices', () => {
      let map = registerArray(createIdentityMap(), nid('arr'))
      const r0 = insertItem(map, nid('arr'), 0)
      map = r0.map
      const r1 = insertItem(map, nid('arr'), 0)
      map = r1.map

      expect(map.itemLookup.get(r1.itemId)!.index).toBe(0)
      expect(map.itemLookup.get(r0.itemId)!.index).toBe(1)
    })
  })

  describe('removeItem', () => {
    it('removes the item and updates indices', () => {
      let map = registerArray(createIdentityMap(), nid('arr'))
      const r0 = insertItem(map, nid('arr'), 0)
      map = r0.map
      const r1 = insertItem(map, nid('arr'), 1)
      map = r1.map
      const r2 = insertItem(map, nid('arr'), 2)
      map = r2.map

      const result = removeItem(map, nid('arr'), 0)
      map = result.map

      expect(result.removedId).toBe(r0.itemId)
      expect(map.arrayIdentities.get(nid('arr'))).toEqual([r1.itemId, r2.itemId])
      expect(map.itemLookup.get(r1.itemId)!.index).toBe(0)
      expect(map.itemLookup.get(r2.itemId)!.index).toBe(1)
      expect(map.itemLookup.has(r0.itemId)).toBe(false)
    })
  })

  describe('moveItem', () => {
    it('moves an item and updates indices', () => {
      let map = registerArray(createIdentityMap(), nid('arr'))
      const ids: StableItemId[] = []
      for (let i = 0; i < 3; i++) {
        const r = insertItem(map, nid('arr'), i)
        map = r.map
        ids.push(r.itemId)
      }

      map = moveItem(map, nid('arr'), 0, 2)
      const list = map.arrayIdentities.get(nid('arr'))!
      expect(list).toEqual([ids[1], ids[2], ids[0]])
      expect(map.itemLookup.get(ids[0])!.index).toBe(2)
      expect(map.itemLookup.get(ids[1])!.index).toBe(0)
      expect(map.itemLookup.get(ids[2])!.index).toBe(1)
    })

    it('preserves StableItemIds', () => {
      let map = registerArray(createIdentityMap(), nid('arr'))
      const r0 = insertItem(map, nid('arr'), 0)
      map = r0.map
      const r1 = insertItem(map, nid('arr'), 1)
      map = r1.map

      map = moveItem(map, nid('arr'), 0, 1)
      const list = map.arrayIdentities.get(nid('arr'))!
      expect(list).toContain(r0.itemId)
      expect(list).toContain(r1.itemId)
    })
  })

  describe('resolvePointer', () => {
    it('returns the current index as a string', () => {
      let map = registerArray(createIdentityMap(), nid('arr'))
      const r0 = insertItem(map, nid('arr'), 0)
      map = r0.map
      const r1 = insertItem(map, nid('arr'), 1)
      map = r1.map

      expect(resolvePointer(map, r0.itemId)).toBe('0')
      expect(resolvePointer(map, r1.itemId)).toBe('1')

      map = moveItem(map, nid('arr'), 0, 1)
      expect(resolvePointer(map, r0.itemId)).toBe('1')
      expect(resolvePointer(map, r1.itemId)).toBe('0')
    })
  })
})

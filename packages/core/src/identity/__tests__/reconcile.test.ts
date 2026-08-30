import { describe, it, expect } from 'vitest'
import type { NodeId, JsonPointer } from '../../types.js'
import {
  createIdentityMap,
  registerArray,
  insertItem,
} from '../map.js'
import { reconcile } from '../reconcile.js'

const nid = (s: string) => s as NodeId
const jp = (s: string) => s as JsonPointer

describe('reconcile', () => {
  it('matches identical primitive items by reference equality', () => {
    let map = registerArray(createIdentityMap(), nid('arr'))
    const r0 = insertItem(map, nid('arr'), 0); map = r0.map
    const r1 = insertItem(map, nid('arr'), 1); map = r1.map

    const oldItems = [1, 2]
    const newItems = [1, 2]
    const result = reconcile(map, nid('arr'), oldItems, newItems)
    const ids = result.arrayIdentities.get(nid('arr'))!
    expect(ids[0]).toBe(r0.itemId)
    expect(ids[1]).toBe(r1.itemId)
  })

  it('matches reordered items and preserves ids', () => {
    let map = registerArray(createIdentityMap(), nid('arr'))
    const r0 = insertItem(map, nid('arr'), 0); map = r0.map
    const r1 = insertItem(map, nid('arr'), 1); map = r1.map

    const oldItems = [1, 2]
    const newItems = [2, 1]
    const result = reconcile(map, nid('arr'), oldItems, newItems)
    const ids = result.arrayIdentities.get(nid('arr'))!
    expect(ids[0]).toBe(r1.itemId)
    expect(ids[1]).toBe(r0.itemId)
  })

  it('assigns new ids for new items', () => {
    let map = registerArray(createIdentityMap(), nid('arr'))
    const r0 = insertItem(map, nid('arr'), 0); map = r0.map

    const oldItems = [1]
    const newItems = [1, 2]
    const result = reconcile(map, nid('arr'), oldItems, newItems)
    const ids = result.arrayIdentities.get(nid('arr'))!
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBe(r0.itemId)
    expect(ids[1]).not.toBe(r0.itemId)
  })

  it('removes ids for removed items', () => {
    let map = registerArray(createIdentityMap(), nid('arr'))
    const r0 = insertItem(map, nid('arr'), 0); map = r0.map
    const r1 = insertItem(map, nid('arr'), 1); map = r1.map

    const result = reconcile(map, nid('arr'), [1, 2], [2])
    const ids = result.arrayIdentities.get(nid('arr'))!
    expect(ids).toHaveLength(1)
    expect(ids[0]).toBe(r1.itemId)
    expect(result.itemLookup.has(r0.itemId)).toBe(false)
  })

  it('uses itemKey for matching objects', () => {
    let map = registerArray(createIdentityMap(), nid('arr'))
    const r0 = insertItem(map, nid('arr'), 0); map = r0.map
    const r1 = insertItem(map, nid('arr'), 1); map = r1.map

    const oldItems = [{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }]
    const newItems = [{ id: 'b', name: 'Robert' }, { id: 'a', name: 'Alice' }]

    const result = reconcile(map, nid('arr'), oldItems, newItems, {
      itemKey: jp('/id'),
    })
    const ids = result.arrayIdentities.get(nid('arr'))!
    expect(ids[0]).toBe(r1.itemId)
    expect(ids[1]).toBe(r0.itemId)
  })

  it('deep equality is best-effort for identical objects', () => {
    let map = registerArray(createIdentityMap(), nid('arr'))
    const r0 = insertItem(map, nid('arr'), 0); map = r0.map
    const r1 = insertItem(map, nid('arr'), 1); map = r1.map

    const oldItems = [{ x: 1 }, { x: 1 }]
    const newItems = [{ x: 1 }, { x: 1 }]
    const result = reconcile(map, nid('arr'), oldItems, newItems)
    const ids = result.arrayIdentities.get(nid('arr'))!
    expect(ids).toHaveLength(2)
  })
})

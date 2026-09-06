import type { StableItemId } from '../types.js'
import type { IdentityKey } from './key.js'
import type { IdentityMap } from '../ir/runtime-state.js'

export function createIdentityMap(): IdentityMap {
  return {
    arrayIdentities: new Map(),
    itemLookup: new Map(),
    nextId: 0,
  }
}

export function registerArray(
  map: IdentityMap,
  containerKey: IdentityKey,
): IdentityMap {
  const arrayIdentities = new Map(map.arrayIdentities)
  arrayIdentities.set(containerKey, [])
  return { ...map, arrayIdentities }
}

export function insertItem(
  map: IdentityMap,
  containerKey: IdentityKey,
  index: number,
): { map: IdentityMap; itemId: StableItemId } {
  const itemId = `item_${map.nextId}` as StableItemId
  const ids = [...(map.arrayIdentities.get(containerKey) ?? [])]
  ids.splice(index, 0, itemId)

  const arrayIdentities = new Map(map.arrayIdentities)
  arrayIdentities.set(containerKey, ids)

  const itemLookup = new Map(map.itemLookup)
  for (let i = index; i < ids.length; i++) {
    itemLookup.set(ids[i], { containerKey, index: i })
  }

  return {
    map: { ...map, arrayIdentities, itemLookup, nextId: map.nextId + 1 },
    itemId,
  }
}

export function removeItem(
  map: IdentityMap,
  containerKey: IdentityKey,
  index: number,
): { map: IdentityMap; removedId: StableItemId } {
  const ids = [...(map.arrayIdentities.get(containerKey) ?? [])]
  const removedId = ids[index]
  ids.splice(index, 1)

  const arrayIdentities = new Map(map.arrayIdentities)
  arrayIdentities.set(containerKey, ids)

  const itemLookup = new Map(map.itemLookup)
  itemLookup.delete(removedId)
  for (let i = index; i < ids.length; i++) {
    itemLookup.set(ids[i], { containerKey, index: i })
  }

  return {
    map: { ...map, arrayIdentities, itemLookup },
    removedId,
  }
}

export function moveItem(
  map: IdentityMap,
  containerKey: IdentityKey,
  from: number,
  to: number,
): IdentityMap {
  const ids = [...(map.arrayIdentities.get(containerKey) ?? [])]
  const [item] = ids.splice(from, 1)
  ids.splice(to, 0, item)

  const arrayIdentities = new Map(map.arrayIdentities)
  arrayIdentities.set(containerKey, ids)

  const itemLookup = new Map(map.itemLookup)
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  for (let i = lo; i <= hi; i++) {
    itemLookup.set(ids[i], { containerKey, index: i })
  }

  return { ...map, arrayIdentities, itemLookup }
}

export function resolvePointer(
  map: IdentityMap,
  itemId: StableItemId,
): string {
  const entry = map.itemLookup.get(itemId)
  if (!entry) throw new Error(`Unknown StableItemId: ${itemId}`)
  return String(entry.index)
}

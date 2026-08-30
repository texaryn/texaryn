import type { NodeId, StableItemId } from '../types.js'
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
  containerId: NodeId,
): IdentityMap {
  const arrayIdentities = new Map(map.arrayIdentities)
  arrayIdentities.set(containerId, [])
  return { ...map, arrayIdentities }
}

export function insertItem(
  map: IdentityMap,
  containerId: NodeId,
  index: number,
): { map: IdentityMap; itemId: StableItemId } {
  const itemId = `item_${map.nextId}` as StableItemId
  const ids = [...(map.arrayIdentities.get(containerId) ?? [])]
  ids.splice(index, 0, itemId)

  const arrayIdentities = new Map(map.arrayIdentities)
  arrayIdentities.set(containerId, ids)

  const itemLookup = new Map(map.itemLookup)
  for (let i = index; i < ids.length; i++) {
    itemLookup.set(ids[i], { containerId, index: i })
  }

  return {
    map: { ...map, arrayIdentities, itemLookup, nextId: map.nextId + 1 },
    itemId,
  }
}

export function removeItem(
  map: IdentityMap,
  containerId: NodeId,
  index: number,
): { map: IdentityMap; removedId: StableItemId } {
  const ids = [...(map.arrayIdentities.get(containerId) ?? [])]
  const removedId = ids[index]
  ids.splice(index, 1)

  const arrayIdentities = new Map(map.arrayIdentities)
  arrayIdentities.set(containerId, ids)

  const itemLookup = new Map(map.itemLookup)
  itemLookup.delete(removedId)
  for (let i = index; i < ids.length; i++) {
    itemLookup.set(ids[i], { containerId, index: i })
  }

  return {
    map: { ...map, arrayIdentities, itemLookup },
    removedId,
  }
}

export function moveItem(
  map: IdentityMap,
  containerId: NodeId,
  from: number,
  to: number,
): IdentityMap {
  const ids = [...(map.arrayIdentities.get(containerId) ?? [])]
  const [item] = ids.splice(from, 1)
  ids.splice(to, 0, item)

  const arrayIdentities = new Map(map.arrayIdentities)
  arrayIdentities.set(containerId, ids)

  const itemLookup = new Map(map.itemLookup)
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  for (let i = lo; i <= hi; i++) {
    itemLookup.set(ids[i], { containerId, index: i })
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

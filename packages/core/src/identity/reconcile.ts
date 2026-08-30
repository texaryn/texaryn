import type { NodeId, StableItemId, JsonPointer } from '../types.js'
import type { IdentityMap } from '../ir/runtime-state.js'
import { getAtPointer } from '../json-pointer.js'

export interface ReconcileOptions {
  itemKey?: JsonPointer
}

export function reconcile(
  map: IdentityMap,
  containerId: NodeId,
  oldItems: unknown[],
  newItems: unknown[],
  options?: ReconcileOptions,
): IdentityMap {
  const oldIds = map.arrayIdentities.get(containerId) ?? []
  const matcher = options?.itemKey
    ? keyMatcher(options.itemKey)
    : defaultMatcher

  const usedOldIndices = new Set<number>()
  const newIds: StableItemId[] = []
  let nextId = map.nextId

  for (const newItem of newItems) {
    let matchedIndex = -1
    for (let i = 0; i < oldItems.length; i++) {
      if (usedOldIndices.has(i)) continue
      if (matcher(oldItems[i], newItem)) {
        matchedIndex = i
        break
      }
    }

    if (matchedIndex >= 0) {
      usedOldIndices.add(matchedIndex)
      newIds.push(oldIds[matchedIndex])
    } else {
      newIds.push(`item_${nextId++}` as StableItemId)
    }
  }

  const arrayIdentities = new Map(map.arrayIdentities)
  arrayIdentities.set(containerId, newIds)

  const itemLookup = new Map(map.itemLookup)
  for (const oldId of oldIds) {
    if (!newIds.includes(oldId)) itemLookup.delete(oldId)
  }
  for (let i = 0; i < newIds.length; i++) {
    itemLookup.set(newIds[i], { containerId, index: i })
  }

  return { ...map, arrayIdentities, itemLookup, nextId }
}

function defaultMatcher(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (a === null || b === null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false
  return JSON.stringify(a) === JSON.stringify(b)
}

function keyMatcher(
  itemKey: JsonPointer,
): (a: unknown, b: unknown) => boolean {
  return (a, b) => {
    const ka = getAtPointer(a, itemKey)
    const kb = getAtPointer(b, itemKey)
    return ka !== undefined && Object.is(ka, kb)
  }
}

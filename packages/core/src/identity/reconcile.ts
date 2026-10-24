import type { StableItemId, JsonPointer } from '../types.js'
import type { IdentityKey } from './key.js'
import type { IdentityMap } from '../ir/runtime-state.js'
import { getAtPointer } from '../json-pointer.js'

export interface ReconcileOptions {
  itemKey?: JsonPointer
}

function reconcileItemIds(
  oldIds: StableItemId[],
  oldItems: unknown[],
  newItems: unknown[],
  nextId: number,
  matcher: (oldItem: unknown, newItem: unknown) => boolean,
): { ids: StableItemId[]; nextId: number } {
  const usedOldIndices = new Set<number>()
  const ids = newItems.map((newItem) => {
    const matchedIndex = oldItems.findIndex((oldItem, index) =>
      !usedOldIndices.has(index) && matcher(oldItem, newItem),
    )
    if (matchedIndex < 0) return `item_${nextId++}` as StableItemId
    usedOldIndices.add(matchedIndex)
    return oldIds[matchedIndex]
  })
  return { ids, nextId }
}

export function reconcile(
  map: IdentityMap,
  containerKey: IdentityKey,
  oldItems: unknown[],
  newItems: unknown[],
  options?: ReconcileOptions,
): IdentityMap {
  const oldIds = map.arrayIdentities.get(containerKey) ?? []
  const matcher = options?.itemKey
    ? keyMatcher(options.itemKey)
    : defaultMatcher
  const { ids: newIds, nextId } = reconcileItemIds(oldIds, oldItems, newItems, map.nextId, matcher)

  const arrayIdentities = new Map(map.arrayIdentities)
  arrayIdentities.set(containerKey, newIds)

  const itemLookup = new Map(map.itemLookup)
  for (const oldId of oldIds) {
    if (!newIds.includes(oldId)) itemLookup.delete(oldId)
  }
  for (let i = 0; i < newIds.length; i++) {
    itemLookup.set(newIds[i], { containerKey, index: i })
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

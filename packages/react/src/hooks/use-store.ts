import { useSyncExternalStore } from 'react'
import type { Store } from '@texaryn/core'

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}

import { readable } from 'svelte/store'
import type { Readable } from 'svelte/store'
import type { Store } from '@texaryn/core'

export function fromStore<T>(store: Store<T>): Readable<T> {
  return readable(store.getSnapshot(), (set) => {
    set(store.getSnapshot())
    return store.subscribe(() => set(store.getSnapshot()))
  })
}

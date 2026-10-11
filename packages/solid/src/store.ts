import { createEffect, createSignal, onCleanup, type Accessor } from 'solid-js'
import type { Store } from '@texaryn/core'

export function useStore<T>(store: Accessor<Store<T>>): Accessor<T> {
  const [snapshot, setSnapshot] = createSignal(store().getSnapshot(), { equals: false })
  createEffect(() => {
    const current = store()
    setSnapshot(() => current.getSnapshot())
    onCleanup(current.subscribe(() => setSnapshot(() => current.getSnapshot())))
  })
  return snapshot
}

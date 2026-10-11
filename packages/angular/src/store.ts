import { DestroyRef, effect, inject, signal } from '@angular/core'
import type { Signal } from '@angular/core'
import type { Store } from '@texaryn/core'

export function useStore<T>(store: Store<T>, owner: DestroyRef = inject(DestroyRef)): Signal<T> {
  const value = signal(store.getSnapshot())
  const unsubscribe = store.subscribe(() => value.set(store.getSnapshot()))
  owner.onDestroy(unsubscribe)
  return value.asReadonly()
}

export function useDynamicStore<T>(source: () => Store<T> | undefined, fallback: T): Signal<T> {
  const value = signal(fallback)

  effect((onCleanup) => {
    const store = source()
    if (!store) {
      value.set(fallback)
      return
    }

    value.set(store.getSnapshot())
    onCleanup(store.subscribe(() => value.set(store.getSnapshot())))
  })

  return value.asReadonly()
}

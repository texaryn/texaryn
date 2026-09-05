import { getCurrentScope, onScopeDispose, shallowRef, watch } from 'vue'
import type { Ref } from 'vue'
import type { Store } from '@texaryn/core'

/**
 * A Texaryn store, read as a Vue ref.
 *
 * This is where the two bindings genuinely diverge rather than differ in
 * spelling. React's `useStore` re-runs on every render, so it re-reads the
 * store expression each time and `useSyncExternalStore` swaps subscriptions
 * for free. A Vue composable runs once in `setup`, so the subscription has to
 * be managed: accepting a getter and watching it is what replaces the
 * re-render.
 *
 * `shallowRef` rather than `ref`: snapshots are plain data owned by the
 * runtime, and deep reactive conversion would both cost a proxy walk per
 * update and hand callers a mutable view of state they do not own.
 */
export function useStore<T>(source: Store<T> | (() => Store<T> | undefined), fallback: T): Ref<T>
export function useStore<T>(source: Store<T> | (() => Store<T> | undefined)): Ref<T | undefined>
export function useStore<T>(
  source: Store<T> | (() => Store<T> | undefined),
  fallback?: T,
): Ref<T | undefined> {
  // Checked before anything is created, so a misuse cannot leak the thing it
  // was about to subscribe to. This composable owns a subscription it never
  // hands back, so an owner that will eventually stop it is a requirement
  // rather than a convention: without a scope there is nobody to unsubscribe.
  if (!getCurrentScope()) {
    throw new Error(
      'useStore must be called inside setup() or an active effectScope, which owns its subscription',
    )
  }

  const getStore = typeof source === 'function' ? source : () => source
  // Presence of a store decides the fallback, never the snapshot's value. A
  // field holding null or undefined is a real value, not an absent store.
  const initial = getStore()
  const state = shallowRef<T | undefined>(initial ? initial.getSnapshot() : fallback)

  const stop = watch(
    getStore,
    (store, _previous, onCleanup) => {
      if (!store) {
        state.value = fallback
        return
      }
      // Between the previous read and this subscribe the store may already
      // have moved, so seed from the snapshot rather than waiting for a
      // notification that has been and gone.
      state.value = store.getSnapshot()
      onCleanup(store.subscribe(() => { state.value = store.getSnapshot() }))
    },
    { immediate: true },
  )

  onScopeDispose(stop)

  return state
}

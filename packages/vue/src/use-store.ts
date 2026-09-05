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

  // A composable is normally called from `setup`, where the component's scope
  // owns teardown. Called outside one, `onScopeDispose` would warn and the
  // subscription would leak, so the caller gets the responsibility instead:
  // `watch` returns its own stop handle.
  if (getCurrentScope()) {
    onScopeDispose(stop)
  }

  return state
}

import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { NodeId, ValidationError } from '@texaryn/core'
import { useFormRuntime } from './context.js'
import { useStore } from './use-store.js'

export interface UseFieldReturn {
  value: Ref<unknown>
  errors: Ref<ValidationError[]>
  dirty: Ref<boolean>
  touched: Ref<boolean>
  visible: Ref<boolean>
  disabled: Ref<boolean>
  showErrors: Ref<boolean>
  onChange(value: unknown): void
  onBlur(): void
}

/**
 * The node id is accepted as a ref or getter, not a value, and that is load
 * bearing rather than a convenience.
 *
 * Node ids are assigned by traversal order, so an array item's id follows its
 * position. Item identity is carried separately, by `StableItemId`, and a
 * widget keyed on that correctly survives a move with its component instance
 * intact while the id underneath it changes. React re-reads the id on every
 * render, so it follows along for free. A Vue composable that captured the id
 * in `setup` would keep subscribing to the old position and, worse, keep
 * dispatching to it: typing into a moved row would write to the row that took
 * its place.
 */
export function useField(nodeId: MaybeRefOrGetter<NodeId>): UseFieldReturn {
  const runtime = useFormRuntime()
  const document = useStore(runtime.document, runtime.document.getSnapshot())

  // `getNodeState` is a map lookup, so nothing about it is reactive on its
  // own. Reading the document ref here is what makes a recompile re-resolve
  // the bundle: a node id that disappeared and came back is a different
  // bundle, and without this the field would hold the discarded one.
  const state = computed(() => {
    void document.value
    return runtime.getNodeState(toValue(nodeId))
  })

  return {
    value: useStore(() => state.value?.value, undefined),
    errors: useStore(() => state.value?.errors, [] as ValidationError[]),
    dirty: useStore(() => state.value?.dirty, false),
    touched: useStore(() => state.value?.touched, false),
    visible: useStore(() => state.value?.visible, true),
    disabled: useStore(() => state.value?.disabled, false),
    showErrors: useStore(() => state.value?.showErrors, false),
    // Read at call time, never captured. Subscriptions following the id is
    // only half of it: a dispatch carrying a stale id writes to the wrong
    // data pointer, and no amount of correct reading would show it.
    onChange: (value: unknown) => {
      runtime.dispatch({ type: 'SetValue', nodeId: toValue(nodeId), value })
    },
    onBlur: () => {
      runtime.dispatch({ type: 'SetTouched', nodeId: toValue(nodeId) })
    },
  }
}

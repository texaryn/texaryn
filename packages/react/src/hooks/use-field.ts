import { useCallback } from 'react'
import { createStore } from '@texaryn/core'
import type { NodeId, ValidationError } from '@texaryn/core'
import { useFormContext } from '../context.js'
import { useStore } from './use-store.js'

export interface UseFieldReturn {
  value: unknown
  errors: ValidationError[]
  dirty: boolean
  touched: boolean
  visible: boolean
  disabled: boolean
  onChange(value: unknown): void
  onBlur(): void
}

// Module-level singletons so useStore always receives the same store
// reference for a missing node, keeping useSyncExternalStore stable
// across renders instead of resubscribing to a fresh store every time.
const FALLBACK_VALUE = createStore<unknown>(undefined)
const FALLBACK_ERRORS = createStore<ValidationError[]>([])
const FALLBACK_DIRTY = createStore(false)
const FALLBACK_TOUCHED = createStore(false)
const FALLBACK_VISIBLE = createStore(true)
const FALLBACK_DISABLED = createStore(false)
const FALLBACK_VALIDATION_STATUS = createStore<'idle' | 'pending' | 'valid' | 'invalid'>('idle')

export function useField(nodeId: NodeId): UseFieldReturn {
  const runtime = useFormContext()
  const nodeState = runtime.getNodeState(nodeId)

  const value = useStore(nodeState?.value ?? FALLBACK_VALUE)
  const errors = useStore(nodeState?.errors ?? FALLBACK_ERRORS)
  const dirty = useStore(nodeState?.dirty ?? FALLBACK_DIRTY)
  const touched = useStore(nodeState?.touched ?? FALLBACK_TOUCHED)
  const visible = useStore(nodeState?.visible ?? FALLBACK_VISIBLE)
  const disabled = useStore(nodeState?.disabled ?? FALLBACK_DISABLED)
  // Subscribed for re-render parity with the other six node stores, even
  // though validation status is not part of this hook's return value.
  useStore(nodeState?.validationStatus ?? FALLBACK_VALIDATION_STATUS)

  const onChange = useCallback(
    (newValue: unknown) => { runtime.dispatch({ type: 'SetValue', nodeId, value: newValue }) },
    [runtime, nodeId],
  )

  const onBlur = useCallback(
    () => { runtime.dispatch({ type: 'SetTouched', nodeId }) },
    [runtime, nodeId],
  )

  return { value, errors, dirty, touched, visible, disabled, onChange, onBlur }
}

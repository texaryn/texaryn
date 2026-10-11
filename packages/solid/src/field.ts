import { createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { FieldNode, NodeId, Store, ValidationError } from '@texaryn/core'
import { useFormContext } from './context.js'

const NO_ERRORS: ValidationError[] = []

function makeId(prefix: string, nodeId: string, suffix: string): string {
  return `${prefix}-${nodeId}-${suffix}`
}

export function createFieldBinding(nodeId: Accessor<NodeId>) {
  const context = useFormContext()
  const node = createMemo(() => {
    const current = context.document().nodes[nodeId()]
    return current?.type === 'field' ? current as FieldNode : undefined
  })

  function state<T>(select: (id: NodeId) => Store<T> | undefined, fallback: T): Accessor<T> {
    const [snapshot, setSnapshot] = createSignal(fallback, { equals: false })
    createEffect(() => {
      const store = select(nodeId())
      if (!store) {
        setSnapshot(() => fallback)
        return
      }
      setSnapshot(() => store.getSnapshot())
      onCleanup(store.subscribe(() => setSnapshot(() => store.getSnapshot())))
    })
    return snapshot
  }

  const value = state((id) => context.form().getNodeState(id)?.value, undefined)
  const errors = state((id) => context.form().getNodeState(id)?.errors, NO_ERRORS)
  const dirty = state((id) => context.form().getNodeState(id)?.dirty, false)
  const touched = state((id) => context.form().getNodeState(id)?.touched, false)
  const visible = state((id) => context.form().getNodeState(id)?.visible, true)
  const disabled = state((id) => context.form().getNodeState(id)?.disabled, false)
  const showErrors = state((id) => context.form().getNodeState(id)?.showErrors, false)
  const visibleErrors = createMemo(() => showErrors() ? errors() : NO_ERRORS)
  const label = createMemo(() => node()?.annotations.title ?? node()?.dataPointer ?? node()?.id ?? '')
  const description = createMemo(() => node()?.helpText ?? node()?.annotations.description)
  const inputId = createMemo(() => makeId(context.idPrefix(), node()?.id ?? nodeId(), 'input'))
  const descriptionId = createMemo(() => makeId(context.idPrefix(), node()?.id ?? nodeId(), 'description'))
  const errorId = createMemo(() => makeId(context.idPrefix(), node()?.id ?? nodeId(), 'error'))
  const invalid = createMemo(() => visibleErrors().length > 0)
  const describedBy = createMemo(() => [
    description() ? descriptionId() : undefined,
    invalid() ? errorId() : undefined,
  ].filter(Boolean).join(' ') || undefined)
  const display = createMemo(() => {
    const current = value()
    return typeof current === 'number' ? current : current == null ? '' : String(current)
  })

  function setValue(next: unknown): void {
    if (node()?.readOnly) return
    context.form().dispatch({ type: 'SetValue', nodeId: nodeId(), value: next })
  }

  function setRaw(raw: string, enumIndex?: string): void {
    const current = node()
    if (!current || current.readOnly) return
    if (current.enumValues?.length) {
      const index = Number(enumIndex)
      if (Number.isInteger(index) && index >= 0 && current.enumValues[index]) {
        setValue(current.enumValues[index]!.value)
      }
      return
    }
    if (current.fieldType === 'number' || current.fieldType === 'integer') {
      setValue(raw === '' ? undefined : Number(raw))
    } else {
      setValue(raw)
    }
  }

  function onBlur(): void {
    context.form().dispatch({ type: 'SetTouched', nodeId: nodeId() })
  }

  return {
    node, value, errors, visibleErrors, dirty, touched, visible, disabled,
    showErrors, label, description, inputId, descriptionId, errorId,
    invalid, describedBy, display, setRaw, setValue, onBlur,
  }
}

export const useField = createFieldBinding

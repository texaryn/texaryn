import { derived, get } from 'svelte/store'
import type { Readable } from 'svelte/store'
import type { FieldNode, NodeId, Store, ValidationError } from '@texaryn/core'
import type { FormMessages } from '@texaryn/core'
import type { SvelteFormBinding } from './form.js'
import type { FieldAria } from './field-props.js'
import { fieldAria, fieldLabel, makeId } from './field-props.js'

export type FieldKind = 'enum' | 'boolean' | 'number' | 'string'

export interface SvelteFieldBinding {
  node: Readable<FieldNode | undefined>
  value: Readable<unknown>
  errors: Readable<ValidationError[]>
  visibleErrors: Readable<readonly ValidationError[]>
  dirty: Readable<boolean>
  touched: Readable<boolean>
  visible: Readable<boolean>
  disabled: Readable<boolean>
  showErrors: Readable<boolean>
  kind: Readable<FieldKind>
  display: Readable<string | number>
  label: Readable<string>
  description: Readable<string | undefined>
  labelFor: Readable<string>
  descriptionId: Readable<string>
  errorId: Readable<string>
  aria: Readable<FieldAria | undefined>
  messages: Readable<FormMessages>
  setRaw(raw: string, enumToken?: string): void
  setValue(value: unknown): void
  onBlur(): void
}

const NO_ERRORS: ValidationError[] = []

export function createFieldBinding(
  form: SvelteFormBinding,
  nodeId: Readable<NodeId>,
  idPrefix: string,
  messages: Readable<FormMessages>,
): SvelteFieldBinding {
  const node = derived([form.document, nodeId], ([$document, id]) => {
    const current = $document.nodes[id]
    return current?.type === 'field' ? (current as FieldNode) : undefined
  })
  const fromNodeState = <T>(
    select: (nodeId: NodeId) => Store<T> | undefined,
    fallback: T,
  ): Readable<T> => derived(
    [form.document, nodeId],
    ([_document, id], set) => {
      const store = select(id)
      if (!store) {
        set(fallback)
        return
      }
      set(store.getSnapshot())
      return store.subscribe(() => set(store.getSnapshot()))
    },
    fallback,
  )
  const value = fromNodeState((id) => form.getNodeState(id)?.value, undefined)
  const errors = fromNodeState((id) => form.getNodeState(id)?.errors, NO_ERRORS)
  const dirty = fromNodeState((id) => form.getNodeState(id)?.dirty, false)
  const touched = fromNodeState((id) => form.getNodeState(id)?.touched, false)
  const visible = fromNodeState((id) => form.getNodeState(id)?.visible, true)
  const disabled = fromNodeState((id) => form.getNodeState(id)?.disabled, false)
  const showErrors = fromNodeState((id) => form.getNodeState(id)?.showErrors, false)
  const kind = derived(node, ($node) => fieldKind($node))
  const visibleErrors = derived([showErrors, errors], ([$showErrors, $errors]) =>
    $showErrors ? $errors : NO_ERRORS,
  )
  const display = derived([kind, value], ([$kind, $value]) => displayValue($kind, $value))
  const label = derived(node, ($node) => $node ? fieldLabel($node) : '')
  const description = derived(node, ($node) => $node?.helpText ?? $node?.annotations.description)
  const labelFor = derived(node, ($node) => makeId(idPrefix, $node?.id ?? get(nodeId), 'input'))
  const descriptionId = derived(node, ($node) => makeId(idPrefix, $node?.id ?? get(nodeId), 'description'))
  const errorId = derived(node, ($node) => makeId(idPrefix, $node?.id ?? get(nodeId), 'error'))
  const aria = derived([node, disabled, showErrors, errors], ([$node, $disabled, $showErrors, $errors]) =>
    $node ? fieldAria($node, { disabled: $disabled, showErrors: $showErrors, errors: $errors }, idPrefix, $node.enumValues == null && $node.fieldType !== 'boolean') : undefined,
  )

  function setRaw(raw: string, enumToken?: string): void {
    const current = get(node)
    if (!current || current.readOnly) return
    const fieldKindValue = fieldKind(current)
    if (fieldKindValue === 'enum') {
      const index = Number(enumToken)
      if (!Number.isInteger(index) || index < 0) return
      const option = current.enumValues?.[index]
      if (option) setValue(option.value)
      return
    }
    if (fieldKindValue === 'number') {
      setValue(raw === '' ? undefined : Number(raw))
      return
    }
    setValue(raw)
  }

  function setValue(next: unknown): void {
    const current = get(node)
    if (!current || current.readOnly) return
    form.dispatch({ type: 'SetValue', nodeId: get(nodeId), value: next })
  }

  function onBlur(): void {
    form.dispatch({ type: 'SetTouched', nodeId: get(nodeId) })
  }

  return {
    node,
    value,
    errors,
    visibleErrors,
    dirty,
    touched,
    visible,
    disabled,
    showErrors,
    kind,
    display,
    label,
    description,
    labelFor,
    descriptionId,
    errorId,
    aria,
    messages,
    setRaw,
    setValue,
    onBlur,
  }
}

export function fieldKind(node: FieldNode | undefined): FieldKind {
  if (!node) return 'string'
  if (node.enumValues != null && node.enumValues.length > 0) return 'enum'
  if (node.fieldType === 'boolean') return 'boolean'
  if (node.fieldType === 'number' || node.fieldType === 'integer') return 'number'
  return 'string'
}

export function displayValue(kind: FieldKind, value: unknown): string | number {
  if (kind === 'number' && typeof value === 'number') return value
  if (kind === 'string' && typeof value === 'string') return value
  return value == null ? '' : String(value)
}

export function sameEnumValue(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((entry, index) => sameEnumValue(entry, right[index]))
  }
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false
  const leftKeys = Object.keys(left as object).sort()
  const rightKeys = Object.keys(right as object).sort()
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) =>
    key === rightKeys[index] && sameEnumValue(
      (left as Record<string, unknown>)[key],
      (right as Record<string, unknown>)[key],
    ),
  )
}

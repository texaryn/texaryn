import { computed } from '@angular/core'
import type { Signal } from '@angular/core'
import type { FieldNode, FormMessages, ValidationError } from '@texaryn/core'
import { englishMessages } from '@texaryn/core'
import { useFormContext } from './context.js'
import { fieldAria, fieldLabel, makeId } from './field-props.js'
import type { FieldAria } from './field-props.js'
import { useDynamicStore } from './store.js'
import type { AngularWidget } from './widget.js'

export type FieldKind = 'enum' | 'boolean' | 'number' | 'string'

export function fieldKind(node: FieldNode): FieldKind {
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

export function coerce(kind: FieldKind, node: FieldNode, raw: string): unknown {
  if (kind === 'number') return raw === '' ? undefined : Number(raw)
  if (kind === 'enum') {
    const option = (node.enumValues ?? []).find((entry) => String(entry.value) === raw)
    return option ? option.value : raw
  }
  return raw
}

export interface FieldWidget {
  node: Signal<FieldNode>
  kind: Signal<FieldKind>
  value: Signal<unknown>
  display: Signal<string | number>
  label: Signal<string>
  description: Signal<string | undefined>
  descriptionId: Signal<string>
  errorId: Signal<string>
  labelFor: Signal<string>
  aria: Signal<FieldAria>
  messages: Signal<FormMessages>
  errors: Signal<readonly ValidationError[]>
  invalid: Signal<boolean>
  setRaw(raw: string): void
  setValue(value: unknown): void
  onBlur(): void
}

const NO_ERRORS: ValidationError[] = []

export function useFieldWidget(nodeSource: AngularWidget['node']): FieldWidget {
  const context = useFormContext()
  const node = computed(() => nodeSource() as FieldNode)
  const kind = computed(() => fieldKind(node()))
  const nodeState = computed(() => {
    const form = context.form()
    form.document()
    return form.getNodeState(node().id)
  })
  const value = useDynamicStore(() => nodeState()?.value, undefined)
  const errors = useDynamicStore(() => nodeState()?.errors, NO_ERRORS)
  const disabled = useDynamicStore(() => nodeState()?.disabled, false)
  const showErrors = useDynamicStore(() => nodeState()?.showErrors, false)
  const idPrefix = computed(() => context.idPrefix())
  const messages = computed(() => context.messages() ?? englishMessages)
  const visibleErrors = computed(() => showErrors() ? errors() : NO_ERRORS)

  return {
    node,
    kind,
    value,
    display: computed(() => displayValue(kind(), value())),
    label: computed(() => fieldLabel(node())),
    description: computed(() => node().helpText ?? node().annotations.description),
    descriptionId: computed(() => makeId(idPrefix(), node().id, 'description')),
    errorId: computed(() => makeId(idPrefix(), node().id, 'error')),
    labelFor: computed(() => makeId(idPrefix(), node().id, 'input')),
    aria: computed(() => fieldAria(
      node(),
      { disabled: disabled(), showErrors: showErrors(), errors: errors() },
      idPrefix(),
      kind() !== 'enum' && kind() !== 'boolean',
    )),
    messages,
    errors: visibleErrors,
    invalid: computed(() => visibleErrors().length > 0),
    setRaw: (raw) => {
      const current = node()
      if (current.readOnly) return
      context.form().dispatch({
        type: 'SetValue',
        nodeId: current.id,
        value: coerce(kind(), current, raw),
      })
    },
    setValue: (next) => {
      const current = node()
      if (current.readOnly) return
      context.form().dispatch({ type: 'SetValue', nodeId: current.id, value: next })
    },
    onBlur: () => context.form().dispatch({ type: 'SetTouched', nodeId: node().id }),
  }
}

import { computed } from 'vue'
import type { ComputedRef, MaybeRefOrGetter, Ref } from 'vue'
import { toValue } from 'vue'
import type { FieldNode, ValidationError } from '@texaryn/core'
import { useField } from './use-field.js'
import { fieldAria, fieldLabel, makeId } from './field-props.js'
import type { FieldAria } from './field-props.js'

const NO_ERRORS: readonly ValidationError[] = Object.freeze<ValidationError[]>([])

export type FieldKind = 'enum' | 'boolean' | 'number' | 'string'

// Mirrors the default registry's ranking: enum outranks the primitive kind.
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
    const option = (node.enumValues ?? []).find((o) => String(o.value) === raw)
    return option ? option.value : raw
  }
  return raw
}

export interface FieldWidget {
  node: ComputedRef<FieldNode>
  kind: ComputedRef<FieldKind>
  value: Ref<unknown>
  display: ComputedRef<string | number>
  label: ComputedRef<string>
  description: ComputedRef<string | undefined>
  descriptionId: ComputedRef<string>
  errorId: ComputedRef<string>
  labelFor: ComputedRef<string>
  aria: ComputedRef<FieldAria>
  /** Visible errors only: empty until the display policy says to show them. */
  errors: ComputedRef<readonly ValidationError[]>
  invalid: ComputedRef<boolean>
  setRaw(raw: string): void
  setValue(value: unknown): void
  onBlur(): void
}

/**
 * Everything a native widget needs, derived from a node that is allowed to
 * change under it. The node arrives as a getter for the same reason the node
 * id does in useField: an array move hands a widget a different node while
 * keeping its component instance.
 */
export function useFieldWidget(nodeSource: MaybeRefOrGetter<FieldNode>): FieldWidget {
  const node = computed(() => toValue(nodeSource))
  const field = useField(() => node.value.id)
  const kind = computed(() => fieldKind(node.value))

  const errors = computed(() => (field.showErrors.value ? field.errors.value : NO_ERRORS))
  const invalid = computed(() => errors.value.length > 0)

  return {
    node,
    kind,
    value: field.value,
    display: computed(() => displayValue(kind.value, field.value.value)),
    label: computed(() => fieldLabel(node.value)),
    description: computed(() => node.value.helpText ?? node.value.annotations.description),
    descriptionId: computed(() => makeId(node.value.id, 'description')),
    errorId: computed(() => makeId(node.value.id, 'error')),
    labelFor: computed(() => makeId(node.value.id, 'input')),
    aria: computed(() =>
      fieldAria(node.value, {
        disabled: field.disabled.value,
        showErrors: field.showErrors.value,
        errors: field.errors.value,
      }),
    ),
    errors,
    invalid,
    setRaw: (raw: string) => { field.onChange(coerce(kind.value, node.value, raw)) },
    setValue: field.onChange,
    onBlur: field.onBlur,
  }
}

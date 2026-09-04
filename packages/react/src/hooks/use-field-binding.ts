import type { FieldNode, ValidationError } from '@texaryn/core'
import { useField } from './use-field.js'
import {
  getInputProps,
  getLabelProps,
  getErrorProps,
  getDescriptionProps,
} from '../props/field-props.js'
import type { LabelProps, ErrorProps, DescriptionProps } from '../props/field-props.js'

export interface DomInputBaseProps {
  id: string
  name: string
  disabled: boolean
  'aria-required': boolean
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  placeholder?: string
  onBlur(): void
}

/** Value-shaped surface for text, number, textarea and select controls. */
export interface DomValueInputProps extends DomInputBaseProps {
  value: string | number
  onChange(event: { target: { value: string } }): void
}

/** Checked-shaped surface for checkbox controls. */
export interface DomCheckedInputProps extends DomInputBaseProps {
  checked: boolean
  onChange(event: { target: { checked: boolean } }): void
}

export interface FieldBinding {
  node: FieldNode

  value: unknown
  setValue(value: unknown): void
  onBlur(): void

  touched: boolean
  dirty: boolean
  disabled: boolean
  visible: boolean
  /** Derived from the node for adapters. `aria-required` stays owned by getInputProps. */
  required: boolean

  label: string
  description: string | undefined
  placeholder: string | undefined

  /** Visible errors only: empty until the field is touched and invalid. */
  errors: ValidationError[]
  /** First visible error as `message ?? keyword`. */
  error: string | undefined
  invalid: boolean

  labelProps: LabelProps
  descriptionProps: DescriptionProps
  errorProps: ErrorProps
  domInputProps: DomValueInputProps
  domCheckboxProps: DomCheckedInputProps
}

const NO_ERRORS: ValidationError[] = []

type FieldKind = 'enum' | 'boolean' | 'number' | 'string'

// Mirrors createDefaultRegistry: enum outranks the primitive kind.
function fieldKind(node: FieldNode): FieldKind {
  if (node.enumValues != null && node.enumValues.length > 0) return 'enum'
  if (node.fieldType === 'boolean') return 'boolean'
  if (node.fieldType === 'number' || node.fieldType === 'integer') return 'number'
  return 'string'
}

function displayValue(kind: FieldKind, value: unknown): string | number {
  if (kind === 'number' && typeof value === 'number') return value
  if (kind === 'string' && typeof value === 'string') return value
  return value == null ? '' : String(value)
}

function coerce(kind: FieldKind, node: FieldNode, raw: string): unknown {
  if (kind === 'number') return raw === '' ? undefined : Number(raw)
  if (kind === 'enum') {
    const option = (node.enumValues ?? []).find((o) => String(o.value) === raw)
    return option ? option.value : raw
  }
  return raw
}

export function useFieldBinding(node: FieldNode): FieldBinding {
  const field = useField(node.id)
  const input = getInputProps(node, field)
  const kind = fieldKind(node)

  const base: DomInputBaseProps = {
    id: input.id,
    name: input.name,
    disabled: input.disabled,
    'aria-required': input['aria-required'],
    'aria-invalid': input['aria-invalid'],
    'aria-describedby': input['aria-describedby'],
    placeholder: input.placeholder,
    onBlur: input.onBlur,
  }

  const domInputProps: DomValueInputProps = {
    ...base,
    value: displayValue(kind, field.value),
    onChange: (event: { target: { value: string } }) =>
      field.onChange(coerce(kind, node, event.target.value)),
  }

  const domCheckboxProps: DomCheckedInputProps = {
    ...base,
    checked: Boolean(field.value),
    onChange: (event: { target: { checked: boolean } }) =>
      field.onChange(event.target.checked),
  }

  const errors = field.showErrors ? field.errors : NO_ERRORS
  const first = errors[0]

  return {
    node,
    value: field.value,
    setValue: field.onChange,
    onBlur: field.onBlur,
    touched: field.touched,
    dirty: field.dirty,
    disabled: field.disabled,
    visible: field.visible,
    required: Boolean(node.constraints.required),
    label: node.annotations.title ?? node.dataPointer ?? node.id,
    description: node.helpText ?? node.annotations.description,
    placeholder: node.placeholder,
    errors,
    error: first ? first.message ?? first.keyword : undefined,
    invalid: errors.length > 0,
    labelProps: getLabelProps(node),
    descriptionProps: getDescriptionProps(node),
    errorProps: getErrorProps(node),
    domInputProps,
    domCheckboxProps,
  }
}

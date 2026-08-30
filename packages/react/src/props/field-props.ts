import type { FieldNode } from '@texaryn/core'

/**
 * Field state shape (from useField hook return)
 */
export interface FieldState {
  value: unknown
  errors: Array<{ instancePointer: string; keyword: string; message?: string; params: Record<string, unknown> }>
  dirty: boolean
  touched: boolean
  visible: boolean
  disabled: boolean
  onChange: (value: unknown) => void
  onBlur: () => void
}

/**
 * HTML/ARIA attributes for an input element
 */
export interface InputProps extends Record<string, unknown> {
  id: string
  name: string
  value: unknown
  disabled: boolean
  'aria-required': boolean
  'aria-invalid': boolean
  'aria-describedby'?: string
  onChange: (value: unknown) => void
  onBlur: () => void
}

/**
 * HTML/ARIA attributes for a label element
 */
export interface LabelProps extends Record<string, unknown> {
  id: string
  htmlFor: string
}

/**
 * HTML/ARIA attributes for an error container
 */
export interface ErrorProps extends Record<string, unknown> {
  id: string
  role: 'alert'
  'aria-live': 'polite'
}

/**
 * HTML/ARIA attributes for a description element
 */
export interface DescriptionProps extends Record<string, unknown> {
  id: string
}

/**
 * Generate deterministic element ID from NodeId
 */
function makeId(nodeId: string, suffix: string): string {
  return `texaryn-${nodeId}-${suffix}`
}

/**
 * getInputProps: Returns ARIA-correct props for an input element
 * Includes id, name, value, disabled, aria-required, aria-invalid, aria-describedby
 */
export function getInputProps(node: FieldNode, fieldState: FieldState): InputProps {
  const id = makeId(node.id, 'input')
  const hasErrors = fieldState.errors.length > 0
  const hasDescription = Boolean(node.annotations?.description)

  // Build aria-describedby from error and description IDs
  const describedByIds: string[] = []
  if (hasErrors) {
    describedByIds.push(makeId(node.id, 'error'))
  }
  if (hasDescription) {
    describedByIds.push(makeId(node.id, 'description'))
  }

  return {
    id,
    name: node.dataPointer || node.id,
    value: fieldState.value,
    disabled: fieldState.disabled,
    'aria-required': Boolean(node.constraints?.required),
    'aria-invalid': hasErrors,
    'aria-describedby': describedByIds.length > 0 ? describedByIds.join(' ') : undefined,
    onChange: fieldState.onChange,
    onBlur: fieldState.onBlur,
  }
}

/**
 * getLabelProps: Returns ARIA-correct props for a label element
 */
export function getLabelProps(node: FieldNode): LabelProps {
  return {
    id: makeId(node.id, 'label'),
    htmlFor: makeId(node.id, 'input'),
  }
}

/**
 * getErrorProps: Returns ARIA-correct props for an error container
 */
export function getErrorProps(node: FieldNode): ErrorProps {
  return {
    id: makeId(node.id, 'error'),
    role: 'alert',
    'aria-live': 'polite',
  }
}

/**
 * getDescriptionProps: Returns ARIA-correct props for a description element
 */
export function getDescriptionProps(node: FieldNode): DescriptionProps {
  return {
    id: makeId(node.id, 'description'),
  }
}

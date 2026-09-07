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
  showErrors: boolean
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
  /** Native `readonly`, set only on a control HTML honours it for. */
  readOnly?: boolean
  /** Set instead where HTML has no native read-only, so select and checkbox. */
  'aria-readonly'?: true
  'aria-required': boolean
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  placeholder?: string
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
 * HTML/ARIA attributes for an error container.
 *
 * The container is a live region that exists from mount and is empty while the
 * field is valid, because a region inserted with its content already in place
 * is not reliably announced. It is polite rather than an alert: validation runs
 * on change, blur and submit, so assertive would interrupt typing and would
 * speak once per failing field on submit.
 */
export interface ErrorProps extends Record<string, unknown> {
  id: string
  'aria-live': 'polite'
  'aria-atomic': true
}

/**
 * HTML/ARIA attributes for a description element
 */
export interface DescriptionProps extends Record<string, unknown> {
  id: string
}

export function makeId(idPrefix: string, nodeId: string, suffix: string): string {
  return `${idPrefix}-${nodeId}-${suffix}`
}

/**
 * HTML honours `readonly` on text, number and textarea only. A select or a
 * checkbox says so through ARIA instead, and the widget refuses the change.
 * Shared with useFieldBinding so the two public surfaces cannot drift apart.
 */
export function hasNativeReadOnly(node: FieldNode): boolean {
  if (node.enumValues != null && node.enumValues.length > 0) return false
  return node.fieldType !== 'boolean'
}

/**
 * getInputProps: Returns ARIA-correct props for an input element
 * Includes id, name, value, disabled, aria-required, aria-invalid, aria-describedby
 */
export function getInputProps(
  node: FieldNode,
  fieldState: FieldState,
  idPrefix: string,
): InputProps {
  const id = makeId(idPrefix, node.id, 'input')
  const hasDescription = Boolean(node.helpText ?? node.annotations?.description)

  // Build aria-describedby from description and error IDs, in that order
  const describedByIds: string[] = []
  if (hasDescription) {
    describedByIds.push(makeId(idPrefix, node.id, 'description'))
  }
  if (fieldState.showErrors && fieldState.errors.length > 0) {
    describedByIds.push(makeId(idPrefix, node.id, 'error'))
  }

  const props: InputProps = {
    id,
    name: node.dataPointer || node.id,
    value: fieldState.value,
    disabled: fieldState.disabled,
    ...(node.readOnly
      ? hasNativeReadOnly(node)
        ? { readOnly: true }
        : { 'aria-readonly': true as const }
      : {}),
    'aria-required': Boolean(node.constraints?.required),
    'aria-describedby': describedByIds.length > 0 ? describedByIds.join(' ') : undefined,
    onChange: fieldState.onChange,
    onBlur: fieldState.onBlur,
  }

  if (fieldState.showErrors && fieldState.errors.length > 0) {
    props['aria-invalid'] = true
  }

  if (node.placeholder != null) {
    props.placeholder = node.placeholder
  }

  return props
}

/**
 * getLabelProps: Returns ARIA-correct props for a label element
 */
export function getLabelProps(node: FieldNode, idPrefix: string): LabelProps {
  return {
    id: makeId(idPrefix, node.id, 'label'),
    htmlFor: makeId(idPrefix, node.id, 'input'),
  }
}

/**
 * getErrorProps: Returns ARIA-correct props for an error container
 */
export function getErrorProps(node: FieldNode, idPrefix: string): ErrorProps {
  return {
    id: makeId(idPrefix, node.id, 'error'),
    'aria-live': 'polite',
    'aria-atomic': true,
  }
}

/**
 * getDescriptionProps: Returns ARIA-correct props for a description element
 */
export function getDescriptionProps(node: FieldNode, idPrefix: string): DescriptionProps {
  return {
    id: makeId(idPrefix, node.id, 'description'),
  }
}

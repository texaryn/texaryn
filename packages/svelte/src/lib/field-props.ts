import type { FieldNode, ValidationError } from '@texaryn/core'

export interface FieldAria {
  id: string
  name: string
  disabled: boolean
  readonly?: boolean
  'aria-readonly'?: true
  'aria-required': boolean
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  placeholder?: string
}

export function makeId(idPrefix: string, nodeId: string, suffix: string): string {
  return `${idPrefix}-${nodeId}-${suffix}`
}

export function fieldAria(
  node: FieldNode,
  state: { disabled: boolean; showErrors: boolean; errors: readonly ValidationError[] },
  idPrefix: string,
  nativeReadOnly = true,
): FieldAria {
  const describedBy: string[] = []
  if (node.helpText ?? node.annotations?.description) {
    describedBy.push(makeId(idPrefix, node.id, 'description'))
  }

  const invalid = state.showErrors && state.errors.length > 0
  if (invalid) describedBy.push(makeId(idPrefix, node.id, 'error'))

  const readOnly = node.readOnly
    ? nativeReadOnly
      ? { readonly: true }
      : { 'aria-readonly': true as const }
    : {}

  return {
    id: makeId(idPrefix, node.id, 'input'),
    name: node.dataPointer || node.id,
    disabled: state.disabled,
    ...readOnly,
    'aria-required': Boolean(node.constraints?.required),
    'aria-invalid': invalid ? true : undefined,
    'aria-describedby': describedBy.length > 0 ? describedBy.join(' ') : undefined,
    placeholder: node.placeholder ?? undefined,
  }
}

export function fieldLabel(node: FieldNode): string {
  return node.annotations.title ?? node.dataPointer ?? node.id
}

import type { FieldNode, ValidationError } from '@texaryn/core'

/**
 * The accessible attribute surface for a field, derived from the node and its
 * current state.
 *
 * This is a deliberate reimplementation of `@texaryn/react`'s prop getters
 * rather than an import of them: this package must not depend on the React
 * binding, and the slice exists to find out what the two genuinely share.
 * Nothing here is Vue specific, which makes it the first candidate for a
 * framework-neutral home. That move waits for evidence from a second
 * consumer, not from this file existing.
 */
export interface FieldAria {
  id: string
  name: string
  disabled: boolean
  'aria-required': boolean
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  placeholder?: string
}

export function makeId(nodeId: string, suffix: string): string {
  return `texaryn-${nodeId}-${suffix}`
}

export function fieldAria(
  node: FieldNode,
  state: { disabled: boolean; showErrors: boolean; errors: readonly ValidationError[] },
): FieldAria {
  const describedBy: string[] = []
  if (node.helpText ?? node.annotations?.description) {
    describedBy.push(makeId(node.id, 'description'))
  }

  const invalid = state.showErrors && state.errors.length > 0
  if (invalid) {
    describedBy.push(makeId(node.id, 'error'))
  }

  return {
    id: makeId(node.id, 'input'),
    name: node.dataPointer || node.id,
    disabled: state.disabled,
    'aria-required': Boolean(node.constraints?.required),
    'aria-invalid': invalid ? true : undefined,
    'aria-describedby': describedBy.length > 0 ? describedBy.join(' ') : undefined,
    placeholder: node.placeholder ?? undefined,
  }
}

export function fieldLabel(node: FieldNode): string {
  return node.annotations.title ?? node.dataPointer ?? node.id
}

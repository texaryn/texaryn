import type { FieldNode, ValidationError } from '@texaryn/core'
import { getErrorProps } from '../props/index.js'
import { useFormIdPrefix } from '../id-prefix.js'
import { useFormMessages } from '../messages.js'

export interface FieldErrorsProps {
  node: FieldNode
  errors: readonly ValidationError[]
  showErrors: boolean
}

function validationErrorKey(error: ValidationError, occurrences: Map<string, number>): string {
  const identity = JSON.stringify([error.instancePointer, error.keyword, error.params])
  const occurrence = occurrences.get(identity) ?? 0
  occurrences.set(identity, occurrence + 1)
  return `${identity}:${occurrence}`
}

/**
 * Always rendered, and empty while there is nothing to say. Returning null
 * until an error exists meant the region arrived already populated, which is
 * the case screen readers do not reliably announce.
 */
export function FieldErrors({ node, errors, showErrors }: Readonly<FieldErrorsProps>) {
  const idPrefix = useFormIdPrefix()
  const messages = useFormMessages()
  const visible = showErrors ? errors : []
  const occurrences = new Map<string, number>()

  return (
    <div {...getErrorProps(node, idPrefix)}>
      {visible.map((error) => (
        <div key={validationErrorKey(error, occurrences)}>{messages.validationMessage(error)}</div>
      ))}
    </div>
  )
}

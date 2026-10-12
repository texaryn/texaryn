import type { FieldNode, ValidationError } from '@texaryn/core'
import { getErrorProps } from '../props/index.js'
import { useFormIdPrefix } from '../id-prefix.js'
import { useFormMessages } from '../messages.js'

export interface FieldErrorsProps {
  node: FieldNode
  errors: readonly ValidationError[]
  showErrors: boolean
}

/**
 * Always rendered, and empty while there is nothing to say. Returning null
 * until an error exists meant the region arrived already populated, which is
 * the case screen readers do not reliably announce.
 */
export function FieldErrors({ node, errors, showErrors }: FieldErrorsProps) {
  const idPrefix = useFormIdPrefix()
  const messages = useFormMessages()
  const visible = showErrors ? errors : []

  return (
    <div {...getErrorProps(node, idPrefix)}>
      {visible.map((error, index) => (
        <div key={index}>{messages.validationMessage(error)}</div>
      ))}
    </div>
  )
}

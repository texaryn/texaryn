import type { FieldNode, ValidationError } from '@texaryn/core'
import { getErrorProps } from '../props/index.js'

export interface FieldErrorsProps {
  node: FieldNode
  errors: ValidationError[]
  showErrors: boolean
}

export function FieldErrors({ node, errors, showErrors }: FieldErrorsProps) {
  if (!showErrors || errors.length === 0) {
    return null
  }

  const errorProps = getErrorProps(node)

  return (
    <div {...errorProps}>
      {errors.map((error, index) => (
        <div key={index}>{error.message ?? error.keyword}</div>
      ))}
    </div>
  )
}

import React from 'react'
import type { FieldNode, UINode } from '@texaryn/core'
import { useFieldBinding } from '../hooks/use-field-binding.js'
import { FieldErrors } from '../components/FieldErrors.js'

export interface WidgetProps {
  node: UINode
}

function NumberInputImpl({ node }: WidgetProps) {
  const field = useFieldBinding(node as FieldNode)

  return (
    <div>
      <label {...field.labelProps}>{field.label}</label>
      <input {...field.domInputProps} type="number" />
      {field.description ? <div {...field.descriptionProps}>{field.description}</div> : null}
      <FieldErrors node={field.node} errors={field.errors} showErrors={field.invalid} />
    </div>
  )
}

export const NumberInput = React.memo(
  NumberInputImpl,
  (prev, next) => prev.node.id === next.node.id,
)

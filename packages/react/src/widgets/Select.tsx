import React from 'react'
import type { FieldNode, UINode } from '@texaryn/core'
import { useFieldBinding } from '../hooks/use-field-binding.js'
import { FieldErrors } from '../components/FieldErrors.js'

export interface WidgetProps {
  node: UINode
}

function SelectImpl({ node }: WidgetProps) {
  const field = useFieldBinding(node as FieldNode)
  const enumValues = field.node.enumValues ?? []

  return (
    <div>
      <label {...field.labelProps}>{field.label}</label>
      <select {...field.domInputProps}>
        {enumValues.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.title ?? String(option.value)}
          </option>
        ))}
      </select>
      {field.description ? <div {...field.descriptionProps}>{field.description}</div> : null}
      <FieldErrors node={field.node} errors={field.errors} showErrors={field.invalid} />
    </div>
  )
}

export const Select = React.memo(
  SelectImpl,
  (prev, next) => prev.node.id === next.node.id,
)

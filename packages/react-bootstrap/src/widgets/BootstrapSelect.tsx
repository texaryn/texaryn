import React from 'react'
import type { FieldNode, UINode } from '@texaryn/core'
import { useFieldBinding } from '@texaryn/react'
import { BootstrapFeedback } from './BootstrapFeedback.js'

export interface WidgetProps {
  node: UINode
}

function BootstrapSelectImpl({ node }: WidgetProps) {
  const field = useFieldBinding(node as FieldNode)
  const enumValues = field.node.enumValues ?? []

  return (
    <div className="mb-3">
      <label {...field.labelProps} className="form-label">{field.label}</label>
      <select {...field.domInputProps} className={field.invalid ? 'form-select is-invalid' : 'form-select'}>
        {enumValues.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.title ?? String(option.value)}
          </option>
        ))}
      </select>
      <BootstrapFeedback field={field} />
    </div>
  )
}

export const BootstrapSelect = React.memo(BootstrapSelectImpl, (prev, next) => prev.node.id === next.node.id)

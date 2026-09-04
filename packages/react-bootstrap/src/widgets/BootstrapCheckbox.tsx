import React from 'react'
import type { FieldNode, UINode } from '@texaryn/core'
import { useFieldBinding } from '@texaryn/react'
import { BootstrapFeedback } from './BootstrapFeedback.js'

export interface WidgetProps {
  node: UINode
}

function BootstrapCheckboxImpl({ node }: WidgetProps) {
  const field = useFieldBinding(node as FieldNode)
  return (
    <div className="form-check mb-3">
      <input {...field.domCheckboxProps} type="checkbox" className={field.invalid ? 'form-check-input is-invalid' : 'form-check-input'} />
      <label {...field.labelProps} className="form-check-label">{field.label}</label>
      <BootstrapFeedback field={field} />
    </div>
  )
}

export const BootstrapCheckbox = React.memo(BootstrapCheckboxImpl, (prev, next) => prev.node.id === next.node.id)

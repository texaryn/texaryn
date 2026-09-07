import React from 'react'
import type { FieldNode, UINode } from '@texaryn/core'
import { FieldLabelContent, useFieldBinding } from '@texaryn/react'
import { BootstrapFeedback } from './BootstrapFeedback.js'

export interface WidgetProps {
  node: UINode
}

function BootstrapTextareaImpl({ node }: WidgetProps) {
  const field = useFieldBinding(node as FieldNode)
  return (
    <div className="mb-3">
      <label {...field.labelProps} className="form-label"><FieldLabelContent label={field.label} required={field.required} /></label>
      <textarea {...field.domInputProps} className={field.invalid ? 'form-control is-invalid' : 'form-control'} />
      <BootstrapFeedback field={field} />
    </div>
  )
}

export const BootstrapTextarea = React.memo(BootstrapTextareaImpl, (prev, next) => prev.node.id === next.node.id)

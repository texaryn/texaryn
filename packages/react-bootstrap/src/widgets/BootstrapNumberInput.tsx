import React from 'react'
import type { FieldNode, UINode } from '@texaryn/core'
import { FieldLabelContent, useFieldBinding } from '@texaryn/react'
import { BootstrapFeedback } from './BootstrapFeedback.js'

export interface WidgetProps {
  node: UINode
}

function BootstrapNumberInputImpl({ node }: WidgetProps) {
  const field = useFieldBinding(node as FieldNode)
  return (
    <div className="mb-3">
      <label {...field.labelProps} className="form-label"><FieldLabelContent label={field.label} required={field.required} /></label>
      <input {...field.domInputProps} type="number" className={field.invalid ? 'form-control is-invalid' : 'form-control'} />
      <BootstrapFeedback field={field} />
    </div>
  )
}

export const BootstrapNumberInput = React.memo(BootstrapNumberInputImpl, (prev, next) => prev.node.id === next.node.id)

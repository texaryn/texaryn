import React from 'react'
import type { FieldNode, UINode } from '@texaryn/core'
import { useFieldBinding } from '@texaryn/react'
import { BootstrapFeedback } from './BootstrapFeedback.js'

export interface WidgetProps {
  node: UINode
}

function BootstrapTextInputImpl({ node }: WidgetProps) {
  const field = useFieldBinding(node as FieldNode)
  return (
    <div className="mb-3">
      <label {...field.labelProps} className="form-label">{field.label}</label>
      <input {...field.domInputProps} type="text" className={field.invalid ? 'form-control is-invalid' : 'form-control'} />
      <BootstrapFeedback field={field} />
    </div>
  )
}

export const BootstrapTextInput = React.memo(BootstrapTextInputImpl, (prev, next) => prev.node.id === next.node.id)

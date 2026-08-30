import React from 'react'
import type { FieldNode, UINode } from '@texaryn/core'
import { useField } from '../hooks/use-field.js'
import { getInputProps, getLabelProps, getErrorProps, getDescriptionProps } from '../props/index.js'

export interface WidgetProps {
  node: UINode
}

function TextareaImpl({ node }: WidgetProps) {
  const fieldNode = node as FieldNode
  const field = useField(fieldNode.id)
  const { value, onChange, ...inputProps } = getInputProps(fieldNode, field)
  const labelProps = getLabelProps(fieldNode)
  const errorProps = getErrorProps(fieldNode)
  const descriptionProps = getDescriptionProps(fieldNode)
  const label = fieldNode.annotations.title ?? fieldNode.dataPointer ?? fieldNode.id

  return (
    <div>
      <label {...labelProps}>{label}</label>
      <textarea
        {...inputProps}
        value={typeof value === 'string' ? value : value == null ? '' : String(value)}
        onChange={(event) => onChange(event.target.value)}
      />
      {fieldNode.annotations.description ? (
        <div {...descriptionProps}>{fieldNode.annotations.description}</div>
      ) : null}
      {field.errors.length > 0 ? (
        <div {...errorProps}>{field.errors.map((error) => error.message).join(', ')}</div>
      ) : null}
    </div>
  )
}

export const Textarea = React.memo(
  TextareaImpl,
  (prev, next) => prev.node.id === next.node.id,
)

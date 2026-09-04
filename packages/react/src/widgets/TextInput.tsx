import React from 'react'
import type { FieldNode, UINode } from '@texaryn/core'
import { useField } from '../hooks/use-field.js'
import { getInputProps, getLabelProps, getDescriptionProps } from '../props/index.js'
import { FieldErrors } from '../components/FieldErrors.js'

export interface WidgetProps {
  node: UINode
}

function TextInputImpl({ node }: WidgetProps) {
  const fieldNode = node as FieldNode
  const field = useField(fieldNode.id)
  const { value, onChange, ...inputProps } = getInputProps(fieldNode, field)
  const labelProps = getLabelProps(fieldNode)
  const descriptionProps = getDescriptionProps(fieldNode)
  const label = fieldNode.annotations.title ?? fieldNode.dataPointer ?? fieldNode.id
  const description = fieldNode.helpText ?? fieldNode.annotations.description

  return (
    <div>
      <label {...labelProps}>{label}</label>
      <input
        {...inputProps}
        type="text"
        value={typeof value === 'string' ? value : value == null ? '' : String(value)}
        onChange={(event) => onChange(event.target.value)}
      />
      {description ? (
        <div {...descriptionProps}>{description}</div>
      ) : null}
      <FieldErrors node={fieldNode} errors={field.errors} showErrors={field.showErrors} />
    </div>
  )
}

export const TextInput = React.memo(
  TextInputImpl,
  (prev, next) => prev.node.id === next.node.id,
)

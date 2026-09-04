import React from 'react'
import type { FieldNode, UINode } from '@texaryn/core'
import { useField } from '../hooks/use-field.js'
import { getInputProps, getLabelProps, getDescriptionProps } from '../props/index.js'
import { FieldErrors } from '../components/FieldErrors.js'

export interface WidgetProps {
  node: UINode
}

function CheckboxImpl({ node }: WidgetProps) {
  const fieldNode = node as FieldNode
  const field = useField(fieldNode.id)
  const { value, onChange, ...inputProps } = getInputProps(fieldNode, field)
  const labelProps = getLabelProps(fieldNode)
  const descriptionProps = getDescriptionProps(fieldNode)
  const label = fieldNode.annotations.title ?? fieldNode.dataPointer ?? fieldNode.id
  const description = fieldNode.helpText ?? fieldNode.annotations.description

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.checked)
  }

  return (
    <div>
      <input
        {...inputProps}
        type="checkbox"
        checked={Boolean(value)}
        onChange={handleChange}
      />
      <label {...labelProps}>{label}</label>
      {description ? (
        <div {...descriptionProps}>{description}</div>
      ) : null}
      <FieldErrors node={fieldNode} errors={field.errors} showErrors={field.showErrors} />
    </div>
  )
}

export const Checkbox = React.memo(
  CheckboxImpl,
  (prev, next) => prev.node.id === next.node.id,
)

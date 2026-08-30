import React from 'react'
import type { FieldNode, UINode } from '@texaryn/core'
import { useField } from '../hooks/use-field.js'
import { getInputProps, getLabelProps, getErrorProps, getDescriptionProps } from '../props/index.js'

export interface WidgetProps {
  node: UINode
}

function NumberInputImpl({ node }: WidgetProps) {
  const fieldNode = node as FieldNode
  const field = useField(fieldNode.id)
  const { value, onChange, ...inputProps } = getInputProps(fieldNode, field)
  const labelProps = getLabelProps(fieldNode)
  const errorProps = getErrorProps(fieldNode)
  const descriptionProps = getDescriptionProps(fieldNode)
  const label = fieldNode.annotations.title ?? fieldNode.dataPointer ?? fieldNode.id

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value
    onChange(raw === '' ? undefined : Number(raw))
  }

  return (
    <div>
      <label {...labelProps}>{label}</label>
      <input
        {...inputProps}
        type="number"
        value={typeof value === 'number' ? value : value == null ? '' : String(value)}
        onChange={handleChange}
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

export const NumberInput = React.memo(
  NumberInputImpl,
  (prev, next) => prev.node.id === next.node.id,
)

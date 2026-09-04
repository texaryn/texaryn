import React from 'react'
import type { FieldNode, UINode } from '@texaryn/core'
import { useField } from '../hooks/use-field.js'
import { getInputProps, getLabelProps, getDescriptionProps } from '../props/index.js'
import { FieldErrors } from '../components/FieldErrors.js'

export interface WidgetProps {
  node: UINode
}

function SelectImpl({ node }: WidgetProps) {
  const fieldNode = node as FieldNode
  const field = useField(fieldNode.id)
  const { value, onChange, ...inputProps } = getInputProps(fieldNode, field)
  const labelProps = getLabelProps(fieldNode)
  const descriptionProps = getDescriptionProps(fieldNode)
  const label = fieldNode.annotations.title ?? fieldNode.dataPointer ?? fieldNode.id
  const description = fieldNode.helpText ?? fieldNode.annotations.description
  const enumValues = fieldNode.enumValues ?? []

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = enumValues.find((option) => String(option.value) === event.target.value)
    onChange(selected ? selected.value : event.target.value)
  }

  return (
    <div>
      <label {...labelProps}>{label}</label>
      <select
        {...inputProps}
        value={value == null ? '' : String(value)}
        onChange={handleChange}
      >
        {enumValues.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>
            {option.title ?? String(option.value)}
          </option>
        ))}
      </select>
      {description ? (
        <div {...descriptionProps}>{description}</div>
      ) : null}
      <FieldErrors node={fieldNode} errors={field.errors} showErrors={field.showErrors} />
    </div>
  )
}

export const Select = React.memo(
  SelectImpl,
  (prev, next) => prev.node.id === next.node.id,
)

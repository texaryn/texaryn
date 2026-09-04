import React from 'react'
import TextField from '@mui/material/TextField'
import type { FieldNode, UINode } from '@texaryn/core'
import { useFieldBinding } from '@texaryn/react'

export interface WidgetProps {
  node: UINode
}

function MuiNumberInputImpl({ node }: WidgetProps) {
  const field = useFieldBinding(node as FieldNode)

  return (
    <TextField
      type="number"
      id={field.domInputProps.id}
      name={field.domInputProps.name}
      value={field.domInputProps.value}
      onChange={field.domInputProps.onChange}
      onBlur={field.domInputProps.onBlur}
      disabled={field.disabled}
      placeholder={field.placeholder}
      label={field.label}
      error={field.invalid}
      helperText={field.error ?? field.description}
      fullWidth
      slotProps={{
        htmlInput: {
          'aria-required': field.required || undefined,
          'aria-invalid': field.invalid || undefined,
        },
        formHelperText: {
          role: field.invalid ? 'alert' : undefined,
        },
      }}
    />
  )
}

export const MuiNumberInput = React.memo(MuiNumberInputImpl, (prev, next) => prev.node.id === next.node.id)

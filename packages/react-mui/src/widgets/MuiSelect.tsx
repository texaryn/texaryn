import React from 'react'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import type { FieldNode, UINode } from '@texaryn/core'
import { useFieldBinding } from '@texaryn/react'

export interface WidgetProps {
  node: UINode
}

function MuiSelectImpl({ node }: WidgetProps) {
  const field = useFieldBinding(node as FieldNode)
  const enumValues = (node as FieldNode).enumValues ?? []

  return (
    <TextField
      select
      id={field.domInputProps.id}
      name={field.domInputProps.name}
      value={field.domInputProps.value}
      onChange={field.domInputProps.onChange}
      onBlur={field.domInputProps.onBlur}
      disabled={field.disabled}
      label={field.label}
      error={field.invalid}
      helperText={field.error ?? field.description}
      fullWidth
      slotProps={{
        // Screen readers see the combobox div, not MUI's aria-hidden native input.
        select: {
          SelectDisplayProps: {
            'aria-required': field.required || undefined,
          },
        },
        htmlInput: {
          'aria-invalid': field.invalid || undefined,
        },
        formHelperText: {
          role: field.invalid ? 'alert' : undefined,
        },
      }}
    >
      {enumValues.map((option) => (
        <MenuItem key={String(option.value)} value={String(option.value)}>
          {option.title ?? String(option.value)}
        </MenuItem>
      ))}
    </TextField>
  )
}

export const MuiSelect = React.memo(MuiSelectImpl, (prev, next) => prev.node.id === next.node.id)

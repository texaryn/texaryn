import React from 'react'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import FormHelperText from '@mui/material/FormHelperText'
import type { FieldNode, UINode } from '@texaryn/core'
import { useFieldBinding } from '@texaryn/react'

export interface WidgetProps {
  node: UINode
}

function MuiCheckboxImpl({ node }: WidgetProps) {
  const field = useFieldBinding(node as FieldNode)
  const feedback = field.error ?? field.description
  const helperId = `${field.domCheckboxProps.id}-helper`

  return (
    <FormControl error={field.invalid} disabled={field.disabled}>
      <FormControlLabel
        label={field.label}
        control={
          <Checkbox
            checked={field.domCheckboxProps.checked}
            onChange={field.domCheckboxProps.onChange}
            onBlur={field.domCheckboxProps.onBlur}
            slotProps={{
              input: {
                id: field.domCheckboxProps.id,
                name: field.domCheckboxProps.name,
                'aria-required': field.required || undefined,
                'aria-invalid': field.invalid || undefined,
                'aria-describedby': feedback ? helperId : undefined,
              },
            }}
          />
        }
      />
      {feedback ? (
        <FormHelperText id={helperId} role={field.invalid ? 'alert' : undefined}>
          {feedback}
        </FormHelperText>
      ) : null}
    </FormControl>
  )
}

export const MuiCheckbox = React.memo(MuiCheckboxImpl, (prev, next) => prev.node.id === next.node.id)

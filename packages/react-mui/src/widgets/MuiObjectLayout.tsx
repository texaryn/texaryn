import React from 'react'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { UINode } from '@texaryn/core'
import { NodeRenderer, useObjectGroup, useRendererContext } from '@texaryn/react'

export interface WidgetProps {
  node: UINode
}

function MuiObjectLayoutImpl({ node }: WidgetProps) {
  const { document, registry } = useRendererContext()
  const { nested, title, children } = useObjectGroup(node)

  const rendered = children.map((child) => (
    <NodeRenderer key={child.id} node={child} document={document} registry={registry} />
  ))

  if (!nested) {
    return <Stack spacing={2}>{rendered}</Stack>
  }

  // A plain fieldset rather than one of MUI's own containers: this package is
  // theme-neutral and the grouping has to be a real fieldset with a legend for
  // the group to be named. Typography styles the legend without replacing it.
  return (
    <Stack
      component="fieldset"
      spacing={2}
      role={title === undefined ? 'none' : undefined}
      sx={{ border: 0, m: 0, p: 0 }}
    >
      {title === undefined ? null : (
        <Typography component="legend" variant="subtitle2">
          {title}
        </Typography>
      )}
      <Stack spacing={2}>{rendered}</Stack>
    </Stack>
  )
}

export const MuiObjectLayout = React.memo(
  MuiObjectLayoutImpl,
  (prev, next) => prev.node.id === next.node.id,
)

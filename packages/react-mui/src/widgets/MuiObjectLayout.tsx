import React from 'react'
import Stack from '@mui/material/Stack'
import type { ContainerNode, UINode } from '@texaryn/core'
import { NodeRenderer, useRendererContext } from '@texaryn/react'

export interface WidgetProps {
  node: UINode
}

function MuiObjectLayoutImpl({ node }: WidgetProps) {
  const containerNode = node as ContainerNode
  const { document, registry } = useRendererContext()

  return (
    <Stack spacing={2}>
      {containerNode.children.map((childId) => {
        const child = document.nodes[childId]
        if (!child) {
          return null
        }
        return <NodeRenderer key={childId} node={child} document={document} registry={registry} />
      })}
    </Stack>
  )
}

export const MuiObjectLayout = React.memo(MuiObjectLayoutImpl, (prev, next) => prev.node.id === next.node.id)

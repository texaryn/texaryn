import React from 'react'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import type { ContainerNode, UINode } from '@texaryn/core'
import { NodeRenderer, useFieldArray, useRendererContext } from '@texaryn/react'

export interface WidgetProps {
  node: UINode
}

function MuiArrayControlImpl({ node }: WidgetProps) {
  const containerNode = node as ContainerNode
  const fieldArray = useFieldArray(containerNode.id)
  const { document, registry } = useRendererContext()

  return (
    <Stack spacing={2}>
      {fieldArray.items.map((item, index) => {
        const childNode = item.nodeId ? document.nodes[item.nodeId] : undefined
        return (
          <Box key={item.id}>
            {childNode ? (
              <NodeRenderer node={childNode} document={document} registry={registry} />
            ) : null}
            {fieldArray.canRemove ? (
              <Button
                variant="outlined"
                color="error"
                size="small"
                onClick={() => fieldArray.remove(index)}
              >
                Remove
              </Button>
            ) : null}
          </Box>
        )
      })}
      {fieldArray.canAdd ? (
        <Box>
          <Button variant="contained" onClick={() => fieldArray.add()}>
            Add
          </Button>
        </Box>
      ) : null}
    </Stack>
  )
}

export const MuiArrayControl = React.memo(MuiArrayControlImpl, (prev, next) => prev.node.id === next.node.id)

import React from 'react'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import Box from '@mui/material/Box'
import type { ContainerNode, UINode } from '@texaryn/core'
import { NodeRenderer, useArrayActions, useArrayDrag, useFieldArray, useRendererContext } from '@texaryn/react'

export interface WidgetProps {
  node: UINode
}

function focusAfterRender(row: HTMLElement | null, direction: 'up' | 'down'): void {
  const focus = () => row?.querySelector<HTMLButtonElement>(`:scope > [data-reorder-direction="${direction}"]`)?.focus()
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focus)
  else setTimeout(focus, 0)
}

function MuiArrayControlImpl({ node }: WidgetProps) {
  const containerNode = node as ContainerNode
  const fieldArray = useFieldArray(containerNode.id)
  const { document, registry } = useRendererContext()
  const actions = useArrayActions(node)
  const drag = useArrayDrag(containerNode.id, fieldArray.items, fieldArray.move)

  return (
    <Stack ref={drag.rootRef} spacing={2} data-array-container="">
      {fieldArray.items.map((item, index) => {
        const childNode = item.nodeId ? document.nodes[item.nodeId] : undefined
        const remove = actions.remove(index + 1, childNode)
        const moveUp = actions.moveUp(index + 1, childNode)
        const moveDown = actions.moveDown(index + 1, childNode)
        return (
          <Box key={item.id} {...drag.rowProps(item.id)}>
            {drag.canDrag ? <span {...drag.handleProps(item.id)}>⠿</span> : null}
            {childNode ? (
              <NodeRenderer node={childNode} document={document} registry={registry} />
            ) : null}
            {fieldArray.canReorder && index > 0 ? (
              <Button
                size="small"
                aria-label={moveUp.accessibleName}
                data-reorder-direction="up"
                onClick={(event) => {
                  const wasFocused = globalThis.document.activeElement === event.currentTarget
                  const row = event.currentTarget.closest<HTMLElement>('[data-array-row]')
                  fieldArray.move(index, index - 1)
                  if (wasFocused && index === 1) focusAfterRender(row, 'down')
                }}
              >
                {moveUp.label}
              </Button>
            ) : null}
            {fieldArray.canReorder && index < fieldArray.items.length - 1 ? (
              <Button
                size="small"
                aria-label={moveDown.accessibleName}
                data-reorder-direction="down"
                onClick={(event) => {
                  const wasFocused = globalThis.document.activeElement === event.currentTarget
                  const row = event.currentTarget.closest<HTMLElement>('[data-array-row]')
                  fieldArray.move(index, index + 1)
                  if (wasFocused && index === fieldArray.items.length - 2) focusAfterRender(row, 'up')
                }}
              >
                {moveDown.label}
              </Button>
            ) : null}
            {fieldArray.canRemove ? (
              <Button
                variant="outlined"
                color="error"
                size="small"
                aria-label={remove.accessibleName}
                onClick={() => fieldArray.remove(index)}
              >
                {remove.label}
              </Button>
            ) : null}
          </Box>
        )
      })}
      {fieldArray.canAdd ? (
        <Box>
          <Button variant="contained" aria-label={actions.add.accessibleName} onClick={() => fieldArray.add()}>
            {actions.add.label}
          </Button>
        </Box>
      ) : null}
    </Stack>
  )
}

export const MuiArrayControl = React.memo(MuiArrayControlImpl, (prev, next) => prev.node.id === next.node.id)

import React from 'react'
import type { ContainerNode, UINode } from '@texaryn/core'
import { useFieldArray } from '../hooks/use-field-array.js'
import { useArrayDrag } from '../hooks/use-array-drag.js'
import { NodeRenderer } from '../components/NodeRenderer.js'
import { useRendererContext } from '../components/renderer-context.js'
import { useArrayActions } from '../hooks/use-array-actions.js'

export interface WidgetProps {
  node: UINode
}

function focusAfterRender(row: HTMLElement | null, direction: 'up' | 'down'): void {
  const focus = () => row?.querySelector<HTMLButtonElement>(`:scope > [data-reorder-direction="${direction}"]`)?.focus()
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(focus)
  else setTimeout(focus, 0)
}

function ArrayControlImpl({ node }: WidgetProps) {
  const containerNode = node as ContainerNode
  const fieldArray = useFieldArray(containerNode.id)
  const { document, registry } = useRendererContext()
  const actions = useArrayActions(node)
  const drag = useArrayDrag(containerNode.id, fieldArray.items, fieldArray.move)

  return (
    <div ref={drag.rootRef} data-array-container="">
      {fieldArray.items.map((item, index) => {
        const childNode = item.nodeId ? document.nodes[item.nodeId] : undefined
        const remove = actions.remove(index + 1, childNode)
        const moveUp = actions.moveUp(index + 1, childNode)
        const moveDown = actions.moveDown(index + 1, childNode)
        return (
          <div
            key={item.id}
            {...drag.rowProps(item.id)}
          >
            {drag.canDrag ? (
              <span
                {...drag.handleProps(item.id)}
              >
                ⠿
              </span>
            ) : null}
            {childNode ? (
              <NodeRenderer node={childNode} document={document} registry={registry} />
            ) : null}
            {fieldArray.canReorder && index > 0 ? (
              <button
                type="button"
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
              </button>
            ) : null}
            {fieldArray.canReorder && index < fieldArray.items.length - 1 ? (
              <button
                type="button"
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
              </button>
            ) : null}
            {fieldArray.canRemove ? (
              // The visible word stays short; the name that distinguishes the
              // row goes in aria-label, which contains it so speech input
              // still works.
              <button
                type="button"
                aria-label={remove.accessibleName}
                onClick={() => fieldArray.remove(index)}
              >
                {remove.label}
              </button>
            ) : null}
          </div>
        )
      })}
      {fieldArray.canAdd ? (
        <button type="button" aria-label={actions.add.accessibleName} onClick={() => fieldArray.add()}>
          {actions.add.label}
        </button>
      ) : null}
    </div>
  )
}

export const ArrayControl = React.memo(
  ArrayControlImpl,
  (prev, next) => prev.node.id === next.node.id,
)

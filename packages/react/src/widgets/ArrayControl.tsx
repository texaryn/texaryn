import React from 'react'
import type { ContainerNode, UINode } from '@texaryn/core'
import { useFieldArray } from '../hooks/use-field-array.js'
import { NodeRenderer } from '../components/NodeRenderer.js'
import { useRendererContext } from '../components/renderer-context.js'
import { useArrayActions } from '../hooks/use-array-actions.js'

export interface WidgetProps {
  node: UINode
}

function ArrayControlImpl({ node }: WidgetProps) {
  const containerNode = node as ContainerNode
  const fieldArray = useFieldArray(containerNode.id)
  const { document, registry } = useRendererContext()
  const actions = useArrayActions(node)

  return (
    <div>
      {fieldArray.items.map((item, index) => {
        const childNode = item.nodeId ? document.nodes[item.nodeId] : undefined
        return (
          <div key={item.id}>
            {childNode ? (
              <NodeRenderer node={childNode} document={document} registry={registry} />
            ) : null}
            {fieldArray.canRemove ? (
              // The visible word stays short; the name that distinguishes the
              // row goes in aria-label, which contains it so speech input
              // still works.
              <button
                type="button"
                aria-label={actions.remove(index + 1, childNode).accessibleName}
                onClick={() => fieldArray.remove(index)}
              >
                {actions.remove(index + 1, childNode).label}
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

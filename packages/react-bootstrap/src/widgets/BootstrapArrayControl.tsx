import React from 'react'
import type { ContainerNode, UINode } from '@texaryn/core'
import { NodeRenderer, useArrayActions, useFieldArray, useRendererContext } from '@texaryn/react'

export interface WidgetProps {
  node: UINode
}

function BootstrapArrayControlImpl({ node }: WidgetProps) {
  const containerNode = node as ContainerNode
  const fieldArray = useFieldArray(containerNode.id)
  const { document, registry } = useRendererContext()
  const actions = useArrayActions(node)

  return (
    <div>
      {fieldArray.items.map((item, index) => {
        const childNode = item.nodeId ? document.nodes[item.nodeId] : undefined
        return (
          <div key={item.id} className="mb-3">
            {childNode ? (
              <NodeRenderer node={childNode} document={document} registry={registry} />
            ) : null}
            {fieldArray.canRemove ? (
              <button
                type="button"
                className="btn btn-outline-danger btn-sm"
                aria-label={actions.removeName(index + 1, childNode)}
                onClick={() => fieldArray.remove(index)}
              >
                Remove
              </button>
            ) : null}
          </div>
        )
      })}
      {fieldArray.canAdd ? (
        <button
          type="button"
          className="btn btn-primary"
          aria-label={actions.addName}
          onClick={() => fieldArray.add()}
        >
          Add
        </button>
      ) : null}
    </div>
  )
}

export const BootstrapArrayControl = React.memo(
  BootstrapArrayControlImpl,
  (prev, next) => prev.node.id === next.node.id,
)

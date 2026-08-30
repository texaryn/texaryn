import React from 'react'
import type { ContainerNode, UINode } from '@texaryn/core'
import { useFieldArray } from '../hooks/use-field-array.js'
import { NodeRenderer } from '../components/NodeRenderer.js'
import { useRendererContext } from '../components/renderer-context.js'

export interface WidgetProps {
  node: UINode
}

function ArrayControlImpl({ node }: WidgetProps) {
  const containerNode = node as ContainerNode
  const fieldArray = useFieldArray(containerNode.id)
  const { document, registry } = useRendererContext()

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
              <button type="button" onClick={() => fieldArray.remove(index)}>
                Remove
              </button>
            ) : null}
          </div>
        )
      })}
      {fieldArray.canAdd ? (
        <button type="button" onClick={() => fieldArray.add()}>
          Add
        </button>
      ) : null}
    </div>
  )
}

export const ArrayControl = React.memo(
  ArrayControlImpl,
  (prev, next) => prev.node.id === next.node.id,
)

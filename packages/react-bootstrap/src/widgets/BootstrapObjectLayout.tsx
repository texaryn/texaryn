import React from 'react'
import type { ContainerNode, UINode } from '@texaryn/core'
import { NodeRenderer, useRendererContext } from '@texaryn/react'

export interface WidgetProps {
  node: UINode
}

function BootstrapObjectLayoutImpl({ node }: WidgetProps) {
  const containerNode = node as ContainerNode
  const { document, registry } = useRendererContext()

  return (
    <div>
      {containerNode.children.map((childId) => {
        const child = document.nodes[childId]
        if (!child) {
          return null
        }
        return <NodeRenderer key={childId} node={child} document={document} registry={registry} />
      })}
    </div>
  )
}

export const BootstrapObjectLayout = React.memo(
  BootstrapObjectLayoutImpl,
  (prev, next) => prev.node.id === next.node.id,
)

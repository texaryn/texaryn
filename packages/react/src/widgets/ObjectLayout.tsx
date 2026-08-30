import React from 'react'
import type { ContainerNode, UINode } from '@texaryn/core'
import { NodeRenderer } from '../components/NodeRenderer.js'
import { useRendererContext } from '../components/renderer-context.js'

export interface WidgetProps {
  node: UINode
}

function ObjectLayoutImpl({ node }: WidgetProps) {
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

export const ObjectLayout = React.memo(
  ObjectLayoutImpl,
  (prev, next) => prev.node.id === next.node.id,
)

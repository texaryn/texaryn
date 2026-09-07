import React from 'react'
import type { UINode } from '@texaryn/core'
import { NodeRenderer, useObjectGroup, useRendererContext } from '@texaryn/react'

export interface WidgetProps {
  node: UINode
}

function BootstrapObjectLayoutImpl({ node }: WidgetProps) {
  const { document, registry } = useRendererContext()
  const { nested, title, children } = useObjectGroup(node)

  const rendered = children.map((child) => (
    <NodeRenderer key={child.id} node={child} document={document} registry={registry} />
  ))

  if (!nested) {
    return <div>{rendered}</div>
  }

  return (
    <fieldset role={title === undefined ? 'none' : undefined} className="mb-3">
      {title === undefined ? null : <legend className="fs-6 fw-semibold">{title}</legend>}
      <div>{rendered}</div>
    </fieldset>
  )
}

export const BootstrapObjectLayout = React.memo(
  BootstrapObjectLayoutImpl,
  (prev, next) => prev.node.id === next.node.id,
)

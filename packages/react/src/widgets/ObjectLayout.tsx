import React from 'react'
import { objectChildKey } from '@texaryn/core'
import type { UINode } from '@texaryn/core'
import { NodeRenderer } from '../components/NodeRenderer.js'
import { ProjectionBoundaryActions } from '../components/ProjectionBoundaryActions.js'
import { useRendererContext } from '../components/renderer-context.js'
import { useObjectGroup } from '../hooks/use-object-group.js'

export interface WidgetProps {
  node: UINode
}

function ObjectLayoutImpl({ node }: WidgetProps) {
  const { document, registry } = useRendererContext()
  const { container, nested, title, children } = useObjectGroup(node)

  const rendered = children.map((child) => (
    <NodeRenderer key={objectChildKey(child)} node={child} document={document} registry={registry} />
  ))

  if (!nested) {
    return (
      <div>
        {rendered}
        <ProjectionBoundaryActions container={container} title={title} />
      </div>
    )
  }

  // The element is chosen once and only the grouping semantics are re-derived:
  // swapping div for fieldset when a title appears would remount the subtree
  // and drop focus. Children sit in their own element so the legend is never a
  // candidate for reorder.
  return (
    <fieldset role={title === undefined ? 'none' : undefined}>
      {title === undefined ? null : <legend>{title}</legend>}
      <div>
        {rendered}
        <ProjectionBoundaryActions container={container} title={title} />
      </div>
    </fieldset>
  )
}

export const ObjectLayout = React.memo(
  ObjectLayoutImpl,
  (prev, next) => prev.node.id === next.node.id,
)

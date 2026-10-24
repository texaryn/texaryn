import { useMemo } from 'react'
import type { UIDocument, UINode, RendererRegistry } from '@texaryn/core'
import { RendererContext, type WidgetComponent } from './renderer-context.js'

export interface NodeRendererProps {
  node: UINode
  document: UIDocument
  registry: RendererRegistry<WidgetComponent>
}

/**
 * Compiling a schema with `active: false` produces a node with
 * `visible: false`. That is the source of truth for hiding a node, so it is
 * read straight off the document rather than through useField, which would
 * cost a hook subscription for a subtree that never renders.
 */
export function NodeRenderer({ node, document, registry }: Readonly<NodeRendererProps>) {
  const context = useMemo(() => ({ document, registry }), [document, registry])
  if (!node.visible) {
    return null
  }

  const Widget = registry.resolve(node)
  if (!Widget) {
    return null
  }

  return (
    <RendererContext.Provider value={context}>
      <Widget node={node} />
    </RendererContext.Provider>
  )
}

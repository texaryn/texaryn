import type { ContainerNode, UINode } from '@texaryn/core'
import { useRendererContext } from '../components/renderer-context.js'

export interface ObjectGroup {
  /**
   * Fixed for the widget's lifetime. The root object is the form itself, so
   * only a nested object is a candidate for being a named group.
   */
  nested: boolean
  /**
   * Live, because a conditional subschema can add or drop a title on any
   * recompile while this widget survives. Undefined means the group has no
   * name, and an unnamed group is noise.
   */
  title: string | undefined
  children: UINode[]
}

/**
 * The grouping decision, shared by every React widget set so the three cannot
 * drift apart. The node comes from the document rather than the prop, because
 * a memo bailout on an unchanged id would otherwise freeze the title.
 */
export function useObjectGroup(node: UINode): ObjectGroup {
  const { document } = useRendererContext()
  const current = (document.nodes[node.id] ?? node) as ContainerNode
  return {
    nested: node.parentId !== null,
    title: current.annotations.title,
    children: current.children
      .map((id) => document.nodes[id])
      .filter((child): child is UINode => child != null),
  }
}

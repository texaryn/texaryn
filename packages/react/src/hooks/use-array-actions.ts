import type { ContainerNode, UINode } from '@texaryn/core'
import { useRendererContext } from '../components/renderer-context.js'
import { addActionName, removeActionName } from '../props/action-names.js'

export interface ArrayActions {
  /** Accessible name for the control that removes the row at this position. */
  removeName(position: number, item: UINode | undefined): string
  /** Accessible name for the control that appends a row. */
  addName: string
}

/**
 * Shared by the three React widget sets so their action names cannot drift.
 * The array title is read from the document rather than the node prop: these
 * widgets are memoized on node id, so a conditional annotation added by a
 * recompile would otherwise never reach the name.
 */
export function useArrayActions(node: UINode): ArrayActions {
  const { document } = useRendererContext()
  const current = (document.nodes[node.id] ?? node) as ContainerNode
  const arrayTitle = current.annotations.title
  return {
    removeName: (position, item) => removeActionName(position, item?.annotations.title, arrayTitle),
    addName: addActionName(
      current.children
        .map((id) => document.nodes[id])
        .find((child): child is UINode => child != null)?.annotations.title,
      arrayTitle,
    ),
  }
}

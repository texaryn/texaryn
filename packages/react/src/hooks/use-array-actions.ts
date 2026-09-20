import type { ActionMessage, ContainerNode, UINode } from '@texaryn/core'
import { useRendererContext } from '../components/renderer-context.js'
import { useFormMessages } from '../messages.js'

export interface ArrayActions {
  /** Both surfaces of the control that appends a row. */
  add: ActionMessage
  /** Both surfaces of the control that removes the row at this position. */
  remove(position: number, item: UINode | undefined): ActionMessage
}

/**
 * Shared by the three React widget sets so their action names cannot drift.
 * The array title is read from the document rather than the node prop: these
 * widgets are memoized on node id, so a conditional annotation added by a
 * recompile would otherwise never reach the name.
 */
export function useArrayActions(node: UINode): ArrayActions {
  const { document } = useRendererContext()
  const messages = useFormMessages()
  const current = (document.nodes[node.id] ?? node) as ContainerNode
  const containerTitle = current.annotations.title
  return {
    remove: (position, item) =>
      messages.removeItem({ position, itemTitle: item?.annotations.title, containerTitle }),
    // The item template's title, not the first row's. A row may not exist yet,
    // which is exactly when naming the add control matters most, and a row's
    // annotations can in principle depend on its data.
    add: messages.addItem({ itemTemplateTitle: current.arrayMeta?.itemTitle, containerTitle }),
  }
}

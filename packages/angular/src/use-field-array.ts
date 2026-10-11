import { computed } from '@angular/core'
import type { Signal } from '@angular/core'
import type { ContainerNode, NodeId, StableItemId } from '@texaryn/core'
import { useFormContext } from './context.js'

export interface FieldArrayItem {
  id: StableItemId
  nodeId: NodeId | undefined
}

export interface FieldArrayBinding {
  items: Signal<FieldArrayItem[]>
  canAdd: Signal<boolean>
  canRemove: Signal<boolean>
  canReorder: Signal<boolean>
  add(value?: unknown): void
  remove(index: number): void
  move(from: number, to: number): void
}

export function useFieldArray(nodeId: () => NodeId): FieldArrayBinding {
  const context = useFormContext()
  const form = computed(() => context.form())
  const container = computed(() => {
    const document = form().document()
    const node = document.nodes[nodeId()]
    return node?.type === 'container' && node.containerType === 'array'
      ? node as ContainerNode
      : undefined
  })
  const items = computed<FieldArrayItem[]>(() => {
    const current = container()
    const meta = current?.arrayMeta
    if (!meta) return []
    return meta.itemIds.map((id, index) => ({ id, nodeId: current.children[index] }))
  })

  return {
    items,
    canAdd: computed(() => container()?.arrayMeta?.canAdd ?? false),
    canRemove: computed(() => container()?.arrayMeta?.canRemove ?? false),
    canReorder: computed(() => container()?.arrayMeta?.canReorder ?? false),
    add: (value) => form().dispatch({
      type: 'InsertItem',
      containerId: nodeId(),
      index: items().length,
      value,
    }),
    remove: (index) => form().dispatch({ type: 'RemoveItem', containerId: nodeId(), index }),
    move: (from, to) => form().dispatch({ type: 'MoveItem', containerId: nodeId(), from, to }),
  }
}

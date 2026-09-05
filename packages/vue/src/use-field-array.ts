import { computed, toValue } from 'vue'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { ContainerNode, NodeId, StableItemId } from '@texaryn/core'
import { useFormRuntime } from './context.js'
import { useStore } from './use-store.js'

export interface FieldArrayItem {
  /** Survives inserts, removes and moves. The key to render this row with. */
  id: StableItemId
  /** Positional, so it changes under a row that moves. Undefined when the
   * projection emitted no per-item child pointer. */
  nodeId: NodeId | undefined
}

export interface UseFieldArrayReturn {
  items: Ref<FieldArrayItem[]>
  canAdd: Ref<boolean>
  canRemove: Ref<boolean>
  canReorder: Ref<boolean>
  add(value?: unknown): void
  remove(index: number): void
  move(from: number, to: number): void
}

export function useFieldArray(nodeId: MaybeRefOrGetter<NodeId>): UseFieldArrayReturn {
  const runtime = useFormRuntime()
  const document = useStore(runtime.document, runtime.document.getSnapshot())

  const container = computed(() => {
    const node = document.value.nodes[toValue(nodeId)]
    return node?.type === 'container' && node.containerType === 'array'
      ? (node as ContainerNode)
      : undefined
  })

  const items = computed<FieldArrayItem[]>(() => {
    const meta = container.value?.arrayMeta
    if (!meta) return []
    return meta.itemIds.map((id, index) => ({
      id,
      nodeId: container.value?.children[index],
    }))
  })

  return {
    items,
    canAdd: computed(() => container.value?.arrayMeta?.canAdd ?? false),
    canRemove: computed(() => container.value?.arrayMeta?.canRemove ?? false),
    canReorder: computed(() => container.value?.arrayMeta?.canReorder ?? false),
    add: (value?: unknown) => {
      runtime.dispatch({
        type: 'InsertItem',
        containerId: toValue(nodeId),
        index: items.value.length,
        value,
      })
    },
    remove: (index: number) => {
      runtime.dispatch({ type: 'RemoveItem', containerId: toValue(nodeId), index })
    },
    move: (from: number, to: number) => {
      runtime.dispatch({ type: 'MoveItem', containerId: toValue(nodeId), from, to })
    },
  }
}

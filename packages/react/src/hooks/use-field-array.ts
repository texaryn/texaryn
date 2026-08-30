import { useCallback } from 'react'
import type { ContainerNode, NodeId, StableItemId } from '@texaryn/core'
import { useFormContext } from '../context.js'
import { useStore } from './use-store.js'

export interface FieldArrayItem {
  id: StableItemId
  // `undefined` when the projection didn't emit a per-item child pointer,
  // so `children` and `arrayMeta.itemIds` are not index-aligned.
  nodeId: NodeId | undefined
}

export interface UseFieldArrayReturn {
  items: FieldArrayItem[]
  canAdd: boolean
  canRemove: boolean
  canReorder: boolean
  add(value?: unknown): void
  remove(index: number): void
  move(from: number, to: number): void
}

export function useFieldArray(nodeId: NodeId): UseFieldArrayReturn {
  const runtime = useFormContext()
  const document = useStore(runtime.document)

  const node = document.nodes[nodeId]
  const containerNode = node?.type === 'container' && node.containerType === 'array'
    ? (node as ContainerNode)
    : undefined

  const items: FieldArrayItem[] = containerNode?.arrayMeta
    ? containerNode.arrayMeta.itemIds.map((id, index) => ({
        id,
        nodeId: containerNode.children[index],
      }))
    : []

  const canAdd = containerNode?.arrayMeta?.canAdd ?? false
  const canRemove = containerNode?.arrayMeta?.canRemove ?? false
  const canReorder = containerNode?.arrayMeta?.canReorder ?? false

  const add = useCallback(
    (value?: unknown) => {
      runtime.dispatch({ type: 'InsertItem', containerId: nodeId, index: items.length, value })
    },
    [runtime, nodeId, items.length],
  )

  const remove = useCallback(
    (index: number) => { runtime.dispatch({ type: 'RemoveItem', containerId: nodeId, index }) },
    [runtime, nodeId],
  )

  const move = useCallback(
    (from: number, to: number) => { runtime.dispatch({ type: 'MoveItem', containerId: nodeId, from, to }) },
    [runtime, nodeId],
  )

  return { items, canAdd, canRemove, canReorder, add, remove, move }
}

import { useEffect, useRef } from 'react'
import type { HTMLAttributes, RefObject } from 'react'
import type { ContainerNode, NodeId, StableItemId } from '@texaryn/core'
import type { FormRuntime } from '@texaryn/core'
import { useFormContext } from '../context.js'

const arrayDragType = 'application/x-texaryn-array-item'

interface ArrayDragSession {
  readonly runtime: FormRuntime
  readonly identityKey: NonNullable<ContainerNode['arrayMeta']>['identityKey']
  readonly root: HTMLDivElement
  readonly itemId: StableItemId
}

export interface ArrayDragBinding {
  readonly canDrag: boolean
  readonly rootRef: RefObject<HTMLDivElement | null>
  handleProps(itemId: StableItemId): HTMLAttributes<HTMLSpanElement>
  rowProps: (itemId: StableItemId) => HTMLAttributes<HTMLDivElement> & {
    'data-array-row': string
    'data-array-item-id': StableItemId
  }
}

function dragPayloadPresent(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes(arrayDragType)
}

function ownsArrayTarget(event: React.DragEvent, root: HTMLDivElement): boolean {
  const target = event.target
  return target instanceof Element && target.closest('[data-array-container]') === root
}

function currentArray(runtime: FormRuntime, nodeId: NodeId): ContainerNode | undefined {
  const node = runtime.document.getSnapshot().nodes[nodeId as string]
  return node?.type === 'container' && node.containerType === 'array'
    ? node as ContainerNode
    : undefined
}

export function useArrayDrag(
  nodeId: NodeId,
  items: readonly { readonly id: StableItemId }[],
  move: (from: number, to: number) => void,
): ArrayDragBinding {
  const runtime = useFormContext()
  const rootRef = useRef<HTMLDivElement>(null)
  const dragSession = useRef<ArrayDragSession | null>(null)
  const array = currentArray(runtime, nodeId)
  const canDrag = array?.arrayMeta?.canReorder === true && !array.readOnly && !array.disabled

  const clearDrag = () => {
    const root = rootRef.current
    root?.removeAttribute('data-array-drag-active')
    root?.querySelectorAll<HTMLElement>('[data-dragging], [data-drop-target]').forEach((row) => {
      row.removeAttribute('data-dragging')
      row.removeAttribute('data-drop-target')
    })
    dragSession.current = null
  }

  useEffect(() => {
    const session = dragSession.current
    if (!session) return
    const activeArray = currentArray(runtime, nodeId)
    if (
      session.runtime !== runtime ||
      session.root !== rootRef.current ||
      session.identityKey !== activeArray?.arrayMeta?.identityKey ||
      activeArray?.arrayMeta?.canReorder !== true || activeArray.readOnly || activeArray.disabled ||
      !items.some((item) => item.id === session.itemId)
    ) clearDrag()
  }, [runtime, nodeId, array?.arrayMeta?.identityKey, array?.arrayMeta?.itemIds, items])

  useEffect(() => () => clearDrag(), [])

  const handleProps = (itemId: StableItemId): HTMLAttributes<HTMLSpanElement> => ({
    'aria-hidden': true,
    className: 'texaryn-array-drag-handle',
    draggable: canDrag,
    tabIndex: -1,
    onDragStart: (event) => {
      const root = rootRef.current
      const current = currentArray(runtime, nodeId)
      const identityKey = current?.arrayMeta?.identityKey
      if (
        current?.arrayMeta?.canReorder !== true || current.readOnly || current.disabled ||
        !root || identityKey === undefined || !current.arrayMeta.itemIds.includes(itemId)
      ) {
        event.preventDefault()
        return
      }
      event.stopPropagation()
      event.dataTransfer.setData(arrayDragType, itemId)
      event.dataTransfer.effectAllowed = 'move'
      dragSession.current = { runtime, identityKey, root, itemId }
      root.setAttribute('data-array-drag-active', '')
      event.currentTarget.closest<HTMLElement>('[data-array-row]')?.setAttribute('data-dragging', '')
    },
    onDragEnd: (event) => {
      event.dataTransfer.clearData(arrayDragType)
      clearDrag()
    },
  })

  const rowProps = (itemId: StableItemId): ReturnType<ArrayDragBinding['rowProps']> => ({
    'data-array-row': '',
    'data-array-item-id': itemId,
    onDragOver: (event) => {
      if (!dragPayloadPresent(event)) return
      const root = rootRef.current
      if (!root || !ownsArrayTarget(event, root)) {
        event.stopPropagation()
        return
      }
      const session = dragSession.current
      const current = currentArray(runtime, nodeId)
      const ids = current?.arrayMeta?.itemIds ?? []
      if (
        !session || session.runtime !== runtime || session.root !== root ||
        session.identityKey !== current?.arrayMeta?.identityKey ||
        current?.arrayMeta?.canReorder !== true || current.readOnly || current.disabled ||
        !ids.includes(session.itemId) || !ids.includes(itemId)
      ) {
        event.stopPropagation()
        return
      }
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'move'
      event.currentTarget.setAttribute('data-drop-target', '')
    },
    onDragLeave: (event) => {
      if (dragPayloadPresent(event)) event.currentTarget.removeAttribute('data-drop-target')
    },
    onDrop: (event) => {
      if (!dragPayloadPresent(event)) return
      event.stopPropagation()
      const root = rootRef.current
      const session = dragSession.current
      const current = currentArray(runtime, nodeId)
      const ids = current?.arrayMeta?.itemIds ?? []
      if (!root || !ownsArrayTarget(event, root) || !session) {
        clearDrag()
        return
      }
      const sourceIndex = ids.indexOf(session.itemId)
      const targetIndex = ids.indexOf(itemId)
      if (
        session.runtime !== runtime || session.root !== root ||
        session.identityKey !== current?.arrayMeta?.identityKey ||
        current?.arrayMeta?.canReorder !== true || current.readOnly || current.disabled ||
        sourceIndex < 0 || targetIndex < 0
      ) {
        clearDrag()
        return
      }
      event.preventDefault()
      const bounds = event.currentTarget.getBoundingClientRect()
      const after = event.clientY >= bounds.top + bounds.height / 2
      const insertionBoundary = targetIndex + (after ? 1 : 0)
      const destination = insertionBoundary > sourceIndex ? insertionBoundary - 1 : insertionBoundary
      clearDrag()
      if (destination !== sourceIndex) move(sourceIndex, destination)
    },
  })

  return { canDrag, rootRef, handleProps, rowProps }
}

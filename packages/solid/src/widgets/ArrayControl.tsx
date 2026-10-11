import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import type { ContainerNode, FormRuntime, StableItemId, UINode } from '@texaryn/core'
import { NodeRenderer } from '../components/NodeRenderer.js'
import { useFormContext } from '../context.js'

const arrayDragType = 'application/x-texaryn-array-item'

interface ArrayDragSession {
  runtime: FormRuntime
  identityKey: NonNullable<ContainerNode['arrayMeta']>['identityKey']
  root: HTMLDivElement
  itemId: StableItemId
}

export function ArrayControl(props: { node: UINode }) {
  const context = useFormContext()
  const container = createMemo(() => (context.document().nodes[props.node.id] ?? props.node) as ContainerNode)
  const meta = createMemo(() => container().arrayMeta)
  const title = createMemo(() => container().annotations.title)
  const itemIds = createMemo(() => meta()?.itemIds ?? [])
  const [dragSession, setDragSession] = createSignal<ArrayDragSession | null>(null)
  let root: HTMLDivElement | undefined
  const canDrag = () => meta()?.canReorder === true && !container().readOnly && !container().disabled

  const clearDrag = () => {
    root?.removeAttribute('data-array-drag-active')
    root?.querySelectorAll<HTMLElement>('[data-dragging], [data-drop-target]').forEach((row) => {
      row.removeAttribute('data-dragging')
      row.removeAttribute('data-drop-target')
    })
    setDragSession(null)
  }

  createEffect(() => {
    const session = dragSession()
    if (!session) return
    const runtime = context.form()
    if (
      session.runtime !== runtime || session.root !== root ||
      session.identityKey !== meta()?.identityKey || !canDrag() ||
      !itemIds().includes(session.itemId)
    ) clearDrag()
  })
  onCleanup(clearDrag)

  const ownsArrayTarget = (event: DragEvent) =>
    event.target instanceof Element && event.target.closest('[data-array-container]') === root
  const itemNode = (index: number) => {
    const childId = container().children[index]
    return childId ? context.document().nodes[childId] : undefined
  }
  const addMessage = () => context.messages().addItem({ itemTemplateTitle: meta()?.itemTitle, containerTitle: title() })

  const move = (from: number, to: number, event: MouseEvent) => {
    const button = event.currentTarget as HTMLButtonElement
    const wasFocused = document.activeElement === button
    const itemId = itemIds()[from]
    context.form().dispatch({ type: 'MoveItem', containerId: container().id, from, to })
    if (!wasFocused || !itemId || to === from) return
    queueMicrotask(() => {
      const row = [...document.querySelectorAll<HTMLElement>('[data-array-item-id]')]
        .find((candidate) => candidate.dataset.arrayItemId === itemId)
      const direction = to < from && to === 0 ? 'down' : to > from && to === itemIds().length - 1 ? 'up' : undefined
      if (direction) row?.querySelector<HTMLButtonElement>(`[data-reorder-direction="${direction}"]`)?.focus()
    })
  }

  return <div ref={(element) => { root = element }} data-array-container="">
    <For each={itemIds()}>{(itemId, index) => {
      const itemTitle = () => itemNode(index())?.annotations.title
      const position = () => index() + 1
      const up = () => context.messages().moveItemUp({ position: position(), itemTitle: itemTitle(), containerTitle: title() })
      const down = () => context.messages().moveItemDown({ position: position(), itemTitle: itemTitle(), containerTitle: title() })
      const remove = () => context.messages().removeItem({ position: position(), itemTitle: itemTitle(), containerTitle: title() })
      return <div
        data-array-row
        data-array-item-id={itemId}
        onDragOver={(event) => {
          if (!Array.from(event.dataTransfer?.types ?? []).includes(arrayDragType)) return
          if (!root || !ownsArrayTarget(event)) {
            event.stopPropagation()
            return
          }
          const session = dragSession()
          const ids = itemIds()
          if (
            !session || session.runtime !== context.form() || session.root !== root ||
            session.identityKey !== meta()?.identityKey || !canDrag() ||
            !ids.includes(session.itemId) || !ids.includes(itemId)
          ) {
            event.stopPropagation()
            return
          }
          event.preventDefault()
          event.stopPropagation()
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
          event.currentTarget.setAttribute('data-drop-target', '')
        }}
        onDragLeave={(event) => {
          if (Array.from(event.dataTransfer?.types ?? []).includes(arrayDragType)) {
            event.currentTarget.removeAttribute('data-drop-target')
          }
        }}
        onDrop={(event) => {
          if (!Array.from(event.dataTransfer?.types ?? []).includes(arrayDragType)) return
          event.stopPropagation()
          const session = dragSession()
          const ids = itemIds()
          if (!root || !ownsArrayTarget(event) || !session) {
            clearDrag()
            return
          }
          const sourceIndex = ids.indexOf(session.itemId)
          const targetIndex = ids.indexOf(itemId)
          if (
            session.runtime !== context.form() || session.root !== root ||
            session.identityKey !== meta()?.identityKey || !canDrag() || sourceIndex < 0 || targetIndex < 0
          ) {
            clearDrag()
            return
          }
          event.preventDefault()
          const bounds = event.currentTarget.getBoundingClientRect()
          const after = event.clientY >= bounds.top + bounds.height / 2
          const boundary = targetIndex + (after ? 1 : 0)
          const destination = boundary > sourceIndex ? boundary - 1 : boundary
          clearDrag()
          if (destination !== sourceIndex) context.form().dispatch({
            type: 'MoveItem', containerId: container().id, from: sourceIndex, to: destination,
          })
        }}
      >
        <Show when={canDrag()}>
          <span
            aria-hidden="true"
            class="texaryn-array-drag-handle"
            draggable={true}
            tabIndex={-1}
            onDragStart={(event) => {
              const identityKey = meta()?.identityKey
              if (!canDrag() || !root || identityKey === undefined || !itemIds().includes(itemId)) {
                event.preventDefault()
                return
              }
              event.stopPropagation()
              event.dataTransfer?.setData(arrayDragType, itemId)
              if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
              setDragSession({ runtime: context.form(), identityKey, root, itemId })
              root.setAttribute('data-array-drag-active', '')
              event.currentTarget.closest<HTMLElement>('[data-array-row]')?.setAttribute('data-dragging', '')
            }}
            onDragEnd={(event) => {
              event.dataTransfer?.clearData(arrayDragType)
              clearDrag()
            }}
          >⠿</span>
        </Show>
        <Show when={itemNode(index())}>{(child) => <NodeRenderer node={child()} />}</Show>
        <Show when={meta()?.canReorder && index() > 0}>
          <button type="button" aria-label={up().accessibleName} data-reorder-direction="up" onClick={(event) => move(index(), index() - 1, event)}>{up().label}</button>
        </Show>
        <Show when={meta()?.canReorder && index() < itemIds().length - 1}>
          <button type="button" aria-label={down().accessibleName} data-reorder-direction="down" onClick={(event) => move(index(), index() + 1, event)}>{down().label}</button>
        </Show>
        <Show when={meta()?.canRemove}>
          <button type="button" aria-label={remove().accessibleName} onClick={() => context.form().dispatch({ type: 'RemoveItem', containerId: container().id, index: index() })}>{remove().label}</button>
        </Show>
      </div>
    }}</For>
    <Show when={meta()?.canAdd}>
      <button type="button" aria-label={addMessage().accessibleName} onClick={() => context.form().dispatch({ type: 'InsertItem', containerId: container().id, index: itemIds().length })}>{addMessage().label}</button>
    </Show>
  </div>
}

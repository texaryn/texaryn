import { For, Show, createMemo } from 'solid-js'
import type { ContainerNode, UINode } from '@texaryn/core'
import { NodeRenderer } from '../components/NodeRenderer.js'
import { useFormContext } from '../context.js'

export function ArrayControl(props: { node: UINode }) {
  const context = useFormContext()
  const container = createMemo(() => (context.document().nodes[props.node.id] ?? props.node) as ContainerNode)
  const meta = createMemo(() => container().arrayMeta)
  const title = createMemo(() => container().annotations.title)
  const itemIds = createMemo(() => meta()?.itemIds ?? [])
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

  return <div>
    <For each={itemIds()}>{(itemId, index) => {
      const itemTitle = () => itemNode(index())?.annotations.title
      const position = () => index() + 1
      const up = () => context.messages().moveItemUp({ position: position(), itemTitle: itemTitle(), containerTitle: title() })
      const down = () => context.messages().moveItemDown({ position: position(), itemTitle: itemTitle(), containerTitle: title() })
      const remove = () => context.messages().removeItem({ position: position(), itemTitle: itemTitle(), containerTitle: title() })
      return <div data-array-row data-array-item-id={itemId}>
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

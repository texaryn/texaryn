<script lang="ts">
  import { onDestroy, tick } from 'svelte'
  import type { ContainerNode, FormRuntime, StableItemId, UINode } from '@texaryn/core'
  import { useFormContext } from '../context.js'
  import NodeRenderer from './NodeRenderer.svelte'

  interface Props {
    node: UINode
  }

  let { node }: Props = $props()
  const context = useFormContext()
  const document = context.form.document
  const messages = context.messages
  const current = $derived(($document.nodes[node.id] ?? node) as ContainerNode)
  const meta = $derived(current.arrayMeta)
  const items = $derived((meta?.itemIds ?? []).map((id, index) => ({
    id,
    nodeId: current.children[index],
  })))
  const title = $derived(current.annotations.title)
  const itemTemplateTitle = $derived(meta?.itemTitle)
  const arrayDragType = 'application/x-texaryn-array-item'
  let root: HTMLDivElement
  let dragSession = $state.raw<{
    runtime: FormRuntime
    identityKey: NonNullable<ContainerNode['arrayMeta']>['identityKey']
    root: HTMLDivElement
    itemId: StableItemId
  } | null>(null)
  const canDrag = $derived(meta?.canReorder === true && !current.readOnly && !current.disabled)

  function clearDrag(): void {
    root?.removeAttribute('data-array-drag-active')
    root?.querySelectorAll<HTMLElement>('[data-dragging], [data-drop-target]').forEach((row) => {
      row.removeAttribute('data-dragging')
      row.removeAttribute('data-drop-target')
    })
    dragSession = null
  }

  function ownsArrayTarget(event: DragEvent): boolean {
    return event.target instanceof Element && event.target.closest('[data-array-container]') === root
  }

  $effect(() => {
    const session = dragSession
    if (!session) return
    if (
      session.runtime !== context.form.runtime || session.root !== root ||
      session.identityKey !== meta?.identityKey || !canDrag ||
      !items.some((item) => item.id === session.itemId)
    ) clearDrag()
  })
  onDestroy(clearDrag)

  function add(): void {
    context.form.dispatch({ type: 'InsertItem', containerId: current.id, index: items.length })
  }

  function remove(index: number): void {
    context.form.dispatch({ type: 'RemoveItem', containerId: current.id, index })
  }

  async function move(from: number, to: number, event: MouseEvent): Promise<void> {
    const button = event.currentTarget as HTMLButtonElement
    const wasFocused = globalThis.document.activeElement === button
    const row = button.closest<HTMLElement>('[data-array-row]')
    context.form.dispatch({ type: 'MoveItem', containerId: current.id, from, to })

    if (!wasFocused) return
    if (to < from && to === 0) {
      await tick()
      row?.querySelector<HTMLButtonElement>(':scope > [data-reorder-direction="down"]')?.focus()
    }
    if (to > from && to === items.length - 1) {
      await tick()
      row?.querySelector<HTMLButtonElement>(':scope > [data-reorder-direction="up"]')?.focus()
    }
  }
</script>

<div bind:this={root} data-array-container="">
  {#each items as item, index (item.id)}
    {@const child = item.nodeId ? $document.nodes[item.nodeId] : undefined}
    {@const itemTitle = child?.annotations.title}
    <div
      role="presentation"
      data-array-row
      data-array-item-id={item.id}
      ondragover={(event) => {
        if (!Array.from(event.dataTransfer?.types ?? []).includes(arrayDragType)) return
        if (!root || !ownsArrayTarget(event)) {
          event.stopPropagation()
          return
        }
        const session = dragSession
        const ids = meta?.itemIds ?? []
        if (
          !session || session.runtime !== context.form.runtime || session.root !== root ||
          session.identityKey !== meta?.identityKey || !canDrag ||
          !ids.includes(session.itemId) || !ids.includes(item.id)
        ) {
          event.stopPropagation()
          return
        }
        event.preventDefault()
        event.stopPropagation()
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
        event.currentTarget.setAttribute('data-drop-target', '')
      }}
      ondragleave={(event) => {
        if (Array.from(event.dataTransfer?.types ?? []).includes(arrayDragType)) {
          event.currentTarget.removeAttribute('data-drop-target')
        }
      }}
      ondrop={(event) => {
        if (!Array.from(event.dataTransfer?.types ?? []).includes(arrayDragType)) return
        event.stopPropagation()
        const session = dragSession
        const ids = meta?.itemIds ?? []
        if (!root || !ownsArrayTarget(event) || !session) {
          clearDrag()
          return
        }
        const sourceIndex = ids.indexOf(session.itemId)
        const targetIndex = ids.indexOf(item.id)
        if (
          session.runtime !== context.form.runtime || session.root !== root ||
          session.identityKey !== meta?.identityKey || !canDrag || sourceIndex < 0 || targetIndex < 0
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
        if (destination !== sourceIndex) context.form.dispatch({
          type: 'MoveItem', containerId: current.id, from: sourceIndex, to: destination,
        })
      }}
    >
      {#if canDrag}
        <span
          aria-hidden="true"
          class="texaryn-array-drag-handle"
          draggable={true}
          tabindex="-1"
          ondragstart={(event) => {
            const identityKey = meta?.identityKey
            if (!canDrag || !root || identityKey === undefined || !meta?.itemIds.includes(item.id)) {
              event.preventDefault()
              return
            }
            event.stopPropagation()
            event.dataTransfer?.setData(arrayDragType, item.id)
            if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
            dragSession = { runtime: context.form.runtime, identityKey, root, itemId: item.id }
            root.setAttribute('data-array-drag-active', '')
            event.currentTarget.closest<HTMLElement>('[data-array-row]')?.setAttribute('data-dragging', '')
          }}
          ondragend={(event) => {
            event.dataTransfer?.clearData(arrayDragType)
            clearDrag()
          }}
        >⠿</span>
      {/if}
      {#if child}<NodeRenderer node={child} />{/if}

      {#if meta?.canReorder && index > 0}
        {@const message = $messages.moveItemUp({ position: index + 1, itemTitle, containerTitle: title })}
        <button
          type="button"
          aria-label={message.accessibleName}
          data-reorder-direction="up"
          onclick={(event) => void move(index, index - 1, event)}
        >
          {message.label}
        </button>
      {/if}

      {#if meta?.canReorder && index < items.length - 1}
        {@const message = $messages.moveItemDown({ position: index + 1, itemTitle, containerTitle: title })}
        <button
          type="button"
          aria-label={message.accessibleName}
          data-reorder-direction="down"
          onclick={(event) => void move(index, index + 1, event)}
        >
          {message.label}
        </button>
      {/if}

      {#if meta?.canRemove}
        {@const message = $messages.removeItem({ position: index + 1, itemTitle, containerTitle: title })}
        <button type="button" aria-label={message.accessibleName} onclick={() => remove(index)}>
          {message.label}
        </button>
      {/if}
    </div>
  {/each}

  {#if meta?.canAdd}
    {@const message = $messages.addItem({ itemTemplateTitle, containerTitle: title })}
    <button type="button" aria-label={message.accessibleName} onclick={add}>{message.label}</button>
  {/if}
</div>

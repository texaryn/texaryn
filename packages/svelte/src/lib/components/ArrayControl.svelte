<script lang="ts">
  import { tick } from 'svelte'
  import type { ContainerNode, UINode } from '@texaryn/core'
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

<div>
  {#each items as item, index (item.id)}
    {@const child = item.nodeId ? $document.nodes[item.nodeId] : undefined}
    {@const itemTitle = child?.annotations.title}
    <div data-array-row>
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

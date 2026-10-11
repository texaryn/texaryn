<script lang="ts">
  import { objectChildKey } from '@texaryn/core'
  import type { ContainerNode, UINode } from '@texaryn/core'
  import { englishMessages } from '@texaryn/core'
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
  const nested = $derived(node.parentId !== null)
  const title = $derived(current.annotations.title)
  const children = $derived(
    current.children
      .map((id) => $document.nodes[id])
      .filter((child): child is UINode => child != null),
  )
  const actions = $derived(firstTargets(current.boundaryTargets ?? []))

  function firstTargets(targets: NonNullable<ContainerNode['boundaryTargets']>) {
    const byReason = new Map<string, (typeof targets)[number]>()
    for (const target of targets) {
      if (!byReason.has(target.reason)) byReason.set(target.reason, target)
    }
    return [...byReason.values()]
  }

  function expand(target: (typeof actions)[number]): void {
    context.form.dispatch({
      type: 'ExpandBoundary',
      containerId: current.id,
      targetToken: target.token,
    })
  }

  function expandMessage(target: (typeof actions)[number]) {
    const makeMessage = $messages.expandBoundary ?? englishMessages.expandBoundary!
    return makeMessage({
      boundary: target.reason,
      containerTitle: title,
      position: 1,
      count: 1,
    })
  }
</script>

{#snippet renderedChildren()}
  {#each children as child (objectChildKey(child))}
    <NodeRenderer node={child} />
  {/each}
  {#each actions as target (target.reason)}
    {@const message = expandMessage(target)}
    <button type="button" aria-label={message.accessibleName} onclick={() => expand(target)}>
      {message.label}
    </button>
  {/each}
{/snippet}

{#if nested}
  <fieldset role={title === undefined ? 'none' : undefined}>
    {#if title !== undefined}<legend>{title}</legend>{/if}
    <div>{@render renderedChildren()}</div>
  </fieldset>
{:else}
  <div>{@render renderedChildren()}</div>
{/if}

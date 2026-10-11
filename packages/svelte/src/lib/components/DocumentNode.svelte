<script lang="ts">
  import type { DocumentNode, DocumentRuntime, UIDocumentV2 } from '@texaryn/core'
  import type { RendererRegistry } from '@texaryn/core'
  import type { DocumentWidgetComponent } from '../widget.js'
  import DocumentList from './DocumentList.svelte'
  import DocumentTable from './DocumentTable.svelte'
  import DocumentNodeView from './DocumentNode.svelte'

  let {
    nodeId,
    runtime,
    document,
    registry,
    onActionError,
  }: {
    nodeId: string
    runtime: DocumentRuntime
    document: UIDocumentV2
    registry?: RendererRegistry<DocumentWidgetComponent, DocumentNode>
    onActionError?: (error: unknown) => void
  } = $props()

  let node = $derived(document.nodes[nodeId])
  let widget = $derived(node ? registry?.resolve(node) : undefined)

  function invokeAction(actionNode: Extract<DocumentNode, { type: 'action' }>): void {
    void runtime.invokeAction(actionNode.id).catch((error: unknown) => {
      if (onActionError) onActionError(error)
      else console.error(error)
    })
  }
</script>

{#if node}
  {#if widget}
    {@const Widget = widget}
    <Widget {node} {runtime} />
  {:else if node.type === 'container'}
    {#if node.containerType === 'group'}
      <fieldset>
        <legend>{node.annotations.title}</legend>
        {#each node.children as childId (childId)}
          <DocumentNodeView nodeId={childId} {runtime} {document} {registry} {onActionError} />
        {/each}
      </fieldset>
    {:else}
      <div data-texaryn-layout="">
        {#each node.children as childId (childId)}
          <DocumentNodeView nodeId={childId} {runtime} {document} {registry} {onActionError} />
        {/each}
      </div>
    {/if}
  {:else if node.type === 'text'}
    {#if node.textRole === 'heading'}
      <h2>{node.content}</h2>
    {:else if node.textRole === 'help'}
      <p role="note">{node.content}</p>
    {:else}
      <p>{node.content}</p>
    {/if}
  {:else if node.type === 'list'}
    <DocumentList {node} {runtime} />
  {:else if node.type === 'table'}
    <DocumentTable {node} {runtime} />
  {:else}
    <button type="button" disabled={!runtime.hasActionHandler(node.actionType)} onclick={() => invokeAction(node)}>{node.label}</button>
  {/if}
{/if}

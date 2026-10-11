<script lang="ts">
  import type { DocumentNode, DocumentRuntime } from '@texaryn/core'
  import type { RendererRegistry } from '@texaryn/core'
  import type { DocumentWidgetComponent } from '../widget.js'
  import DocumentNodeView from './DocumentNode.svelte'

  interface Props {
    runtime: DocumentRuntime
    registry?: RendererRegistry<DocumentWidgetComponent, DocumentNode>
    onActionError?: (error: unknown) => void
    children?: import('svelte').Snippet
  }

  let { runtime, registry, onActionError, children }: Props = $props()
  let document = $state<import('@texaryn/core').UIDocumentV2 | undefined>()
  $effect(() => {
    const store = runtime.document
    document = store.getSnapshot()
    return store.subscribe(() => { document = store.getSnapshot() })
  })
</script>

{#if document?.nodes[document.rootId]}
  <DocumentNodeView
    nodeId={document.rootId}
    {runtime}
    {document}
    {registry}
    {onActionError}
  />
{/if}

{@render children?.()}

<script lang="ts">
  import type { DocumentCollectionRow, DocumentRuntime, ListNode } from '@texaryn/core'

  let { node, runtime }: { node: ListNode; runtime: DocumentRuntime } = $props()
  let rows = $state<readonly DocumentCollectionRow[]>([])

  $effect(() => {
    const store = runtime.getCollection(node.id)
    if (!store) {
      rows = []
      return
    }
    rows = store.getSnapshot()
    return store.subscribe(() => { rows = store.getSnapshot() })
  })
</script>

<ul>
  {#each rows as row (row.id)}
    <li>{row.value === null ? '' : String(row.value)}</li>
  {/each}
</ul>

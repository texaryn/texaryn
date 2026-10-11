<script lang="ts">
  import type { DocumentCollectionRow, DocumentRuntime, TableNode } from '@texaryn/core'

  let { node, runtime }: { node: TableNode; runtime: DocumentRuntime } = $props()
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

<table>
  <thead>
    <tr>
      {#each node.columns as column (column.id)}
        <th scope="col">{column.label}</th>
      {/each}
    </tr>
  </thead>
  <tbody>
    {#each rows as row (row.id)}
      <tr>
        {#each node.columns as column, index (column.id)}
          <td>{row.cells[index] === null ? '' : String(row.cells[index])}</td>
        {/each}
      </tr>
    {/each}
  </tbody>
</table>

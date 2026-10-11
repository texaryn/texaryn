<script lang="ts">
  import type { ValidationError } from '@texaryn/core'

  export let id: string
  export let errors: readonly ValidationError[] = []
</script>

<div {id} aria-live="polite" aria-atomic="true">
  {#each errors as error, index (`${error.instancePointer}:${error.keyword}:${index}`)}
    <div>{error.message ?? error.keyword}</div>
  {/each}
</div>

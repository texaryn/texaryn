<script lang="ts">
  import type { ValidationError } from '@texaryn/core'
  import { useFormContext } from '../context.js'

  export let id: string
  export let errors: readonly ValidationError[] = []
  const { messages } = useFormContext()
</script>

<div {id} aria-live="polite" aria-atomic="true">
  {#each errors as error, index (`${error.instancePointer}:${error.keyword}:${index}`)}
    <div>{$messages.validationMessage(error)}</div>
  {/each}
</div>

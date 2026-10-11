<script lang="ts">
  import { tick } from 'svelte'
  import { createFailedSubmitTracker, visibleErrorLabel, visibleErrorMessages } from '@texaryn/core'
  import type { VisibleError } from '@texaryn/core'
  import { useFormContext } from '../context.js'
  import { makeId } from '../field-props.js'

  export let focus = true

  const context = useFormContext()
  const visibleErrors = context.form.visibleErrors
  const submission = context.form.submission
  const messages = context.messages
  const tracker = createFailedSubmitTracker(context.form.runtime.submission.getSnapshot())
  const headingId = makeId(context.idPrefix, 'error-summary', 'heading')
  let container: HTMLDivElement | undefined

  $: if (tracker.settle($submission, $visibleErrors)) {
    void tick().then(() => {
      if (focus && container?.isConnected) container.focus()
    })
  }

  function details(entry: VisibleError): string {
    return $messages.errorSummaryDetail({ messages: visibleErrorMessages(entry) })
  }
</script>

{#if $visibleErrors.length > 0}
  <div bind:this={container} role="group" tabindex="-1" aria-labelledby={headingId}>
    <h2 id={headingId}>{$messages.errorSummaryHeading({ count: $visibleErrors.length })}</h2>
    <ul>
      {#each $visibleErrors as entry (entry.nodeId)}
        <li>
          <a href={`#${makeId(context.idPrefix, entry.nodeId, 'input')}`}>{visibleErrorLabel(entry)}</a>
          {details(entry)}
        </li>
      {/each}
    </ul>
  </div>
{/if}

<script lang="ts">
  import type { RendererRegistry } from '@texaryn/core'
  import type { SvelteFormBinding } from '../src/lib/form.js'
  import type { WidgetComponent } from '../src/lib/widget.js'
  import FormRoot from '../src/lib/components/FormRoot.svelte'

  let {
    form,
    registry,
    showErrorSummary = false,
  }: {
    form: SvelteFormBinding
    registry: RendererRegistry<WidgetComponent>
    showErrorSummary?: boolean
  } = $props()

  function submit(event: SubmitEvent): void {
    event.preventDefault()
    form.dispatch({ type: 'Submit' })
  }
</script>

<form data-testid="consumer-form" novalidate onsubmit={submit}>
  <FormRoot {form} {registry} {showErrorSummary} />
  <button type="submit">Submit</button>
</form>

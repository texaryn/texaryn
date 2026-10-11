<script lang="ts">
  import { onDestroy } from 'svelte'
  import type { Snippet } from 'svelte'
  import { englishMessages } from '@texaryn/core'
  import type { FormMessages, RendererRegistry, UINode } from '@texaryn/core'
  import { derived, get, writable } from 'svelte/store'
  import type { SvelteFormBinding } from '../form.js'
  import type { WidgetComponent } from '../widget.js'
  import { provideFormContext } from '../context.js'
  import { createDefaultRegistry } from '../registry.js'
  import ErrorSummary from './ErrorSummary.svelte'
  import NodeRenderer from './NodeRenderer.svelte'

  interface Props {
    form: SvelteFormBinding
    registry?: RendererRegistry<WidgetComponent>
    messages?: FormMessages
    idPrefix?: string
    destroyOnUnmount?: boolean
    children?: Snippet
  }

  let {
    form,
    registry = createDefaultRegistry(),
    messages = englishMessages,
    idPrefix,
    destroyOnUnmount = true,
    children,
  }: Props = $props()

  function capture<T>(read: () => T): T {
    return read()
  }

  const formStore = writable(capture(() => form))
  const currentForm: SvelteFormBinding = {
    get runtime() {
      return get(formStore).runtime
    },
    document: derived(formStore, ($form, set) => $form.document.subscribe(set)),
    data: derived(formStore, ($form, set) => $form.data.subscribe(set)),
    submission: derived(formStore, ($form, set) => $form.submission.subscribe(set)),
    visibleErrors: derived(formStore, ($form, set) => $form.visibleErrors.subscribe(set)),
    dispatch: (command) => get(formStore).dispatch(command),
    getNodeState: (nodeId) => get(formStore).getNodeState(nodeId),
  }
  const registryStore = writable(capture(() => registry))
  const messagesStore = writable(capture(() => messages))
  const generatedId = $props.id()
  const generatedPrefix = `texaryn-${Array.from(generatedId, (char) => char.codePointAt(0)!.toString(36)).join('_')}`
  const resolvedIdPrefix = capture(() => idPrefix ?? generatedPrefix)
  const runtime = derived(formStore, ($form) => $form.runtime)
  const context = {
    form: currentForm,
    registry: registryStore,
    messages: messagesStore,
    idPrefix: resolvedIdPrefix,
  }
  provideFormContext(context)

  const document = currentForm.document
  const rootNode = $derived($document.nodes[$document.rootId] as UINode | undefined)

  let previousForm = capture(() => form)
  $effect(() => {
    registryStore.set(registry)
    messagesStore.set(messages)
    const nextForm = form
    if (nextForm === previousForm) return

    const replacedForm = previousForm
    previousForm = nextForm
    formStore.set(nextForm)
    if (destroyOnUnmount && replacedForm.runtime !== nextForm.runtime) {
      replacedForm.runtime.destroy()
    }
  })

  onDestroy(() => {
    if (destroyOnUnmount) get(formStore).runtime.destroy()
  })

  function handleSubmit(event: SubmitEvent): void {
    event.preventDefault()
    currentForm.dispatch({ type: 'Submit' })
  }
</script>

<form onsubmit={handleSubmit}>
  {#key $runtime}
    <ErrorSummary />
  {/key}
  {#if rootNode}
    <NodeRenderer node={rootNode} />
  {/if}
  {@render children?.()}
</form>

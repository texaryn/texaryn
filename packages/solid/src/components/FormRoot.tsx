import { createEffect, createMemo, createUniqueId, onCleanup, Show } from 'solid-js'
import type { JSX } from 'solid-js'
import { englishMessages } from '@texaryn/core'
import type { FormMessages, FormRuntime, RendererRegistry } from '@texaryn/core'
import { FormContext } from '../context.js'
import { useStore } from '../store.js'
import type { WidgetComponent } from '../widget.js'
import { createDefaultRegistry } from '../registry.js'
import { ErrorSummary } from './ErrorSummary.js'
import { NodeRenderer } from './NodeRenderer.js'

export interface FormRootProps {
  form: FormRuntime
  registry?: RendererRegistry<WidgetComponent>
  messages?: FormMessages
  idPrefix?: string
  destroyOnUnmount?: boolean
  showErrorSummary?: boolean
  summaryFocus?: boolean
  children?: JSX.Element
}

function encodeId(value: string): string {
  return Array.from(value, (char) => char.codePointAt(0)!.toString(36)).join('_')
}

export function FormRoot(props: FormRootProps) {
  const defaultRegistry = createDefaultRegistry()
  const initialForm = props.form
  const form = createMemo(() => props.form)
  const document = useStore(() => form().document)
  const registry = () => props.registry ?? defaultRegistry
  const messages = () => props.messages ?? englishMessages
  const generatedPrefix = `texaryn-${encodeId(createUniqueId())}`
  const idPrefix = () => props.idPrefix ?? generatedPrefix
  let previousForm = initialForm

  createEffect(() => {
    const nextForm = form()
    if (nextForm === previousForm) return
    const replaced = previousForm
    previousForm = nextForm
    if (props.destroyOnUnmount !== false && replaced !== nextForm) replaced.destroy()
  })
  onCleanup(() => {
    if (props.destroyOnUnmount !== false) form().destroy()
  })

  const context = { form, document, registry, messages, idPrefix }
  const submit = (event: SubmitEvent) => {
    event.preventDefault()
    form().dispatch({ type: 'Submit' })
  }

  return (
    <FormContext.Provider value={context}>
      <form onSubmit={submit}>
        <Show when={props.showErrorSummary && form()} keyed>
          <ErrorSummary focus={props.summaryFocus !== false} />
        </Show>
        <Show when={document().nodes[document().rootId]}>
          {(root) => <NodeRenderer node={root()} />}
        </Show>
        {props.children}
      </form>
    </FormContext.Provider>
  )
}

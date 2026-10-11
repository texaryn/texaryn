import { getContext, setContext } from 'svelte'
import type { FormMessages, RendererRegistry } from '@texaryn/core'
import type { Readable } from 'svelte/store'
import type { SvelteFormBinding } from './form.js'
import type { WidgetComponent } from './widget.js'

const FORM_CONTEXT = Symbol('texaryn.svelte.form')

export interface SvelteFormContext {
  form: SvelteFormBinding
  registry: Readable<RendererRegistry<WidgetComponent>>
  messages: Readable<FormMessages>
  idPrefix: string
}

export function provideFormContext(context: SvelteFormContext): void {
  setContext(FORM_CONTEXT, context)
}

export function useFormContext(): SvelteFormContext {
  const context = getContext<SvelteFormContext | undefined>(FORM_CONTEXT)
  if (!context) {
    throw new Error('Svelte form widgets must be rendered below FormRoot')
  }
  return context
}

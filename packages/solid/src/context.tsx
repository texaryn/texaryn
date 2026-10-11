import { createContext, useContext } from 'solid-js'
import type { Accessor } from 'solid-js'
import type { FormMessages, FormRuntime, RendererRegistry, UIDocument } from '@texaryn/core'
import type { WidgetComponent } from './widget.js'

export interface SolidFormContext {
  form: Accessor<FormRuntime>
  document: Accessor<UIDocument>
  registry: Accessor<RendererRegistry<WidgetComponent>>
  messages: Accessor<FormMessages>
  idPrefix: Accessor<string>
}

export const FormContext = createContext<SolidFormContext>()

export function useFormContext(): SolidFormContext {
  const context = useContext(FormContext)
  if (!context) throw new Error('Solid form widgets must be rendered below FormRoot')
  return context
}

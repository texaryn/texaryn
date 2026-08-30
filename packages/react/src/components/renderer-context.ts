import { createContext, useContext } from 'react'
import type { ComponentType } from 'react'
import type { UIDocument, UINode, RendererRegistry } from '@texaryn/core'

/**
 * A widget component only ever receives the node it renders. Container
 * widgets recover the document and registry from RendererContext instead,
 * because RendererRegistry<T> fixes the widget prop shape to `{ node }`.
 */
export type WidgetComponent = ComponentType<{ node: UINode }>

export interface RendererContextValue {
  document: UIDocument
  registry: RendererRegistry<WidgetComponent>
}

export const RendererContext = createContext<RendererContextValue | null>(null)

export function useRendererContext(): RendererContextValue {
  const value = useContext(RendererContext)
  if (!value) {
    throw new Error('useRendererContext must be used within a NodeRenderer/FormRoot tree')
  }
  return value
}

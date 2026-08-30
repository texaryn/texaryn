import type { RendererRegistry } from '@texaryn/core'
import { useFormContext } from '../context.js'
import { useStore } from '../hooks/use-store.js'
import { NodeRenderer } from './NodeRenderer.js'
import type { WidgetComponent } from './renderer-context.js'

export interface FormRootProps {
  registry: RendererRegistry<WidgetComponent>
}

export function FormRoot({ registry }: FormRootProps) {
  const runtime = useFormContext()
  const document = useStore(runtime.document)
  const rootNode = document.nodes[document.rootId]

  if (!rootNode) {
    return null
  }

  return <NodeRenderer node={rootNode} document={document} registry={registry} />
}

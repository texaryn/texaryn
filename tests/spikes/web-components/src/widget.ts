import type { FormRuntime, RendererRegistry, UINode } from '@texaryn/core'

/**
 * A widget owns one DOM subtree for one node. `update` may hand it a
 * different node than it mounted with: after an array move the row keeps
 * its widget while the positional node underneath changes.
 */
export interface DomWidget {
  element: HTMLElement
  update(node: UINode): void
  destroy(): void
}

export type WidgetFactory = (node: UINode, ctx: RenderContext) => DomWidget

export interface NodeBinding {
  readonly element: HTMLElement
  update(node: UINode): void
  destroy(): void
}

export interface RenderContext {
  runtime: FormRuntime
  registry: RendererRegistry<WidgetFactory>
  idPrefix: string
  mountChild(node: UINode): NodeBinding
}

import type { FormRuntime, RendererRegistry } from '@texaryn/core'
import { createNodeBinding } from './binding.js'
import type { NodeBinding, RenderContext, WidgetFactory } from './widget.js'

export interface Mount {
  unmount(): void
}

/**
 * Renders a runtime's document into a container and follows every recompile
 * by updating the root binding in place. The runtime is borrowed: unmounting
 * releases subscriptions and DOM, never the runtime.
 */
export function mountForm(
  container: HTMLElement,
  runtime: FormRuntime,
  registry: RendererRegistry<WidgetFactory>,
  idPrefix: string,
): Mount {
  const ctx: RenderContext = {
    runtime,
    registry,
    idPrefix,
    mountChild: (node) => createNodeBinding(node, ctx),
  }
  let doc = runtime.document.getSnapshot()
  let root: NodeBinding = createNodeBinding(doc.nodes[doc.rootId], ctx)
  container.append(root.element)

  const unsubscribe = runtime.document.subscribe(() => {
    const next = runtime.document.getSnapshot()
    const rootNode = next.nodes[next.rootId]
    if (next.rootId === doc.rootId) {
      root.update(rootNode)
    } else {
      const replacement = createNodeBinding(rootNode, ctx)
      root.element.replaceWith(replacement.element)
      root.destroy()
      root = replacement
    }
    doc = next
  })

  return {
    unmount() {
      unsubscribe()
      root.destroy()
      root.element.remove()
    },
  }
}

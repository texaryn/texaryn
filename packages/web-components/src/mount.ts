import { englishMessages } from '@texaryn/core'
import type { FormMessages, FormRuntime, RendererRegistry } from '@texaryn/core'
import { createNodeBinding } from './binding.js'
import type { NodeBinding, RenderContext, WidgetFactory } from './widget.js'

export interface MountOptions {
  registry: RendererRegistry<WidgetFactory>
  idPrefix: string
  /** The whole set, or English. */
  messages?: FormMessages
}

export interface Mount {
  /** A locale change recompiles no document, so this reconciles in place; unmounting would drop focus and caret. */
  setMessages(messages: FormMessages): void
  unmount(): void
}

/**
 * Renders a runtime's document into a container and follows every recompile
 * by updating the root binding in place. The runtime is borrowed: unmounting
 * releases subscriptions and DOM, never the runtime.
 */
export function mountForm(container: HTMLElement, runtime: FormRuntime, options: MountOptions): Mount {
  const { registry, idPrefix, messages = englishMessages } = options
  const ctx: RenderContext = {
    runtime,
    registry,
    idPrefix,
    messages,
    mountChild: (node) => createNodeBinding(node, ctx),
  }
  let doc = runtime.document.getSnapshot()
  let root: NodeBinding = createNodeBinding(doc.nodes[doc.rootId], ctx)
  container.append(root.element)
  let live = true

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
    setMessages(next) {
      if (!live) return
      if (next === ctx.messages) return
      ctx.messages = next
      const snapshot = runtime.document.getSnapshot()
      root.update(snapshot.nodes[snapshot.rootId])
    },
    unmount() {
      live = false
      unsubscribe()
      root.destroy()
      root.element.remove()
    },
  }
}

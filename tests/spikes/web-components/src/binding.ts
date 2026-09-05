import type { UINode } from '@texaryn/core'
import type { DomWidget, NodeBinding, RenderContext, WidgetFactory } from './widget.js'

function placeholder(): DomWidget {
  const element = document.createElement('span')
  element.hidden = true
  return { element, update() {}, destroy() {} }
}

/**
 * Resolves a widget for a node and keeps it across updates while the same
 * factory still matches. Visibility is a `hidden` toggle rather than an
 * unmount, so a conditional reveal never rebuilds the subtree.
 */
export function createNodeBinding(initial: UINode, ctx: RenderContext): NodeBinding {
  let factory: WidgetFactory | undefined = ctx.registry.resolve(initial)
  let widget = factory ? factory(initial, ctx) : placeholder()
  widget.element.hidden = !initial.visible

  return {
    get element() {
      return widget.element
    },
    update(node) {
      const next = ctx.registry.resolve(node)
      if (next !== factory) {
        const replacement = next ? next(node, ctx) : placeholder()
        widget.element.replaceWith(replacement.element)
        widget.destroy()
        widget = replacement
        factory = next
      } else {
        widget.update(node)
      }
      widget.element.hidden = !node.visible
    },
    destroy() {
      widget.destroy()
    },
  }
}

import { createRendererRegistry } from '@texaryn/core'
import type { FieldNode, RendererRegistry, UINode } from '@texaryn/core'
import { arrayControl, objectLayout } from './containers.js'
import { checkbox, numberInput, select, textInput, textarea } from './fields.js'
import type { WidgetFactory } from './widget.js'

function field(node: UINode): FieldNode | null {
  return node.type === 'field' ? node : null
}

/**
 * The same tests and ranks as the React and Vue default registries, on
 * purpose. If the three ever disagree about which widget a node resolves to,
 * the difference is a renderer's opinion leaking into what the document means.
 */
export function createDefaultRegistry(): RendererRegistry<WidgetFactory> {
  const registry = createRendererRegistry<WidgetFactory>()

  registry.register(
    { rank: 1, test: (n) => field(n)?.fieldType === 'string' && field(n)?.enumValues == null },
    textInput,
  )
  registry.register(
    { rank: 1, test: (n) => field(n)?.fieldType === 'number' || field(n)?.fieldType === 'integer' },
    numberInput,
  )
  registry.register({ rank: 1, test: (n) => field(n)?.fieldType === 'boolean' }, checkbox)
  registry.register({ rank: 2, test: (n) => (field(n)?.enumValues?.length ?? 0) > 0 }, select)
  registry.register({ rank: 5, test: (n) => field(n)?.widget === 'textarea' }, textarea)
  registry.register(
    { rank: 1, test: (n) => n.type === 'container' && n.containerType === 'object' },
    objectLayout,
  )
  registry.register(
    { rank: 1, test: (n) => n.type === 'container' && n.containerType === 'array' },
    arrayControl,
  )
  return registry
}

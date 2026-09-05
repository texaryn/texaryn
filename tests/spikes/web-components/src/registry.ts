import { createRendererRegistry } from '@texaryn/core'
import type { RendererRegistry } from '@texaryn/core'
import { arrayControl, objectLayout } from './containers.js'
import { checkbox, numberInput, select, textInput } from './fields.js'
import type { WidgetFactory } from './widget.js'

/** The same testers and ranks as the React and Vue default registries. */
export function createDefaultRegistry(): RendererRegistry<WidgetFactory> {
  const registry = createRendererRegistry<WidgetFactory>()
  registry.register(
    { rank: 1, test: (n) => n.type === 'container' && n.containerType === 'object' },
    objectLayout,
  )
  registry.register(
    { rank: 1, test: (n) => n.type === 'container' && n.containerType === 'array' },
    arrayControl,
  )
  registry.register({ rank: 1, test: (n) => n.type === 'field' && n.fieldType === 'string' }, textInput)
  registry.register(
    { rank: 1, test: (n) => n.type === 'field' && (n.fieldType === 'number' || n.fieldType === 'integer') },
    numberInput,
  )
  registry.register({ rank: 1, test: (n) => n.type === 'field' && n.fieldType === 'boolean' }, checkbox)
  registry.register(
    { rank: 5, test: (n) => n.type === 'field' && (n.enumValues?.length ?? 0) > 0 },
    select,
  )
  return registry
}

import { createRendererRegistry } from '@texaryn/core'
import type { RendererRegistry } from '@texaryn/core'
import type { WidgetComponent } from '../widget.js'
import { ArrayControl } from './array-control.js'
import { FieldWidgetComponent } from './field.js'
import { ObjectLayout } from './object-layout.js'

export function createDefaultRegistry(): RendererRegistry<WidgetComponent> {
  const registry = createRendererRegistry<WidgetComponent>()
  registry.register({ test: (node) => node.type === 'field', rank: 1 }, FieldWidgetComponent)
  registry.register(
    { test: (node) => node.type === 'container' && node.containerType === 'object', rank: 1 },
    ObjectLayout,
  )
  registry.register(
    { test: (node) => node.type === 'container' && node.containerType === 'array', rank: 1 },
    ArrayControl,
  )
  return registry
}

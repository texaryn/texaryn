import { createRendererRegistry } from '@texaryn/core'
import type { FieldNode, RendererRegistry } from '@texaryn/core'
import type { WidgetComponent } from './widget.js'
import ArrayControl from './components/ArrayControl.svelte'
import FieldWidget from './components/FieldWidget.svelte'
import ObjectLayout from './components/ObjectLayout.svelte'

export function createDefaultRegistry(): RendererRegistry<WidgetComponent> {
  const registry = createRendererRegistry<WidgetComponent>()

  registry.register(
    {
      test: (node) => node.type === 'field' && (node as FieldNode).enumValues != null && (node as FieldNode).enumValues!.length > 0,
      rank: 2,
    },
    FieldWidget,
  )
  registry.register(
    {
      test: (node) => node.type === 'field',
      rank: 1,
    },
    FieldWidget,
  )
  registry.register(
    {
      test: (node) => node.type === 'container' && node.containerType === 'object',
      rank: 1,
    },
    ObjectLayout,
  )
  registry.register(
    {
      test: (node) => node.type === 'container' && node.containerType === 'array',
      rank: 1,
    },
    ArrayControl,
  )

  return registry
}

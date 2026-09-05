import { createRendererRegistry } from '@texaryn/core'
import type { FieldNode, RendererRegistry } from '@texaryn/core'
import type { WidgetComponent } from '../widget.js'
import { Checkbox, NumberInput, Select, Textarea, TextInput } from './inputs.js'
import { ArrayControl, ObjectLayout } from './containers.js'

/**
 * The same tests and ranks as the React default registry, on purpose. If the
 * two ever disagree about which widget a node resolves to, the difference is
 * a renderer's opinion leaking into what the document means.
 */
export function createDefaultRegistry(): RendererRegistry<WidgetComponent> {
  const registry = createRendererRegistry<WidgetComponent>()

  registry.register(
    {
      test: (node) =>
        node.type === 'field' &&
        (node as FieldNode).fieldType === 'string' &&
        (node as FieldNode).enumValues == null,
      rank: 1,
    },
    TextInput,
  )

  registry.register(
    {
      test: (node) =>
        node.type === 'field' &&
        ((node as FieldNode).fieldType === 'number' || (node as FieldNode).fieldType === 'integer'),
      rank: 1,
    },
    NumberInput,
  )

  registry.register(
    {
      test: (node) => node.type === 'field' && (node as FieldNode).fieldType === 'boolean',
      rank: 1,
    },
    Checkbox,
  )

  registry.register(
    {
      test: (node) =>
        node.type === 'field' &&
        (node as FieldNode).enumValues != null &&
        (node as FieldNode).enumValues!.length > 0,
      rank: 2,
    },
    Select,
  )

  registry.register(
    {
      test: (node) => node.type === 'field' && (node as FieldNode).widget === 'textarea',
      rank: 5,
    },
    Textarea,
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

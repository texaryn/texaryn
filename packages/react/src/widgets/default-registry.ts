import { createRendererRegistry } from '@texaryn/core'
import type { RendererRegistry, FieldNode } from '@texaryn/core'
import type { WidgetComponent } from '../components/renderer-context.js'
import { TextInput } from './TextInput.js'
import { NumberInput } from './NumberInput.js'
import { Checkbox } from './Checkbox.js'
import { Select } from './Select.js'
import { Textarea } from './Textarea.js'
import { ObjectLayout } from './ObjectLayout.js'
import { ArrayControl } from './ArrayControl.js'

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

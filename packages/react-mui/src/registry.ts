import { createRendererRegistry } from '@texaryn/core'
import type { FieldNode, RendererRegistry, UINode } from '@texaryn/core'
import type { WidgetComponent } from '@texaryn/react'
import { MuiTextInput } from './widgets/MuiTextInput.js'
import { MuiNumberInput } from './widgets/MuiNumberInput.js'
import { MuiTextarea } from './widgets/MuiTextarea.js'
import { MuiSelect } from './widgets/MuiSelect.js'
import { MuiCheckbox } from './widgets/MuiCheckbox.js'
import { MuiObjectLayout } from './widgets/MuiObjectLayout.js'
import { MuiArrayControl } from './widgets/MuiArrayControl.js'

export function createMuiRegistry(): RendererRegistry<WidgetComponent> {
  const registry = createRendererRegistry<WidgetComponent>()
  const isField = (node: UINode): node is FieldNode => node.type === 'field'

  registry.register(
    { test: (n) => isField(n) && n.fieldType === 'string' && n.enumValues == null, rank: 1 },
    MuiTextInput,
  )
  registry.register(
    { test: (n) => isField(n) && (n.fieldType === 'number' || n.fieldType === 'integer'), rank: 1 },
    MuiNumberInput,
  )
  registry.register(
    { test: (n) => isField(n) && n.fieldType === 'boolean', rank: 1 },
    MuiCheckbox,
  )
  registry.register(
    { test: (n) => isField(n) && n.enumValues != null && n.enumValues.length > 0, rank: 2 },
    MuiSelect,
  )
  registry.register(
    { test: (n) => isField(n) && n.widget === 'textarea', rank: 5 },
    MuiTextarea,
  )
  registry.register(
    { test: (n) => n.type === 'container' && n.containerType === 'object', rank: 1 },
    MuiObjectLayout,
  )
  registry.register(
    { test: (n) => n.type === 'container' && n.containerType === 'array', rank: 1 },
    MuiArrayControl,
  )

  return registry
}

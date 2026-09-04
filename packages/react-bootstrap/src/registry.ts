import { createRendererRegistry } from '@texaryn/core'
import type { FieldNode, RendererRegistry, UINode } from '@texaryn/core'
import type { WidgetComponent } from '@texaryn/react'
import { BootstrapTextInput, BootstrapNumberInput, BootstrapCheckbox, BootstrapSelect, BootstrapTextarea, BootstrapObjectLayout, BootstrapArrayControl } from './widgets/index.js'

export function createBootstrapRegistry(): RendererRegistry<WidgetComponent> {
  const registry = createRendererRegistry<WidgetComponent>()
  const isField = (node: UINode): node is FieldNode => node.type === 'field'

  registry.register({ test: (n) => isField(n) && n.fieldType === 'string' && n.enumValues == null, rank: 1 }, BootstrapTextInput)
  registry.register({ test: (n) => isField(n) && (n.fieldType === 'number' || n.fieldType === 'integer'), rank: 1 }, BootstrapNumberInput)
  registry.register({ test: (n) => isField(n) && n.fieldType === 'boolean', rank: 1 }, BootstrapCheckbox)
  registry.register({ test: (n) => isField(n) && n.enumValues != null && n.enumValues.length > 0, rank: 2 }, BootstrapSelect)
  registry.register({ test: (n) => isField(n) && n.widget === 'textarea', rank: 5 }, BootstrapTextarea)

  registry.register({ test: (n) => n.type === 'container' && n.containerType === 'object', rank: 1 }, BootstrapObjectLayout)
  registry.register({ test: (n) => n.type === 'container' && n.containerType === 'array', rank: 1 }, BootstrapArrayControl)
  return registry
}

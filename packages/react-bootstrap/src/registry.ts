import { createRendererRegistry } from '@texaryn/core'
import type { RendererRegistry } from '@texaryn/core'
import type { WidgetComponent } from '@texaryn/react'

export function createBootstrapRegistry(): RendererRegistry<WidgetComponent> {
  return createRendererRegistry<WidgetComponent>()
}

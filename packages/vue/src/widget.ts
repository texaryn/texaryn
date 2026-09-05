import type { Component } from 'vue'
import type { UINode } from '@texaryn/core'

/**
 * A widget receives only the node it renders, matching React's contract,
 * because `RendererRegistry<T>` fixes the widget prop shape. Everything else
 * a container needs (the document, the registry) arrives through inject.
 */
export type WidgetComponent = Component<{ node: UINode }>

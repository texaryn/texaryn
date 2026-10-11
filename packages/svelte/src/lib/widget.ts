import type { Component } from 'svelte'
import type { UINode } from '@texaryn/core'

export type WidgetComponent = Component<{ node: UINode }>

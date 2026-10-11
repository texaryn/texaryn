import type { Component } from 'svelte'
import type { DocumentNode, DocumentRuntime, UINode } from '@texaryn/core'

export type WidgetComponent = Component<{ node: UINode }>
export type DocumentWidgetComponent = Component<{ node: DocumentNode; runtime: DocumentRuntime }>

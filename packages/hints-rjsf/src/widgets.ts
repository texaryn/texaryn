import type { NodeProjection } from '@texaryn/core'

export type NodeKind = 'string' | 'enum' | 'number' | 'boolean' | 'object' | 'array' | 'unknown'

export type WidgetOutcome = 'default' | 'textarea' | 'hidden' | 'ignored' | 'component'

const RENDERED_AS_DEFAULT: Readonly<Record<NodeKind, readonly string[]>> = {
  string: ['text'],
  enum: ['select'],
  number: ['text', 'updown'],
  boolean: ['checkbox'],
  array: ['select'],
  object: [],
  unknown: ['text', 'updown', 'select', 'checkbox'],
}

export function kindOf(node: NodeProjection | undefined): NodeKind {
  if (!node) return 'unknown'
  if (node.type === 'object' || node.type === 'array') return node.type
  if (node.enumValues !== undefined && node.enumValues.length > 0) return 'enum'
  if (node.type === 'string' || node.type === 'boolean') return node.type
  if (node.type === 'number' || node.type === 'integer') return 'number'
  return 'unknown'
}

export function widgetOutcome(name: string, kind: NodeKind, node?: NodeProjection): WidgetOutcome {
  if (name === 'hidden') return 'hidden'
  if (kind === 'object') return 'ignored'
  if (RENDERED_AS_DEFAULT[kind].includes(name)) return 'default'
  const stringTyped = kind === 'string' || kind === 'unknown' || (kind === 'enum' && node?.type === 'string')
  return name === 'textarea' && stringTyped ? 'textarea' : 'component'
}

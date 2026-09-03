import type { NodeId, StableItemId, JsonPointer } from '../types.js'

export interface UIDocument {
  version: 1
  rootId: NodeId
  nodes: Record<string, UINode>
}

export type UINode = FieldNode | ContainerNode | TextNode | ActionNode

export interface NodeBase {
  id: NodeId
  type: string
  parentId: NodeId | null
  dataPointer: JsonPointer | null
  order: number
  visible: boolean
  disabled: boolean
  annotations: NodeAnnotations
}

export interface NodeAnnotations {
  title?: string
  description?: string
  readOnly?: boolean
  writeOnly?: boolean
  deprecated?: boolean
  examples?: unknown[]
  default?: unknown
}

export interface FieldNode extends NodeBase {
  type: 'field'
  fieldType: FieldType
  format?: string
  constraints: FieldConstraints
  enumValues?: EnumOption[]
  widget?: string
  placeholder?: string
}

export type FieldType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'array'
  | 'object'

export interface FieldConstraints {
  required?: boolean
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  multipleOf?: number
  pattern?: string
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
}

export interface EnumOption {
  value: unknown
  title?: string
}

export interface ContainerNode extends NodeBase {
  type: 'container'
  containerType: 'object' | 'array' | 'group' | 'layout'
  children: NodeId[]
  arrayMeta?: ArrayMeta
}

export interface ArrayMeta {
  itemIds: StableItemId[]
  itemKey?: JsonPointer
  minItems?: number
  maxItems?: number
  canAdd: boolean
  canRemove: boolean
  canReorder: boolean
}

export interface TextNode extends NodeBase {
  type: 'text'
  content: string
  textRole: 'heading' | 'paragraph' | 'help' | 'error-summary'
}

export interface ActionNode extends NodeBase {
  type: 'action'
  actionType: string
  label: string
  actionArgs?: Record<string, unknown>
  buttonRole: 'submit' | 'reset' | 'button'
}

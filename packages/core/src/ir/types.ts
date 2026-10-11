import type { JsonPointer, NodeId, StableItemId } from '../types.js'
import type { IdentityKey } from '../identity/key.js'
import type { ProjectionBoundary, ProjectionBoundaryTarget } from '../schema/port.js'

export type UIDocumentVersion = 1 | 2

export interface UIDocument<Version extends UIDocumentVersion = 1> {
  version: Version
  rootId: NodeId
  nodes: Record<string, Version extends 1 ? UINode : DocumentNode>
}

export type UIDocumentV2 = UIDocument<2>
export type AnyUIDocument = UIDocument<1> | UIDocumentV2

export type UINode = FieldNode | ContainerNode | TextNode | ActionNode

export type DocumentNode =
  | DisplayContainerNode
  | DisplayTextNode
  | DisplayActionNode
  | ListNode
  | TableNode

export interface DisplayNodeBase {
  id: NodeId
  type: string
  parentId: NodeId | null
  annotations: NodeAnnotations
}

export interface DisplayContainerNode extends DisplayNodeBase {
  type: 'container'
  containerType: 'group' | 'layout'
  children: NodeId[]
}

export interface DisplayTextNode extends DisplayNodeBase {
  type: 'text'
  content: string
  textRole: 'heading' | 'paragraph' | 'help'
}

export interface DisplayActionNode extends DisplayNodeBase {
  type: 'action'
  actionType: string
  label: string
  actionArgs?: import('../types.js').JsonValue
  buttonRole: 'button'
}

export interface ListNode extends DisplayNodeBase {
  type: 'list'
  collectionId: string
  dataPointer: JsonPointer
  valuePointer: JsonPointer
  rowKeyPointer?: JsonPointer
}

export interface TableColumn {
  id: string
  label: string
  valuePointer: JsonPointer
}

export interface TableNode extends DisplayNodeBase {
  type: 'table'
  collectionId: string
  dataPointer: JsonPointer
  rowKeyPointer?: JsonPointer
  columns: TableColumn[]
}

export interface NodeBase {
  id: NodeId
  type: string
  parentId: NodeId | null
  dataPointer: JsonPointer | null
  order: number
  visible: boolean
  disabled: boolean
  /**
   * Effective read-only, inherited from any read-only ancestor. Editing a
   * descendant changes the ancestor's value, so the restriction has to
   * cascade. Distinct from `annotations.readOnly`, which is only what the
   * schema said about this node.
   */
  readOnly: boolean
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
  helpText?: string
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
  boundaries?: readonly ProjectionBoundary[]
  /** Individual withheld locations that may be explicitly revealed in the view. */
  boundaryTargets?: readonly ProjectionBoundaryTarget[]
}

export interface ArrayMeta {
  itemIds: StableItemId[]
  /** Addresses this logical array container across recompiles; stable for its lifetime and otherwise opaque. */
  identityKey: IdentityKey
  itemKey?: JsonPointer
  /** Title of the item template, so an add control can be named before any row exists. */
  itemTitle?: string
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

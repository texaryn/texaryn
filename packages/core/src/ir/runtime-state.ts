import type { NodeId, StableItemId, ValidationError } from '../types.js'

export interface RuntimeState {
  data: unknown
  nodes: Map<NodeId, NodeRuntimeState>
  identities: IdentityMap
  submission: SubmissionState
}

export interface NodeRuntimeState {
  value: unknown
  validation: ValidationState
  interaction: InteractionState
}

export interface ValidationState {
  status: 'idle' | 'pending' | 'valid' | 'invalid'
  errors: ValidationError[]
}

export interface InteractionState {
  dirty: boolean
  touched: boolean
  pristine: boolean
  modified: boolean
}

export interface SubmissionState {
  status: 'idle' | 'validating' | 'submitting' | 'submitted'
  error?: unknown
}

export interface IdentityMap {
  arrayIdentities: Map<NodeId, StableItemId[]>
  itemLookup: Map<StableItemId, { containerId: NodeId; index: number }>
  nextId: number
}

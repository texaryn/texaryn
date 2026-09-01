import type { NodeId } from '../types.js'
import type { RuntimeState } from '../ir/runtime-state.js'

export type Command =
  | { type: 'SetValue'; nodeId: NodeId; value: unknown }
  | { type: 'InsertItem'; containerId: NodeId; index: number; value?: unknown }
  | { type: 'RemoveItem'; containerId: NodeId; index: number }
  | { type: 'MoveItem'; containerId: NodeId; from: number; to: number }
  | { type: 'SetTouched'; nodeId: NodeId }
  | { type: 'Submit' }
  | { type: 'Reset'; data?: unknown }

export type Effect =
  | { type: 'validate'; nodeIds: NodeId[]; trigger: 'blur' | 'change' | 'submit' }
  | { type: 'recompile'; reason: 'data-changed' | 'schema-changed' }
  | { type: 'executeAction'; actionType: string; args: unknown }
  | { type: 'notify'; event: string; payload: unknown }

export interface CommandResult {
  nextState: RuntimeState
  effects: Effect[]
}

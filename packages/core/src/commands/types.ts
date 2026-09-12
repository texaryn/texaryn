import type { JsonPointer, NodeId } from '../types.js'
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
  /**
   * Locations the command created without a value being stated for them.
   *
   * Today this is the row an `InsertItem` with no `value` adds. The element in
   * the data is `null`, because an array cannot hold a hole and `undefined` is
   * not JSON, and that `null` is indistinguishable from one a caller passed
   * explicitly. An initialization policy needs the difference, so the handler
   * says which it was rather than leaving the value to be interpreted.
   *
   * Reported here rather than derived by the caller because only the handler
   * knows the command was applied: an out-of-range index is a no-op, and naming
   * a location it declined to create would invite filling a row that does not
   * exist.
   */
  provisional?: readonly JsonPointer[]
}

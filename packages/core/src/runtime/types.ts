import type { Store } from '../state/store.js'
import type { UIDocument } from '../ir/types.js'
import type { UIHints } from '../hints/types.js'
import type { Command } from '../commands/types.js'
import type { SubmissionState } from '../ir/runtime-state.js'
import type { NodeId, MaybePromise, ValidationError } from '../types.js'

export interface FormRuntimeOptions {
  initialData?: unknown
  hints?: UIHints
  onSubmit?: (data: unknown) => MaybePromise<void>
  validationDebounceMs?: number
}

export interface NodeState {
  readonly value: Store<unknown>
  readonly errors: Store<ValidationError[]>
  readonly dirty: Store<boolean>
  readonly touched: Store<boolean>
  readonly visible: Store<boolean>
  readonly disabled: Store<boolean>
  readonly validationStatus: Store<'idle' | 'pending' | 'valid' | 'invalid'>
}

export interface FormRuntime {
  readonly document: Store<UIDocument>
  readonly data: Store<unknown>
  readonly submission: Store<SubmissionState>
  dispatch(command: Command): void
  getNodeState(nodeId: NodeId): NodeState | undefined
  destroy(): void
}

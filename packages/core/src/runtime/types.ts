import type { Store } from '../state/store.js'
import type { UIDocument } from '../ir/types.js'
import type { UIHints } from '../hints/types.js'
import type { Command } from '../commands/types.js'
import type { SubmissionState } from '../ir/runtime-state.js'
import type { NodeId, MaybePromise, ValidationError, VisibleError } from '../types.js'
import type { DefaultConflict, DefaultRefusal } from '../initialization/index.js'

/** Which initialization policy consumes the schema's `default` annotations. */
export type InitializationPolicy = 'none' | 'schema-defaults'

/**
 * What one run of ADR-003's initialization pass did, without the data, which
 * the runtime publishes on `data` like any other.
 *
 * A discarded run reports only that it was discarded. Carrying the conflicts
 * and refusals of the run that produced them would say a run found them and
 * then say nothing was written, and the two readings are not the same claim.
 */
export type InitializationReport =
  | {
      readonly outcome: 'initialized'
      /** Locations left absent because their applicable declarations disagreed. */
      readonly conflicts: readonly DefaultConflict[]
      /** Locations left absent because filling would have meant guessing or destroying. */
      readonly refusals: readonly DefaultRefusal[]
      readonly passes: number
    }
  | { readonly outcome: 'budget-exhausted'; readonly passes: number }

export interface FormRuntimeOptions {
  initialData?: unknown
  hints?: UIHints
  onSubmit?: (data: unknown) => MaybePromise<void>
  validationDebounceMs?: number
  /**
   * ADR-003. `'none'`, the default, materialises nothing: given `{}` the
   * runtime's data stays `{}`. `'schema-defaults'` fills every reachable
   * location the schema declares a default for and the data leaves absent, at
   * construction and on `Reset`.
   */
  initialization?: InitializationPolicy
}

export interface NodeState {
  readonly value: Store<unknown>
  readonly errors: Store<ValidationError[]>
  readonly dirty: Store<boolean>
  readonly touched: Store<boolean>
  readonly visible: Store<boolean>
  readonly disabled: Store<boolean>
  readonly validationStatus: Store<'idle' | 'pending' | 'valid' | 'invalid'>
  readonly showErrors: Store<boolean>
}

export interface FormRuntime {
  readonly document: Store<UIDocument>
  readonly data: Store<unknown>
  readonly submission: Store<SubmissionState>
  readonly visibleErrors: Store<VisibleError[]>
  /**
   * The last initialization run, or `undefined` where no policy is configured.
   *
   * `dispatch` returns void and is typically called from an event handler, so a
   * `Reset` that exhausts the budget reports here rather than throwing into the
   * host's render. It is not the projection's diagnostics channel, which
   * describes a schema rather than one run over data.
   */
  readonly initialization: Store<InitializationReport | undefined>
  dispatch(command: Command): void
  getNodeState(nodeId: NodeId): NodeState | undefined
  destroy(): void
}

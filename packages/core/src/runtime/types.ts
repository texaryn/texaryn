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
   * runtime's data stays `{}`.
   *
   * `'schema-defaults'` fills every reachable location the schema declares a
   * default for and the data leaves absent. A location is filled when it
   * becomes reachable, so this runs at construction, on `Reset`, and after any
   * edit that can change what is reachable: activating a `oneOf` branch by
   * setting its discriminator fills that branch's own defaults. It never
   * overwrites, so `false`, `0`, `''` and `null` are values and are left alone.
   *
   * What the run wrote is the baseline at construction and on `Reset`, and is
   * not between them: a location seeded by an edit differs from
   * `state.initialData`, which is what `modified` reports.
   *
   * Omitting `initialData` is not the same as passing `{}`. The first states
   * nothing about the root, so a root-level `default` applies to it; the second
   * is a root the caller supplied, and nothing is written over it.
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
   * run that exhausts its budget reports here rather than throwing into the
   * host's render. What that discards depends on the moment: a `Reset`
   * establishes a baseline, so it is refused whole and nothing lands, while an
   * ordinary edit establishes none, so the edit lands and only the seeding is
   * dropped. `createFormRuntime` throws instead, because a caller can decline a
   * runtime it never received.
   *
   * A new report is published on every data-mutating dispatch under the policy,
   * including one where the pass wrote nothing, because each dispatch is a run
   * and what a run finds changes as the user types. Anything subscribed here
   * therefore updates per edit.
   *
   * It is not the projection's diagnostics channel, which describes a schema
   * rather than one run over data.
   */
  readonly initialization: Store<InitializationReport | undefined>
  dispatch(command: Command): void
  getNodeState(nodeId: NodeId): NodeState | undefined
  destroy(): void
}

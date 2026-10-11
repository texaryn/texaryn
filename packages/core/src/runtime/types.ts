import type { Store } from '../state/store.js'
import type { AnyUIDocument, UIDocument, UIDocumentV2 } from '../ir/types.js'
import type { UIHints } from '../hints/types.js'
import type { Command } from '../commands/types.js'
import type { SubmissionState } from '../ir/runtime-state.js'
import type { JsonScalar, JsonValue, NodeId, StableItemId, MaybePromise, ValidationError, VisibleError } from '../types.js'
import type { DefaultConflict, DefaultRefusal } from '../initialization/index.js'

/** Which initialization policy consumes the schema's `default` annotations. */
export type InitializationPolicy = 'none' | 'schema-defaults'

export interface UIDocumentRuntime<Document extends AnyUIDocument = AnyUIDocument, Data = unknown> {
  readonly document: Store<Document>
  readonly data: Store<Data>
  destroy(): void
}

export interface DocumentCollectionRow {
  readonly id: StableItemId
  readonly value: JsonScalar
  readonly cells: readonly JsonScalar[]
}

export interface DocumentActionContext {
  readonly nodeId: NodeId
  readonly document: UIDocumentV2
  readonly data: JsonValue
}

export type DocumentActionHandler = (
  args: JsonValue | undefined,
  context: DocumentActionContext,
) => MaybePromise<void>

export type DocumentActionArgumentValidator = (
  args: JsonValue | undefined,
) => JsonValue | undefined

export interface DocumentActionRegistration {
  handler: DocumentActionHandler
  validateArgs?: DocumentActionArgumentValidator
}

export type DocumentAction = DocumentActionHandler | DocumentActionRegistration

export interface DocumentRuntimeLimits {
  maxJsonDepth: number
  maxJsonValues: number
  maxArrayItems: number
  maxStringLength: number
  maxTotalStringLength: number
  maxDocumentNodes: number
  maxDocumentTreeDepth: number
  maxRowsPerCollection: number
  maxCollectionRows: number
  maxTableCells: number
}

export interface DocumentRuntimeOptions {
  initialData?: unknown
  actions?: Readonly<Record<string, DocumentAction>>
  limits?: Partial<DocumentRuntimeLimits>
}

export interface DocumentRuntime extends UIDocumentRuntime<UIDocumentV2, JsonValue> {
  replaceDocument(document: unknown): void
  setData(data: unknown): void
  replaceSnapshot(document: unknown, data: unknown): void
  getCollection(nodeId: NodeId): Store<readonly DocumentCollectionRow[]> | undefined
  hasActionHandler(actionType: string): boolean
  invokeAction(nodeId: NodeId): Promise<void>
}

export interface DocumentUpdateSessionOptions {
  maxMessagesPerSecond?: number
  maxPatchOperations?: number
  now?: () => number
  onNotificationError: (error: unknown) => void
}

export interface DocumentUpdateSession {
  apply(message: unknown): void
  getRevision(): number | undefined
  destroy(): void
}

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
   * `'retain'`, the default, validates and submits all current form data.
   * `'projected'` asks the adapter for a submission snapshot with locations
   * outside its currently applicable schema removed. The runtime validates
   * that same snapshot and leaves live form data untouched. Creation fails if
   * the adapter does not implement `projectSubmission`.
   */
  submission?: 'retain' | 'projected'
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

export interface FormRuntime extends UIDocumentRuntime<UIDocument, unknown> {
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

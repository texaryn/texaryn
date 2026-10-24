import type { SchemaEvaluationPort } from '../schema/port.js'
import { compile } from '../ir/compiler.js'
import type { UIDocument, UINode } from '../ir/types.js'
import type { RuntimeState, NodeRuntimeState, SubmissionState } from '../ir/runtime-state.js'
import { processCommand, resetTarget } from '../commands/handler.js'
import type { Command, Effect } from '../commands/types.js'
import { initializeDefaults, viewFromProjection } from '../initialization/index.js'
import type { InitializationResult } from '../initialization/index.js'
import { compareCodeUnits } from '../string-order.js'
import { createStore, createComputedStore } from '../state/store.js'
import type { WritableStore, Store } from '../state/store.js'
import { batch } from '../state/signal.js'
import { getAtPointer, parsePointer } from '../json-pointer.js'
import { identityKey } from '../identity/key.js'
import type { IdentityKey, IdentitySegment } from '../identity/key.js'
import type { JsonPointer, NodeId, ValidationError, ValidationResult, VisibleError } from '../types.js'
import type {
  FormRuntime,
  FormRuntimeOptions,
  FormMutation,
  FormCommandGuard,
  InitializationReport,
  InitializationPolicy,
  NodeState,
  RemoteSnapshotOptions,
} from './types.js'
import { createValidationScheduler } from './validation-scheduler.js'
import type { ValidationScheduler, ValidationTrigger } from './validation-scheduler.js'

export class RemoteSnapshotNotificationError extends Error {
  constructor(readonly notificationError: unknown) {
    super('The remote snapshot was applied, but store notification failed.')
    this.name = 'RemoteSnapshotNotificationError'
  }
}

function isJsonScalar(value: unknown): boolean {
  return value === null || typeof value === 'string' || typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
}

function isPlainRecord(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

interface JsonShapeValidationContext {
  visited: number
  totalStringLength: number
  active: WeakSet<object>
}

function accountSnapshotStringLength(context: JsonShapeValidationContext, length: number): void {
  context.totalStringLength += length
  if (context.totalStringLength > 1_000_000) {
    throw new Error('Remote form snapshot exceeds the supported string size.')
  }
}

function assertSnapshotTraversalBudget(
  context: JsonShapeValidationContext,
  depth: number,
): void {
  context.visited++
  if (context.visited > 100_000 || depth > 128) {
    throw new Error('Remote form snapshot exceeds the supported JSON size or depth.')
  }
}

function assertSnapshotProperties(
  value: object,
  expectedCount: number,
  kind: 'array' | 'object',
  pointer: string,
): void {
  if (Object.getOwnPropertySymbols(value).length > 0 ||
      Object.getOwnPropertyNames(value).length !== expectedCount) {
    throw new Error(`Remote form snapshot contains non-JSON ${kind} properties at "${pointer}".`)
  }
}

function snapshotPropertyValues(
  previous: object,
  value: object,
  key: string,
  pointer: string,
): [unknown, unknown] {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  const previousDescriptor = Object.getOwnPropertyDescriptor(previous, key)
  if (!descriptor?.enumerable || !('value' in descriptor) ||
      !previousDescriptor?.enumerable || !('value' in previousDescriptor)) {
    throw new Error(`Remote form snapshot contains an accessor at "${pointer}".`)
  }
  return [previousDescriptor.value, descriptor.value]
}

function visitSameJsonShape(
  previous: unknown,
  value: unknown,
  pointer: string,
  depth: number,
  context: JsonShapeValidationContext,
): void {
  assertSnapshotTraversalBudget(context, depth)
  if (isJsonScalar(previous)) {
    if (!isJsonScalar(value)) {
      throw new Error(`Remote form snapshot changes the scalar shape at "${pointer}".`)
    }
    if (typeof value === 'string') accountSnapshotStringLength(context, value.length)
    return
  }
  if (Array.isArray(previous)) {
    assertSameArrayShape(previous, value, pointer, depth, context)
    return
  }
  if (typeof previous === 'object' && previous !== null && isPlainRecord(previous)) {
    assertSameRecordShape(previous, value, pointer, depth, context)
    return
  }
  throw new Error(`The current form data is not supported for remote snapshots at "${pointer}".`)
}

function assertSameArrayShape(
  previous: unknown[],
  value: unknown,
  pointer: string,
  depth: number,
  context: JsonShapeValidationContext,
): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length !== previous.length) {
    throw new Error(`Remote form snapshot changes the array shape at "${pointer}".`)
  }
  assertSnapshotProperties(value, value.length + 1, 'array', pointer)
  assertSnapshotProperties(previous, previous.length + 1, 'array', pointer)
  if (context.active.has(value)) throw new Error('Remote form snapshot contains a cycle.')
  context.active.add(value)
  for (let index = 0; index < previous.length; index++) {
    if (!Object.hasOwn(value, index)) {
      throw new Error(`Remote form snapshot contains a sparse array at "${pointer}".`)
    }
    const childPointer = `${pointer}/${index}`
    const [previousValue, nextValue] = snapshotPropertyValues(previous, value, String(index), childPointer)
    visitSameJsonShape(previousValue, nextValue, childPointer, depth + 1, context)
  }
  context.active.delete(value)
}

function assertSameRecordShape(
  previous: Record<string, unknown>,
  value: unknown,
  pointer: string,
  depth: number,
  context: JsonShapeValidationContext,
): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !isPlainRecord(value)) {
    throw new Error(`Remote form snapshot changes the object shape at "${pointer}".`)
  }
  const oldKeys = Object.keys(previous).sort(compareCodeUnits)
  const newKeys = Object.keys(value).sort(compareCodeUnits)
  if (oldKeys.length !== newKeys.length || oldKeys.some((key, index) => key !== newKeys[index])) {
    throw new Error(`Remote form snapshot changes object properties at "${pointer}".`)
  }
  assertSnapshotProperties(value, newKeys.length, 'object', pointer)
  assertSnapshotProperties(previous, oldKeys.length, 'object', pointer)
  for (const key of oldKeys) {
    snapshotPropertyValues(previous, value, key, `${pointer}/${key}`)
    accountSnapshotStringLength(context, key.length)
  }
  if (context.active.has(value)) throw new Error('Remote form snapshot contains a cycle.')
  context.active.add(value)
  for (const key of oldKeys) {
    const childPointer = `${pointer}/${key}`
    const [previousValue, nextValue] = snapshotPropertyValues(previous, value, key, childPointer)
    visitSameJsonShape(previousValue, nextValue, childPointer, depth + 1, context)
  }
  context.active.delete(value)
}

function assertSameJsonShape(before: unknown, next: unknown): void {
  visitSameJsonShape(before, next, '', 0, {
    visited: 0,
    totalStringLength: 0,
    active: new WeakSet<object>(),
  })
}

function jsonValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (isJsonScalar(left) || isJsonScalar(right)) return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
      left.every((value, index) => jsonValuesEqual(value, right[index]))
  }
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) return false
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return leftKeys.length === rightKeys.length && leftKeys.every((key) =>
    Object.hasOwn(right, key) && jsonValuesEqual((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]),
  )
}

function cloneJsonValue(value: unknown): unknown {
  if (isJsonScalar(value)) return value
  if (Array.isArray(value)) return value.map((item) => cloneJsonValue(item))
  const result: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    Object.defineProperty(result, key, {
      value: cloneJsonValue(item),
      enumerable: true,
      configurable: true,
      writable: true,
    })
  }
  return result
}

function changedScalarPointers(before: unknown, next: unknown): string[] {
  const result: string[] = []

  function visit(left: unknown, right: unknown, pointer: string): void {
    if (isJsonScalar(left) && isJsonScalar(right)) {
      if (!Object.is(left, right)) result.push(pointer)
      return
    }
    if (Array.isArray(left) && Array.isArray(right)) {
      left.forEach((value, index) => visit(value, right[index], `${pointer}/${index}`))
      return
    }
    if (typeof left === 'object' && left !== null && typeof right === 'object' && right !== null) {
      for (const key of Object.keys(left)) {
        const escaped = key.replaceAll('~', '~0').replaceAll('/', '~1')
        visit((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key], `${pointer}/${escaped}`)
      }
    }
  }

  visit(before, next, '')
  return result
}

function isDataMutatingCommand(command: Command): boolean {
  switch (command.type) {
    case 'SetValue':
    case 'InsertItem':
    case 'RemoveItem':
    case 'MoveItem':
    case 'Reset':
      return true
    default:
      return false
  }
}

interface NodeStoreBundle {
  value: WritableStore<unknown>
  errors: WritableStore<ValidationError[]>
  dirty: WritableStore<boolean>
  touched: WritableStore<boolean>
  visible: WritableStore<boolean>
  disabled: WritableStore<boolean>
  validationStatus: WritableStore<'idle' | 'pending' | 'valid' | 'invalid'>
  showErrors: Store<boolean>
}

interface CarriedNode {
  node: UINode
  state: NodeRuntimeState | undefined
}

interface LogicalIndex {
  byKey: Map<IdentityKey, CarriedNode>
  keyOf: Map<NodeId, IdentityKey>
}

function propertyName(node: UINode): string | undefined {
  if (node.dataPointer == null) return undefined
  const segments = parsePointer(node.dataPointer)
  return segments.at(-1)
}

/**
 * Addresses every node by the path that survives an array mutation: property
 * names for object members and `StableItemId`s for array items, in the same
 * segment form array containers already use. Node ids cannot serve, because
 * they are assigned by traversal order and so change hands when items move.
 */
function indexByLogicalKey(
  doc: UIDocument,
  nodes?: Map<NodeId, NodeRuntimeState>,
): LogicalIndex {
  const byKey = new Map<IdentityKey, CarriedNode>()
  const keyOf = new Map<NodeId, IdentityKey>()

  function visit(nodeId: NodeId, segments: readonly IdentitySegment[]): void {
    const node = doc.nodes[nodeId as string]
    if (!node) return
    const key = identityKey(segments)
    // Two nodes sharing an address would hand one control another's history,
    // which is the failure this addressing exists to prevent.
    if (byKey.has(key)) throw new Error(`Duplicate logical node address: ${key}`)
    byKey.set(key, { node, state: nodes?.get(nodeId) })
    keyOf.set(nodeId, key)

    if (node.type !== 'container') return
    const itemIds = node.containerType === 'array' ? node.arrayMeta?.itemIds : undefined
    node.children.forEach((childId, index) => {
      if (doc.nodes[childId as string] === undefined) return
      if (itemIds) {
        const id = itemIds[index]
        if (id !== undefined) visit(childId, [...segments, { kind: 'item', id }])
        return
      }
      const name = propertyName(doc.nodes[childId as string])
      if (name !== undefined) visit(childId, [...segments, { kind: 'property', name }])
    })
  }

  visit(doc.rootId, [])
  return { byKey, keyOf }
}

/**
 * Carries one logical node's history onto the node that now represents it.
 * Interaction history belongs to the item and is always carried; it cannot be
 * recomputed from data. A validation result belongs to the item at a position,
 * because a schema may apply per index (`prefixItems`, and the draft-07 tuple
 * form of `items`), so when the item's pointer changes its result is dropped
 * rather than moved. Reporting nothing until validation runs again is honest;
 * moving a result to a position its schema may not produce is not.
 */
function carryNodeState(
  previous: CarriedNode,
  to: UINode,
  value: unknown,
): NodeRuntimeState {
  const carried: NodeRuntimeState = { ...previous.state!, value }
  if (previous.node.dataPointer === to.dataPointer) return carried
  return { ...carried, validation: { status: 'idle', errors: [] } }
}

function defaultNodeState(value: unknown): NodeRuntimeState {
  return {
    value,
    validation: { status: 'idle', errors: [] },
    interaction: { dirty: false, touched: false, pristine: true, modified: false },
  }
}

function createNodeStoreBundle(
  nodeState: NodeRuntimeState,
  uiNode: UINode,
  attempts: Store<number>,
): NodeStoreBundle {
  const touched = createStore(nodeState.interaction.touched)
  const validationStatus = createStore(nodeState.validation.status)
  return {
    value: createStore(nodeState.value),
    errors: createStore(nodeState.validation.errors),
    dirty: createStore(nodeState.interaction.dirty),
    touched,
    visible: createStore(uiNode.visible),
    disabled: createStore(uiNode.disabled),
    validationStatus,
    showErrors: createComputedStore(
      () =>
        (touched.getSnapshot() || attempts.getSnapshot() > 0) &&
        validationStatus.getSnapshot() === 'invalid',
    ),
  }
}

/** The root, as a JSON Pointer: the whole instance rather than a place in it. */
const ROOT_LOCATION = '' as JsonPointer

function reportOf(result: InitializationResult): InitializationReport {
  return result.outcome === 'initialized'
    ? {
        outcome: 'initialized',
        conflicts: result.conflicts,
        refusals: result.refusals,
        passes: result.passes,
      }
    : { outcome: 'budget-exhausted', passes: result.passes }
}

function initializeRuntimeData(
  port: SchemaEvaluationPort,
  options: FormRuntimeOptions,
): { initialData: unknown; construction: InitializationResult | undefined } {
  if (options.submission === 'projected' && typeof port.projectSubmission !== 'function') {
    throw new Error('Projected submission requires a SchemaEvaluationPort with projectSubmission().')
  }

  const initializationPolicy: InitializationPolicy = options.initialization ?? 'none'

  // Not `?? {}`, which treated `null` as "not supplied" while `false`, `0` and
  // `''` survived, so a caller could not say the instance is `null` and which
  // falsy values lived was arbitrary. `null` is a legal instance.
  const suppliedData = options.initialData === undefined ? {} : options.initialData

  /**
   * An omitted `initialData` is a root nobody stated a value for, which is a
   * different input from `initialData: {}` and has to stay one: a root-level
   * `default` applies to the first and not to the second.
   *
   * The substitution above stays, because `undefined` is not JSON and the
   * hyperjump adapter refuses it at the root. So the absence travels beside the
   * data rather than in it, as the provisional location an `InsertItem` with no
   * value already uses: the port receives `{}` at every moment while the pass
   * reads the root as absent, and if nothing is declared there the `{}` is what
   * the caller gets.
   */
  const unstatedRoot = options.initialData === undefined ? [ROOT_LOCATION] : undefined

  /**
   * ADR-003 fills a location when it becomes reachable, so the pass runs again
   * whenever an edit can have changed what is reachable. Construction is only
   * the first such moment; a branch the user activates by clicking a
   * discriminator is another, which is the case the contract measured against
   * the reference and matched.
   */
  const initialize =
    initializationPolicy === 'schema-defaults'
      ? (data: unknown, provisional?: readonly JsonPointer[]): InitializationResult =>
          initializeDefaults(
            data,
            (current) => viewFromProjection(port.project(current)),
            provisional === undefined ? {} : { provisional },
          )
      : undefined

  const construction = initialize?.(suppliedData, unstatedRoot)
  if (construction?.outcome === 'budget-exhausted') {
    // This surface returns a value, so it throws: the caller is in a position
    // to catch a runtime it never received. `Reset` is not, and reports.
    throw new Error(
      `Initialization did not converge in ${construction.passes} passes, so nothing was written.`,
    )
  }

  // Rule 6: what the pass materialised is the baseline, so a seeded location is
  // not modified against it and `handleSetValue` needs no new code.
  const initialData = construction === undefined ? suppliedData : construction.data
  return { initialData, construction }
}

export function createFormRuntime(
  port: SchemaEvaluationPort,
  options: FormRuntimeOptions = {},
): FormRuntime {
  const { initialData, construction } = initializeRuntimeData(port, options)
  const projection = port.project(initialData)
  const initialCompile = compile(projection, initialData, options.hints)

  let currentDoc: UIDocument = initialCompile.document
  const documentStore = createStore<UIDocument>(initialCompile.document)
  const dataStore = createStore<unknown>(initialData)
  const submissionStore = createStore<SubmissionState>({ status: 'idle', attempts: 0 })
  const visibleErrorsStore = createStore<VisibleError[]>([])
  const initializationStore = createStore<InitializationReport | undefined>(
    construction === undefined ? undefined : reportOf(construction),
  )
  const attemptsStore = createStore(0)
  const nodeStores = new Map<NodeId, NodeStoreBundle>()
  const mutationListeners = new Set<{
    listener: (mutation: FormMutation) => void
    onError: (error: unknown) => void
  }>()
  const commandGuards = new Set<{
    guard: FormCommandGuard
    onRejected?: (reason: string) => void
  }>()
  let arrayStructureLocks = 0

  function publishedDocument(document: UIDocument): UIDocument {
    if (arrayStructureLocks === 0) return document
    let nodes: UIDocument['nodes'] | undefined
    for (const [id, node] of Object.entries(document.nodes)) {
      if (node.type !== 'container' || node.containerType !== 'array' || node.arrayMeta === undefined) continue
      nodes ??= { ...document.nodes }
      nodes[id] = {
        ...node,
        arrayMeta: { ...node.arrayMeta, canAdd: false, canRemove: false, canReorder: false },
      }
    }
    return nodes === undefined ? document : { ...document, nodes }
  }

  function notifyMutation(mutation: FormMutation): void {
    for (const entry of mutationListeners) {
      try {
        entry.listener(mutation)
      } catch (error) {
        try {
          entry.onError(error)
        } catch {
          continue
        }
      }
    }
  }

  const nodes = new Map<NodeId, NodeRuntimeState>()
  for (const key of Object.keys(currentDoc.nodes)) {
    const nodeId = key as NodeId
    const uiNode = currentDoc.nodes[key]
    const value = uiNode.dataPointer != null ? getAtPointer(initialData, uiNode.dataPointer) : undefined
    const nodeRuntimeState = defaultNodeState(value)
    nodes.set(nodeId, nodeRuntimeState)
    nodeStores.set(nodeId, createNodeStoreBundle(nodeRuntimeState, uiNode, attemptsStore))
  }

  let state: RuntimeState = {
    data: initialData,
    initialData,
    nodes,
    identities: initialCompile.identityMap,
    expandedBoundaryTokens: new Set(),
    boundaryGeneration: 0,
    submission: { status: 'idle', attempts: 0 },
  }

  let destroyed = false
  let submissionGeneration = 0
  let currentAttempt: { generation: number; data: unknown } | null = null

  function publishSubmission(): void {
    submissionStore.set(state.submission)
    attemptsStore.set(state.submission.attempts)
  }

  function syncNodeStores(): void {
    for (const [nodeId, nodeRuntimeState] of state.nodes) {
      const bundle = nodeStores.get(nodeId)
      if (!bundle) continue
      bundle.value.set(nodeRuntimeState.value)
      bundle.dirty.set(nodeRuntimeState.interaction.dirty)
      bundle.touched.set(nodeRuntimeState.interaction.touched)
      bundle.errors.set(nodeRuntimeState.validation.errors)
      bundle.validationStatus.set(nodeRuntimeState.validation.status)
    }
    refreshVisibleErrors()
  }

  function refreshVisibleErrors(): void {
    const result: VisibleError[] = []
    for (const [nodeId, bundle] of nodeStores) {
      if (!bundle.showErrors.getSnapshot()) continue
      const errors = bundle.errors.getSnapshot()
      if (errors.length === 0) continue
      const uiNode = currentDoc.nodes[nodeId as string]
      result.push({
        nodeId,
        fieldTitle: uiNode?.annotations?.title,
        pointer: uiNode?.dataPointer ?? null,
        errors,
      })
    }
    visibleErrorsStore.set(result)
  }

  function handleRecompile(): void {
    // Addressed from the outgoing document on purpose: the command handler has
    // already advanced `state.identities`, so that map no longer describes the
    // ordering the current positional node ids were built from.
    const previous = indexByLogicalKey(currentDoc, state.nodes)

    const nextProjection = port.project(state.data, {
      expandedBoundaryTokens: state.expandedBoundaryTokens,
      boundaryGeneration: state.boundaryGeneration,
    })
    const result = compile(nextProjection, state.data, options.hints, state.identities)
    const nextDoc = result.document
    const next = indexByLogicalKey(nextDoc)

    const nextNodes = new Map<NodeId, NodeRuntimeState>()
    for (const key of Object.keys(nextDoc.nodes)) {
      const nodeId = key as NodeId
      const uiNode = nextDoc.nodes[key]
      const value = uiNode.dataPointer != null ? getAtPointer(state.data, uiNode.dataPointer) : undefined
      const logicalKey = next.keyOf.get(nodeId)
      const carried = logicalKey === undefined ? undefined : previous.byKey.get(logicalKey)
      // History belongs to the logical item, so it is adopted by address. A
      // node whose address is new to this document starts fresh, which is what
      // an inserted item and a re-minted array both need.
      nextNodes.set(
        nodeId,
        carried?.state ? carryNodeState(carried, uiNode, value) : defaultNodeState(value),
      )
    }

    // State is adopted in full before anything is published. Recompiles run
    // inside `batch`, so subscribers all read the finished state whatever
    // order the stores were set in.
    state = { ...state, nodes: nextNodes, identities: result.identityMap }
    currentDoc = nextDoc

    // The document is published before the per-node stores on purpose. Batched
    // notifications fire in the order stores were first set, and a renderer
    // has to re-point its widgets at their new nodes before it is told those
    // nodes' values, or it writes one row's value into another row's control
    // and moves the caret of whatever is focused.
    documentStore.set(publishedDocument(nextDoc))

    for (const [nodeId, nodeRuntimeState] of nextNodes) {
      const uiNode = nextDoc.nodes[nodeId as string]
      const bundle = nodeStores.get(nodeId)
      if (!bundle) {
        nodeStores.set(nodeId, createNodeStoreBundle(nodeRuntimeState, uiNode, attemptsStore))
        continue
      }
      bundle.value.set(nodeRuntimeState.value)
      bundle.dirty.set(nodeRuntimeState.interaction.dirty)
      bundle.touched.set(nodeRuntimeState.interaction.touched)
      bundle.errors.set(nodeRuntimeState.validation.errors)
      bundle.validationStatus.set(nodeRuntimeState.validation.status)
      bundle.visible.set(uiNode.visible)
      bundle.disabled.set(uiNode.disabled)
    }

    // Drop stores for node ids the recompiled document no longer contains
    // (the trailing item after an array shrinks), so the map does not grow
    // without bound across the form's lifetime.
    for (const nodeId of nodeStores.keys()) {
      if (!nextNodes.has(nodeId)) nodeStores.delete(nodeId)
    }

    refreshVisibleErrors()
  }

  function applyNodeValidationResult(result: ValidationResult): void {
    const errorsByPointer = new Map<string, ValidationError[]>()
    for (const error of result.errors) {
      const list = errorsByPointer.get(error.instancePointer) ?? []
      list.push(error)
      errorsByPointer.set(error.instancePointer, list)
    }

    const nextNodes = new Map(state.nodes)
    for (const [nodeId, nodeRuntimeState] of nextNodes) {
      const uiNode = currentDoc.nodes[nodeId as string]
      if (uiNode?.dataPointer == null) continue
      const nodeErrors = errorsByPointer.get(uiNode.dataPointer) ?? []
      const status = nodeErrors.length > 0 ? 'invalid' : 'valid'
      nextNodes.set(nodeId, { ...nodeRuntimeState, validation: { status, errors: nodeErrors } })
      const bundle = nodeStores.get(nodeId)
      if (bundle) {
        bundle.errors.set(nodeErrors)
        bundle.validationStatus.set(status)
      }
    }

    state = { ...state, nodes: nextNodes }
    refreshVisibleErrors()
  }

  function runOnSubmit(attempt: { generation: number; data: unknown }): Promise<void> {
    return Promise.resolve(options.onSubmit?.(attempt.data))
      .then(() => {
        if (destroyed || attempt.generation !== submissionGeneration) return
        batch(() => {
          currentAttempt = null
          state = { ...state, submission: { status: 'submitted', attempts: state.submission.attempts } }
          publishSubmission()
        })
      })
      .catch((error: unknown) => {
        if (destroyed || attempt.generation !== submissionGeneration) return
        batch(() => {
          currentAttempt = null
          state = { ...state, submission: { status: 'idle', error, attempts: state.submission.attempts } }
          publishSubmission()
        })
      })
  }

  function onValidationPending(): void {
    if (destroyed) return
    batch(() => {
      const nextNodes = new Map(state.nodes)
      for (const [nodeId, nodeRuntimeState] of nextNodes) {
        nextNodes.set(nodeId, {
          ...nodeRuntimeState,
          validation: { ...nodeRuntimeState.validation, status: 'pending' },
        })
        const bundle = nodeStores.get(nodeId)
        if (bundle) bundle.validationStatus.set('pending')
      }
      state = { ...state, nodes: nextNodes }
      refreshVisibleErrors()
    })
  }

  function onValidationResult(result: ValidationResult, trigger: ValidationTrigger): void {
    if (destroyed) return
    batch(() => {
      applyNodeValidationResult(result)

      if (trigger === 'submit' && state.submission.status === 'validating') {
        const attempt = currentAttempt
        if (result.valid && attempt) {
          const submission: SubmissionState = { status: 'submitting', attempts: state.submission.attempts }
          state = { ...state, submission }
          publishSubmission()
          void runOnSubmit(attempt)
        } else {
          currentAttempt = null
          const submission: SubmissionState = { status: 'idle', attempts: state.submission.attempts }
          state = { ...state, submission }
          publishSubmission()
        }
      }
    })
  }

  function resetPendingNodes(): void {
    const nextNodes = new Map(state.nodes)
    let changed = false
    for (const [nodeId, nodeRuntimeState] of nextNodes) {
      if (nodeRuntimeState.validation.status !== 'pending') continue
      nextNodes.set(nodeId, {
        ...nodeRuntimeState,
        validation: { ...nodeRuntimeState.validation, status: 'idle' },
      })
      const bundle = nodeStores.get(nodeId)
      if (bundle) bundle.validationStatus.set('idle')
      changed = true
    }
    if (changed) {
      state = { ...state, nodes: nextNodes }
      refreshVisibleErrors()
    }
  }

  function onValidationError(error: unknown, trigger: ValidationTrigger): void {
    if (destroyed) return
    batch(() => {
      resetPendingNodes()

      if (trigger === 'submit') {
        currentAttempt = null
        state = { ...state, submission: { status: 'idle', error, attempts: state.submission.attempts } }
        publishSubmission()
      }
    })
  }

  const scheduler: ValidationScheduler = createValidationScheduler(
    {
      runValidation: (trigger) =>
        port.validate(
          trigger === 'submit' && currentAttempt
            ? currentAttempt.data
            : state.data,
        ),
      onPending: onValidationPending,
      onResult: onValidationResult,
      onError: onValidationError,
    },
    options.validationDebounceMs,
  )

  function hintMatchesTrigger(nodeIds: NodeId[], trigger: ValidationTrigger): boolean {
    return nodeIds.some((nodeId) => {
      const uiNode = currentDoc.nodes[nodeId as string]
      const pointer = uiNode?.dataPointer
      if (pointer == null) return false
      return options.hints?.[pointer]?.validationTrigger === trigger
    })
  }

  function handleValidateEffect(effect: Extract<Effect, { type: 'validate' }>): void {
    if (state.submission.status === 'submitting' && effect.trigger !== 'submit') {
      return
    }
    if (
      effect.trigger !== 'submit' &&
      effect.trigger !== 'manual' &&
      !hintMatchesTrigger(effect.nodeIds, effect.trigger)
    ) {
      return
    }
    scheduler.schedule(effect.trigger)
  }

  function handleEffect(effect: Effect): void {
    switch (effect.type) {
      case 'recompile':
        handleRecompile()
        break
      case 'validate':
        handleValidateEffect(effect)
        break
      default:
        break
    }
  }

  function rejectGuardedCommand(incoming: Command): boolean {
    for (const entry of commandGuards) {
      let rejection: string | undefined
      try {
        rejection = entry.guard(incoming, { document: currentDoc, data: state.data })
      } catch (error) {
        rejection = error instanceof Error ? error.message : String(error)
      }
      if (rejection === undefined) continue
      try {
        entry.onRejected?.(rejection)
      } catch {
        // A rejected command remains rejected even if its reporter fails.
      }
      return true
    }
    return false
  }

  function prepareCommand(incoming: Command): {
    command: Command
    report?: InitializationReport
  } | undefined {
    // `Reset` establishes a new baseline, so the policy that produced the first
    // one produces this one, with or without `cmd.data`. It runs before the
    // handler and before any teardown, so an exhausted budget leaves the
    // runtime exactly as it was. An ordinary edit is seeded after the handler.
    if (initialize === undefined || incoming.type !== 'Reset') {
      return { command: incoming }
    }

    const result = initialize(resetTarget(state, incoming))
    if (result.outcome === 'budget-exhausted') {
      initializationStore.set(reportOf(result))
      return undefined
    }
    return {
      command: { type: 'Reset', data: result.data },
      report: reportOf(result),
    }
  }

  function invalidateForCommand(command: Command, mutatesData: boolean): void {
    if (!mutatesData) return
    scheduler.invalidate()
    if (command.type !== 'Reset') return
    scheduler.cancelScheduled()
    submissionGeneration++
    currentAttempt = null
  }

  function seedAfterCommand(
    command: Command,
    mutatesData: boolean,
    provisional: readonly JsonPointer[] | undefined,
  ): { report?: InitializationReport; seeded: readonly string[] } {
    if (initialize === undefined || !mutatesData || command.type === 'Reset') {
      return { seeded: [] }
    }

    // A row created without a stated value reads as absent to the pass while
    // the data holds the `null` standing in for it. This keeps arrays dense
    // and keeps non-JSON values away from the schema port.
    const result = initialize(state.data, provisional)
    const report = reportOf(result)
    if (result.outcome !== 'initialized') return { report, seeded: [] }
    state = { ...state, data: result.data }
    return { report, seeded: result.written }
  }

  function prepareSubmission(effects: readonly Effect[]): boolean {
    const acceptedSubmit = effects.some(
      (effect) => effect.type === 'validate' && effect.trigger === 'submit',
    )
    if (!acceptedSubmit) return false

    scheduler.cancelScheduled()
    const generation = ++submissionGeneration
    try {
      const data = options.submission === 'projected'
        ? port.projectSubmission!(state.data)
        : state.data
      currentAttempt = { generation, data }
      return false
    } catch (error) {
      currentAttempt = null
      state = {
        ...state,
        submission: { status: 'idle', error, attempts: state.submission.attempts },
      }
      return true
    }
  }

  function cancelSubmissionAfterMutation(mutatesData: boolean): void {
    if (!mutatesData || state.submission.status !== 'validating') return
    submissionGeneration++
    currentAttempt = null
    state = {
      ...state,
      submission: {
        status: 'idle',
        attempts: state.submission.attempts,
        cancelled: true,
      },
    }
  }

  function handleDispatchEffect(effect: Effect, submissionProjectionFailed: boolean): void {
    if (
      submissionProjectionFailed &&
      effect.type === 'validate' &&
      effect.trigger === 'submit'
    ) {
      return
    }
    handleEffect(effect)
  }

  function publishCommand(
    mutatesData: boolean,
    report: InitializationReport | undefined,
    effects: readonly Effect[],
    seeded: readonly string[],
    submissionProjectionFailed: boolean,
  ): { failed: boolean; error?: unknown } {
    try {
      batch(() => {
        if (mutatesData) resetPendingNodes()
        dataStore.set(state.data)
        if (report !== undefined) initializationStore.set(report)
        publishSubmission()
        syncNodeStores()
        for (const effect of effects) {
          handleDispatchEffect(effect, submissionProjectionFailed)
        }
        if (seeded.length > 0) markSeeded(seeded)
      })
      return { failed: false }
    } catch (error) {
      return { failed: true, error }
    }
  }

  function notifyChangedData(
    beforeData: unknown,
    beforeDocument: UIDocument,
    command: Command,
    origin: unknown,
  ): void {
    if (state.data === beforeData) return
    notifyMutation({
      command,
      origin,
      beforeData,
      data: state.data,
      beforeDocument,
      document: currentDoc,
    })
  }

  function dispatch(incoming: Command, dispatchOptions: { origin?: unknown } = {}): void {
    if (destroyed || rejectGuardedCommand(incoming)) return

    const prepared = prepareCommand(incoming)
    if (prepared === undefined) return
    const { command } = prepared
    let report = prepared.report
    const mutatesData = isDataMutatingCommand(command)

    // Process before invalidating. A refused write leaves validation running
    // against the unchanged data.
    const beforeData = state.data
    const beforeDocument = currentDoc
    const { nextState, effects, provisional } = processCommand(state, command, currentDoc)

    invalidateForCommand(command, mutatesData)
    state = nextState

    const seeding = seedAfterCommand(command, mutatesData, provisional)
    if (seeding.report !== undefined) report = seeding.report

    const submissionProjectionFailed = prepareSubmission(effects)
    cancelSubmissionAfterMutation(mutatesData)

    const publication = publishCommand(
      mutatesData,
      report,
      effects,
      seeding.seeded,
      submissionProjectionFailed,
    )

    notifyChangedData(beforeData, beforeDocument, command, dispatchOptions.origin)
    if (publication.failed) throw publication.error
  }

  /**
   * `modified` for a location the pass filled against a baseline that was
   * already fixed. The value does differ from `state.initialData`, and the user
   * did not type it, so `dirty`, `touched` and `pristine` are left alone.
   *
   * Neither of the two paths a node can take works this out on its own:
   * `defaultNodeState` builds a new node with every flag fresh, and
   * `carryNodeState` carries the answer from before the seeding.
   */
  function markSeeded(pointers: readonly string[]): void {
    const wanted = new Set(pointers)
    const nextNodes = new Map(state.nodes)
    for (const [nodeId, nodeRuntimeState] of nextNodes) {
      const pointer = currentDoc.nodes[nodeId as string]?.dataPointer
      if (pointer == null || !wanted.has(pointer)) continue
      nextNodes.set(nodeId, {
        ...nodeRuntimeState,
        interaction: { ...nodeRuntimeState.interaction, modified: true },
      })
    }
    state = { ...state, nodes: nextNodes }
  }

  function subscribeMutations(
    listener: (mutation: FormMutation) => void,
    onError: (error: unknown) => void,
  ): () => void {
    if (destroyed) return () => undefined
    const entry = { listener, onError }
    mutationListeners.add(entry)
    return () => mutationListeners.delete(entry)
  }

  function registerCommandGuard(
    guard: FormCommandGuard,
    onRejected?: (reason: string) => void,
  ): () => void {
    if (destroyed) return () => undefined
    const entry = { guard, onRejected }
    commandGuards.add(entry)
    return () => commandGuards.delete(entry)
  }

  function lockArrayStructure(): () => void {
    if (destroyed) return () => undefined
    arrayStructureLocks++
    try {
      documentStore.set(publishedDocument(currentDoc))
    } catch (error) {
      arrayStructureLocks = Math.max(0, arrayStructureLocks - 1)
      throw error
    }
    let released = false
    return () => {
      if (released) return
      released = true
      if (destroyed) return
      arrayStructureLocks = Math.max(0, arrayStructureLocks - 1)
      documentStore.set(publishedDocument(currentDoc))
    }
  }

  function applyRemoteSnapshot(data: unknown, snapshotOptions: RemoteSnapshotOptions = {}): void {
    if (destroyed) return
    if (initializationPolicy !== 'none') {
      throw new Error('Remote snapshots require initialization: none.')
    }
    assertSameJsonShape(state.data, data)
    const snapshot = cloneJsonValue(data)
    if (jsonValuesEqual(state.data, snapshot)) return

    const beforeData = state.data
    const beforeDocument = currentDoc
    const changedPointers = changedScalarPointers(beforeData, snapshot)
    const previous = indexByLogicalKey(currentDoc, state.nodes)
    const projection = port.project(snapshot, {
      expandedBoundaryTokens: state.expandedBoundaryTokens,
      boundaryGeneration: state.boundaryGeneration,
    })
    const result = compile(projection, snapshot, options.hints, state.identities)
    const nextDoc = result.document
    const nextIndex = indexByLogicalKey(nextDoc)
    const nextNodes = new Map<NodeId, NodeRuntimeState>()

    for (const key of Object.keys(nextDoc.nodes)) {
      const nodeId = key as NodeId
      const uiNode = nextDoc.nodes[key]
      const value = uiNode.dataPointer != null ? getAtPointer(snapshot, uiNode.dataPointer) : undefined
      const logicalKey = nextIndex.keyOf.get(nodeId)
      const carried = logicalKey === undefined ? undefined : previous.byKey.get(logicalKey)
      const initialValue = uiNode.dataPointer == null
        ? undefined
        : getAtPointer(state.initialData, uiNode.dataPointer)
      const interaction = carried?.state
        ? { ...carried.state.interaction, modified: !jsonValuesEqual(value, initialValue) }
        : { dirty: false, touched: false, pristine: true, modified: !jsonValuesEqual(value, initialValue) }
      nextNodes.set(nodeId, {
        value,
        validation: { status: 'idle', errors: [] },
        interaction,
      })
    }

    const previousSubmission = state.submission
    const submission: SubmissionState = {
      status: 'idle',
      attempts: previousSubmission.attempts,
      ...(previousSubmission.status === 'idle' ? {} : { cancelled: true as const }),
    }

    scheduler.invalidate()
    scheduler.cancelScheduled()
    submissionGeneration++
    currentAttempt = null
    state = {
      ...state,
      data: snapshot,
      nodes: nextNodes,
      identities: result.identityMap,
      submission,
    }
    currentDoc = nextDoc

    let publicationFailed = false
    let publicationError: unknown
    try {
      batch(() => {
        dataStore.set(snapshot)
        documentStore.set(publishedDocument(nextDoc))
        submissionStore.set(submission)
        attemptsStore.set(submission.attempts)
        for (const [nodeId, nodeRuntimeState] of nextNodes) {
          const uiNode = nextDoc.nodes[nodeId as string]
          const bundle = nodeStores.get(nodeId)
          if (!bundle) {
            nodeStores.set(nodeId, createNodeStoreBundle(nodeRuntimeState, uiNode, attemptsStore))
            continue
          }
          bundle.value.set(nodeRuntimeState.value)
          bundle.dirty.set(nodeRuntimeState.interaction.dirty)
          bundle.touched.set(nodeRuntimeState.interaction.touched)
          bundle.errors.set(nodeRuntimeState.validation.errors)
          bundle.validationStatus.set(nodeRuntimeState.validation.status)
          bundle.visible.set(uiNode.visible)
          bundle.disabled.set(uiNode.disabled)
        }
        for (const nodeId of nodeStores.keys()) {
          if (!nextNodes.has(nodeId)) nodeStores.delete(nodeId)
        }
        refreshVisibleErrors()
      })
    } catch (error) {
      publicationFailed = true
      publicationError = error
    }

    notifyMutation({
      origin: snapshotOptions.origin,
      beforeData,
      data: snapshot,
      beforeDocument,
      document: nextDoc,
      changedPointers,
    })
    scheduler.schedule('change')
    if (publicationFailed) throw new RemoteSnapshotNotificationError(publicationError)
  }

  function getNodeState(nodeId: NodeId): NodeState | undefined {
    return nodeStores.get(nodeId)
  }

  function destroy(): void {
    destroyed = true
    submissionGeneration++
    currentAttempt = null
    scheduler.destroy()
    mutationListeners.clear()
    commandGuards.clear()
    nodeStores.clear()
  }

  return {
    document: documentStore,
    data: dataStore,
    submission: submissionStore,
    visibleErrors: visibleErrorsStore,
    initialization: initializationStore,
    initializationPolicy,
    dispatch,
    subscribeMutations,
    registerCommandGuard,
    applyRemoteSnapshot,
    lockArrayStructure,
    getNodeState,
    destroy,
  }
}

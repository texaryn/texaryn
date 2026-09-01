import type { SchemaEvaluationPort } from '../schema/port.js'
import { compile } from '../ir/compiler.js'
import type { UIDocument, UINode } from '../ir/types.js'
import type { RuntimeState, NodeRuntimeState, SubmissionState } from '../ir/runtime-state.js'
import { processCommand } from '../commands/handler.js'
import type { Command, Effect } from '../commands/types.js'
import { createStore } from '../state/store.js'
import type { WritableStore } from '../state/store.js'
import { batch } from '../state/signal.js'
import { getAtPointer } from '../json-pointer.js'
import type { NodeId, ValidationError, ValidationResult } from '../types.js'
import type { FormRuntime, FormRuntimeOptions, NodeState } from './types.js'
import { createValidationScheduler } from './validation-scheduler.js'
import type { ValidationScheduler, ValidationTrigger } from './validation-scheduler.js'

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
}

function defaultNodeState(value: unknown): NodeRuntimeState {
  return {
    value,
    validation: { status: 'idle', errors: [] },
    interaction: { dirty: false, touched: false, pristine: true, modified: false },
  }
}

function createNodeStoreBundle(nodeState: NodeRuntimeState, uiNode: UINode): NodeStoreBundle {
  return {
    value: createStore(nodeState.value),
    errors: createStore(nodeState.validation.errors),
    dirty: createStore(nodeState.interaction.dirty),
    touched: createStore(nodeState.interaction.touched),
    visible: createStore(uiNode.visible),
    disabled: createStore(uiNode.disabled),
    validationStatus: createStore(nodeState.validation.status),
  }
}

export function createFormRuntime(
  port: SchemaEvaluationPort,
  options: FormRuntimeOptions = {},
): FormRuntime {
  const initialData = options.initialData ?? {}
  const projection = port.project(initialData)
  const initialCompile = compile(projection, initialData, options.hints)

  let currentDoc: UIDocument = initialCompile.document
  const documentStore = createStore<UIDocument>(initialCompile.document)
  const dataStore = createStore<unknown>(initialData)
  const submissionStore = createStore<SubmissionState>({ status: 'idle' })
  const nodeStores = new Map<NodeId, NodeStoreBundle>()

  const nodes = new Map<NodeId, NodeRuntimeState>()
  for (const key of Object.keys(currentDoc.nodes)) {
    const nodeId = key as NodeId
    const uiNode = currentDoc.nodes[key]
    const value = uiNode.dataPointer != null ? getAtPointer(initialData, uiNode.dataPointer) : undefined
    const nodeRuntimeState = defaultNodeState(value)
    nodes.set(nodeId, nodeRuntimeState)
    nodeStores.set(nodeId, createNodeStoreBundle(nodeRuntimeState, uiNode))
  }

  let state: RuntimeState = {
    data: initialData,
    initialData,
    nodes,
    identities: initialCompile.identityMap,
    submission: { status: 'idle' },
  }

  let destroyed = false

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
  }

  function handleRecompile(): void {
    const nextProjection = port.project(state.data)
    const result = compile(nextProjection, state.data, options.hints)
    currentDoc = result.document
    state = { ...state, identities: result.identityMap }
    documentStore.set(currentDoc)

    const seenNodeIds = new Set<NodeId>()

    for (const key of Object.keys(currentDoc.nodes)) {
      const nodeId = key as NodeId
      seenNodeIds.add(nodeId)
      const uiNode = currentDoc.nodes[key]
      const value = uiNode.dataPointer != null ? getAtPointer(state.data, uiNode.dataPointer) : undefined
      const bundle = nodeStores.get(nodeId)

      if (bundle) {
        // A node id can end up representing a different array position after
        // an insert/remove/move shifts indices, since ids are assigned by
        // traversal order rather than tracked per logical item. Re-derive
        // `value` from the freshly recompiled data so the bundle reflects
        // whatever this id now points at, while keeping the id's own
        // interaction/validation history (dirty, touched, errors, status).
        const previous = state.nodes.get(nodeId)
        const nodeRuntimeState: NodeRuntimeState = previous
          ? { ...previous, value }
          : defaultNodeState(value)
        state.nodes.set(nodeId, nodeRuntimeState)

        bundle.value.set(nodeRuntimeState.value)
        bundle.dirty.set(nodeRuntimeState.interaction.dirty)
        bundle.touched.set(nodeRuntimeState.interaction.touched)
        bundle.errors.set(nodeRuntimeState.validation.errors)
        bundle.validationStatus.set(nodeRuntimeState.validation.status)
        bundle.visible.set(uiNode.visible)
        bundle.disabled.set(uiNode.disabled)
        continue
      }

      const nodeRuntimeState = defaultNodeState(value)
      state.nodes.set(nodeId, nodeRuntimeState)
      nodeStores.set(nodeId, createNodeStoreBundle(nodeRuntimeState, uiNode))
    }

    // Drop entries for node ids that no longer appear in the recompiled
    // document (e.g. the trailing item after an array shrinks), so both
    // maps don't grow without bound across the form's lifetime.
    for (const nodeId of state.nodes.keys()) {
      if (!seenNodeIds.has(nodeId)) {
        state.nodes.delete(nodeId)
        nodeStores.delete(nodeId)
      }
    }
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
  }

  function runOnSubmit(): Promise<void> {
    return Promise.resolve(options.onSubmit?.(state.data))
      .then(() => {
        if (destroyed) return
        batch(() => {
          state = { ...state, submission: { status: 'submitted' } }
          submissionStore.set(state.submission)
        })
      })
      .catch((error: unknown) => {
        if (destroyed) return
        batch(() => {
          state = { ...state, submission: { status: 'idle', error } }
          submissionStore.set(state.submission)
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
    })
  }

  function onValidationResult(result: ValidationResult, trigger: ValidationTrigger): void {
    if (destroyed) return
    batch(() => {
      applyNodeValidationResult(result)

      if (trigger === 'submit' && state.submission.status === 'validating') {
        const submission: SubmissionState = result.valid
          ? { status: 'submitting' }
          : { status: 'idle' }
        state = { ...state, submission }
        submissionStore.set(submission)

        if (result.valid) void runOnSubmit()
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
    }
  }

  function onValidationError(error: unknown, trigger: ValidationTrigger): void {
    if (destroyed) return
    batch(() => {
      resetPendingNodes()

      if (trigger === 'submit') {
        state = { ...state, submission: { status: 'idle', error } }
        submissionStore.set(state.submission)
      }
    })
  }

  const scheduler: ValidationScheduler = createValidationScheduler(
    {
      runValidation: () => port.validate(state.data),
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
    if (effect.trigger !== 'submit' && !hintMatchesTrigger(effect.nodeIds, effect.trigger)) {
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

  function dispatch(command: Command): void {
    if (destroyed) return
    const mutatesData = isDataMutatingCommand(command)
    if (mutatesData) {
      scheduler.invalidate()
    }

    const { nextState, effects } = processCommand(state, command, currentDoc)
    state = nextState

    if (mutatesData && state.submission.status === 'validating') {
      state = { ...state, submission: { status: 'idle' } }
    }

    if (mutatesData) {
      // Reset nodes stuck at pending from an invalidated in-flight validation
      batch(() => {
        resetPendingNodes()
      })
    }

    batch(() => {
      dataStore.set(state.data)
      submissionStore.set(state.submission)
      syncNodeStores()
      for (const effect of effects) {
        handleEffect(effect)
      }
    })
  }

  function getNodeState(nodeId: NodeId): NodeState | undefined {
    return nodeStores.get(nodeId)
  }

  function destroy(): void {
    destroyed = true
    scheduler.destroy()
    nodeStores.clear()
  }

  return {
    document: documentStore,
    data: dataStore,
    submission: submissionStore,
    dispatch,
    getNodeState,
    destroy,
  }
}

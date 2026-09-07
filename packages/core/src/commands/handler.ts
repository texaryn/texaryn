import type { UIDocument, UINode } from '../ir/types.js'
import type { RuntimeState, NodeRuntimeState } from '../ir/runtime-state.js'
import type { Command, CommandResult } from './types.js'
import type { NodeId } from '../types.js'
import type { IdentityKey } from '../identity/key.js'
import { getAtPointer, setAtPointer } from '../json-pointer.js'
import { insertItem, removeItem, moveItem } from '../identity/map.js'
import { reconcile } from '../identity/reconcile.js'

/** Only an array container owns identity; anything else cannot be inserted into, removed from or reordered. */
function identityKeyOf(node: UINode | undefined): IdentityKey | undefined {
  return node?.type === 'container' ? node.arrayMeta?.identityKey : undefined
}

/**
 * Read-only is enforced here rather than only in the widgets, because ARIA is
 * a description and not a gate: a custom registry that dispatched SetValue
 * would otherwise walk straight through it. Reset is deliberately exempt, as
 * wholesale replacement by the owning authority rather than an edit.
 */
function isReadOnly(document: UIDocument, nodeId: NodeId): boolean {
  return document.nodes[nodeId as string]?.readOnly === true
}

export function processCommand(
  state: RuntimeState,
  command: Command,
  document: UIDocument,
): CommandResult {
  switch (command.type) {
    case 'SetValue':
      if (isReadOnly(document, command.nodeId)) return { nextState: state, effects: [] }
      return handleSetValue(state, command, document)
    case 'InsertItem':
      if (isReadOnly(document, command.containerId)) return { nextState: state, effects: [] }
      return handleInsertItem(state, command, document)
    case 'RemoveItem':
      if (isReadOnly(document, command.containerId)) return { nextState: state, effects: [] }
      return handleRemoveItem(state, command, document)
    case 'MoveItem':
      if (isReadOnly(document, command.containerId)) return { nextState: state, effects: [] }
      return handleMoveItem(state, command, document)
    case 'SetTouched':
      return handleSetTouched(state, command)
    case 'Submit':
      return handleSubmit(state)
    case 'Reset':
      return handleReset(state, command, document)
  }
}

function handleSetValue(
  state: RuntimeState,
  cmd: { type: 'SetValue'; nodeId: NodeId; value: unknown },
  document: UIDocument,
): CommandResult {
  const node = document.nodes[cmd.nodeId as string]
  if (node?.dataPointer == null) return { nextState: state, effects: [] }

  const newData = setAtPointer(state.data, node.dataPointer, cmd.value)
  const initialValue = getAtPointer(state.initialData, node.dataPointer)
  const modified = !Object.is(cmd.value, initialValue)
  const nodes = new Map(state.nodes)
  const prev = nodes.get(cmd.nodeId) ?? defaultNodeState(cmd.value)
  nodes.set(cmd.nodeId, {
    ...prev,
    value: cmd.value,
    interaction: { ...prev.interaction, dirty: true, pristine: false, modified },
  })

  return {
    nextState: { ...state, data: newData, nodes },
    effects: [
      { type: 'recompile', reason: 'data-changed' },
      { type: 'validate', nodeIds: [cmd.nodeId], trigger: 'change' },
    ],
  }
}

function handleInsertItem(
  state: RuntimeState,
  cmd: { type: 'InsertItem'; containerId: NodeId; index: number; value?: unknown },
  document: UIDocument,
): CommandResult {
  const container = document.nodes[cmd.containerId as string]
  const key = identityKeyOf(container)
  if (container?.dataPointer == null || key === undefined) return { nextState: state, effects: [] }

  const arr = (getAtPointer(state.data, container.dataPointer) as unknown[]) ?? []
  if (cmd.index < 0 || cmd.index > arr.length) return { nextState: state, effects: [] }
  const newArr = [...arr.slice(0, cmd.index), cmd.value ?? null, ...arr.slice(cmd.index)]
  const newData = setAtPointer(state.data, container.dataPointer, newArr)
  const { map: newIdentities } = insertItem(state.identities, key, cmd.index)

  return {
    nextState: { ...state, data: newData, identities: newIdentities },
    effects: [
      { type: 'recompile', reason: 'data-changed' },
      { type: 'validate', nodeIds: [cmd.containerId], trigger: 'change' },
    ],
  }
}

function handleRemoveItem(
  state: RuntimeState,
  cmd: { type: 'RemoveItem'; containerId: NodeId; index: number },
  document: UIDocument,
): CommandResult {
  const container = document.nodes[cmd.containerId as string]
  const key = identityKeyOf(container)
  if (container?.dataPointer == null || key === undefined) return { nextState: state, effects: [] }

  const arr = (getAtPointer(state.data, container.dataPointer) as unknown[]) ?? []
  if (cmd.index < 0 || cmd.index >= arr.length) return { nextState: state, effects: [] }
  const newArr = [...arr.slice(0, cmd.index), ...arr.slice(cmd.index + 1)]
  const newData = setAtPointer(state.data, container.dataPointer, newArr)
  const { map: newIdentities } = removeItem(state.identities, key, cmd.index)

  return {
    nextState: { ...state, data: newData, identities: newIdentities },
    effects: [
      { type: 'recompile', reason: 'data-changed' },
      { type: 'validate', nodeIds: [cmd.containerId], trigger: 'change' },
    ],
  }
}

function handleMoveItem(
  state: RuntimeState,
  cmd: { type: 'MoveItem'; containerId: NodeId; from: number; to: number },
  document: UIDocument,
): CommandResult {
  const container = document.nodes[cmd.containerId as string]
  const key = identityKeyOf(container)
  if (container?.dataPointer == null || key === undefined) return { nextState: state, effects: [] }

  const source = (getAtPointer(state.data, container.dataPointer) as unknown[]) ?? []
  if (cmd.from < 0 || cmd.from >= source.length || cmd.to < 0 || cmd.to >= source.length) {
    return { nextState: state, effects: [] }
  }
  const arr = [...source]
  const [item] = arr.splice(cmd.from, 1)
  arr.splice(cmd.to, 0, item)
  const newData = setAtPointer(state.data, container.dataPointer, arr)
  const newIdentities = moveItem(state.identities, key, cmd.from, cmd.to)

  return {
    nextState: { ...state, data: newData, identities: newIdentities },
    effects: [
      { type: 'recompile', reason: 'data-changed' },
      { type: 'validate', nodeIds: [cmd.containerId], trigger: 'change' },
    ],
  }
}

function handleSetTouched(
  state: RuntimeState,
  cmd: { type: 'SetTouched'; nodeId: NodeId },
): CommandResult {
  const nodes = new Map(state.nodes)
  const prev = nodes.get(cmd.nodeId)
  if (prev) {
    nodes.set(cmd.nodeId, {
      ...prev,
      interaction: { ...prev.interaction, touched: true },
    })
  }
  return {
    nextState: { ...state, nodes },
    effects: [{ type: 'validate', nodeIds: [cmd.nodeId], trigger: 'blur' }],
  }
}

function handleSubmit(state: RuntimeState): CommandResult {
  if (state.submission.status === 'validating' || state.submission.status === 'submitting') {
    return { nextState: state, effects: [] }
  }
  const allNodeIds = [...state.nodes.keys()]
  return {
    nextState: {
      ...state,
      submission: { status: 'validating', attempts: state.submission.attempts + 1 },
    },
    effects: [{ type: 'validate', nodeIds: allNodeIds, trigger: 'submit' }],
  }
}

/** Reset replaces state wholesale: identity is re-matched, so nested arrays under a reordered row may be minted afresh. */
function handleReset(
  state: RuntimeState,
  cmd: { type: 'Reset'; data?: unknown },
  document: UIDocument,
): CommandResult {
  const newData = cmd.data ?? state.initialData
  const nodes = new Map<NodeId, NodeRuntimeState>()
  for (const [id] of state.nodes) {
    const node = document.nodes[id as string]
    const value = node?.dataPointer == null
      ? undefined
      : getAtPointer(newData, node.dataPointer)
    nodes.set(id, defaultNodeState(value))
  }

  let identities = state.identities
  for (const node of Object.values(document.nodes)) {
    if (node.type !== 'container' || node.containerType !== 'array') continue
    if (node.dataPointer == null || node.arrayMeta === undefined) continue
    const oldItems = getAtPointer(state.data, node.dataPointer)
    const newItems = getAtPointer(newData, node.dataPointer)
    if (Array.isArray(oldItems) && Array.isArray(newItems)) {
      identities = reconcile(
        identities,
        node.arrayMeta.identityKey,
        oldItems,
        newItems,
        node.arrayMeta.itemKey ? { itemKey: node.arrayMeta.itemKey } : undefined,
      )
    }
  }

  return {
    nextState: {
      ...state,
      data: newData,
      initialData: newData,
      nodes,
      identities,
      submission: { status: 'idle', attempts: 0 },
    },
    effects: [{ type: 'recompile', reason: 'data-changed' }],
  }
}

function defaultNodeState(value: unknown): NodeRuntimeState {
  return {
    value,
    validation: { status: 'idle', errors: [] },
    interaction: { dirty: false, touched: false, pristine: true, modified: false },
  }
}

import type { UIDocument } from '../ir/types.js'
import type { RuntimeState, NodeRuntimeState } from '../ir/runtime-state.js'
import type { Command, CommandResult } from './types.js'
import type { NodeId } from '../types.js'
import { getAtPointer, setAtPointer } from '../json-pointer.js'
import { insertItem, removeItem, moveItem } from '../identity/map.js'
import { reconcile } from '../identity/reconcile.js'

export function processCommand(
  state: RuntimeState,
  command: Command,
  document: UIDocument,
): CommandResult {
  switch (command.type) {
    case 'SetValue':
      return handleSetValue(state, command, document)
    case 'InsertItem':
      return handleInsertItem(state, command, document)
    case 'RemoveItem':
      return handleRemoveItem(state, command, document)
    case 'MoveItem':
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
    effects: [{ type: 'recompile', reason: 'data-changed' }],
  }
}

function handleInsertItem(
  state: RuntimeState,
  cmd: { type: 'InsertItem'; containerId: NodeId; index: number; value?: unknown },
  document: UIDocument,
): CommandResult {
  const container = document.nodes[cmd.containerId as string]
  if (container?.dataPointer == null) return { nextState: state, effects: [] }

  const arr = (getAtPointer(state.data, container.dataPointer) as unknown[]) ?? []
  const newArr = [...arr.slice(0, cmd.index), cmd.value ?? null, ...arr.slice(cmd.index)]
  const newData = setAtPointer(state.data, container.dataPointer, newArr)
  const { map: newIdentities } = insertItem(state.identities, cmd.containerId, cmd.index)

  return {
    nextState: { ...state, data: newData, identities: newIdentities },
    effects: [{ type: 'recompile', reason: 'data-changed' }],
  }
}

function handleRemoveItem(
  state: RuntimeState,
  cmd: { type: 'RemoveItem'; containerId: NodeId; index: number },
  document: UIDocument,
): CommandResult {
  const container = document.nodes[cmd.containerId as string]
  if (container?.dataPointer == null) return { nextState: state, effects: [] }

  const arr = (getAtPointer(state.data, container.dataPointer) as unknown[]) ?? []
  if (cmd.index < 0 || cmd.index >= arr.length) return { nextState: state, effects: [] }
  const newArr = [...arr.slice(0, cmd.index), ...arr.slice(cmd.index + 1)]
  const newData = setAtPointer(state.data, container.dataPointer, newArr)
  const { map: newIdentities } = removeItem(state.identities, cmd.containerId, cmd.index)

  return {
    nextState: { ...state, data: newData, identities: newIdentities },
    effects: [{ type: 'recompile', reason: 'data-changed' }],
  }
}

function handleMoveItem(
  state: RuntimeState,
  cmd: { type: 'MoveItem'; containerId: NodeId; from: number; to: number },
  document: UIDocument,
): CommandResult {
  const container = document.nodes[cmd.containerId as string]
  if (container?.dataPointer == null) return { nextState: state, effects: [] }

  const source = (getAtPointer(state.data, container.dataPointer) as unknown[]) ?? []
  if (cmd.from < 0 || cmd.from >= source.length || cmd.to < 0 || cmd.to >= source.length) {
    return { nextState: state, effects: [] }
  }
  const arr = [...source]
  const [item] = arr.splice(cmd.from, 1)
  arr.splice(cmd.to, 0, item)
  const newData = setAtPointer(state.data, container.dataPointer, arr)
  const newIdentities = moveItem(state.identities, cmd.containerId, cmd.from, cmd.to)

  return {
    nextState: { ...state, data: newData, identities: newIdentities },
    effects: [{ type: 'recompile', reason: 'data-changed' }],
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
  return { nextState: { ...state, nodes }, effects: [] }
}

function handleSubmit(state: RuntimeState): CommandResult {
  const allNodeIds = [...state.nodes.keys()]
  return {
    nextState: {
      ...state,
      submission: { status: 'validating' },
    },
    effects: [{ type: 'validate', nodeIds: allNodeIds }],
  }
}

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
    if (node.dataPointer == null) continue
    const oldItems = getAtPointer(state.data, node.dataPointer)
    const newItems = getAtPointer(newData, node.dataPointer)
    if (Array.isArray(oldItems) && Array.isArray(newItems)) {
      identities = reconcile(
        identities,
        node.id,
        oldItems,
        newItems,
        node.arrayMeta?.itemKey ? { itemKey: node.arrayMeta.itemKey } : undefined,
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
      submission: { status: 'idle' },
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

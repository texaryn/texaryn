import type { UIDocument } from '../ir/types.js'
import type { RuntimeState, NodeRuntimeState } from '../ir/runtime-state.js'
import type { Command, Effect, CommandResult } from './types.js'
import type { NodeId } from '../types.js'
import { getAtPointer, setAtPointer } from '../json-pointer.js'
import { insertItem, removeItem, moveItem } from '../identity/map.js'

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
      return handleSubmit(state, document)
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
  if (!node?.dataPointer) return { nextState: state, effects: [] }

  const newData = setAtPointer(state.data, node.dataPointer, cmd.value)
  const nodes = new Map(state.nodes)
  const prev = nodes.get(cmd.nodeId) ?? defaultNodeState(cmd.value)
  nodes.set(cmd.nodeId, {
    ...prev,
    value: cmd.value,
    interaction: { ...prev.interaction, dirty: true, pristine: false },
  })

  return {
    nextState: { ...state, data: newData, nodes },
    effects: [{ type: 'validate', nodeIds: [cmd.nodeId] }],
  }
}

function handleInsertItem(
  state: RuntimeState,
  cmd: { type: 'InsertItem'; containerId: NodeId; index: number; value?: unknown },
  document: UIDocument,
): CommandResult {
  const container = document.nodes[cmd.containerId as string]
  if (!container?.dataPointer) return { nextState: state, effects: [] }

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
  if (!container?.dataPointer) return { nextState: state, effects: [] }

  const arr = (getAtPointer(state.data, container.dataPointer) as unknown[]) ?? []
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
  if (!container?.dataPointer) return { nextState: state, effects: [] }

  const arr = [...((getAtPointer(state.data, container.dataPointer) as unknown[]) ?? [])]
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

function handleSubmit(
  state: RuntimeState,
  document: UIDocument,
): CommandResult {
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
  _document: UIDocument,
): CommandResult {
  const newData = cmd.data ?? state.data
  const nodes = new Map<NodeId, NodeRuntimeState>()
  for (const [id, prev] of state.nodes) {
    nodes.set(id, {
      ...prev,
      value: undefined,
      validation: { status: 'idle', errors: [] },
      interaction: { dirty: false, touched: false, pristine: true, modified: false },
    })
  }
  return {
    nextState: { ...state, data: newData, nodes, submission: { status: 'idle' } },
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

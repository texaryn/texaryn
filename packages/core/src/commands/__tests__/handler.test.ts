import { describe, it, expect } from 'vitest'
import type {
  NodeId,
  JsonPointer,
  UIDocument,
  RuntimeState,
  FieldNode,
  ContainerNode,
  NodeRuntimeState,
  IdentityMap,
} from '../../index.js'
import { processCommand } from '../handler.js'
import type { Command } from '../types.js'

const nid = (s: string) => s as NodeId
const jp = (s: string) => s as JsonPointer

function makeFieldNode(
  id: string,
  pointer: string,
  parentId: string | null = null,
): FieldNode {
  return {
    id: nid(id),
    type: 'field',
    parentId: parentId ? nid(parentId) : null,
    dataPointer: jp(pointer),
    order: 0,
    visible: true,
    disabled: false,
    annotations: {},
    fieldType: 'string',
    constraints: {},
  }
}

function makeContainerNode(
  id: string,
  pointer: string,
  children: string[],
  containerType: 'object' | 'array' = 'object',
): ContainerNode {
  return {
    id: nid(id),
    type: 'container',
    parentId: null,
    dataPointer: jp(pointer),
    order: 0,
    visible: true,
    disabled: false,
    annotations: {},
    containerType,
    children: children.map(nid),
  }
}

function makeNodeState(value: unknown): NodeRuntimeState {
  return {
    value,
    validation: { status: 'idle', errors: [] },
    interaction: { dirty: false, touched: false, pristine: true, modified: false },
  }
}

function emptyIdentities(): IdentityMap {
  return {
    arrayIdentities: new Map(),
    itemLookup: new Map(),
    nextId: 0,
  }
}

const simpleDoc: UIDocument = {
  version: 1,
  rootId: nid('root'),
  nodes: {
    [nid('root') as string]: makeContainerNode('root', '', ['name', 'age']),
    [nid('name') as string]: makeFieldNode('name', '/name', 'root'),
    [nid('age') as string]: makeFieldNode('age', '/age', 'root'),
  },
}

function simpleState(): RuntimeState {
  return {
    data: { name: 'Alice', age: 30 },
    nodes: new Map([
      [nid('name'), makeNodeState('Alice')],
      [nid('age'), makeNodeState(30)],
    ]),
    identities: emptyIdentities(),
    submission: { status: 'idle' },
  }
}

describe('processCommand', () => {
  describe('SetValue', () => {
    it('updates data at the node dataPointer', () => {
      const state = simpleState()
      const cmd: Command = { type: 'SetValue', nodeId: nid('name'), value: 'Bob' }
      const { nextState } = processCommand(state, cmd, simpleDoc)
      expect((nextState.data as Record<string, unknown>).name).toBe('Bob')
    })

    it('marks node as dirty', () => {
      const state = simpleState()
      const cmd: Command = { type: 'SetValue', nodeId: nid('name'), value: 'Bob' }
      const { nextState } = processCommand(state, cmd, simpleDoc)
      expect(nextState.nodes.get(nid('name'))!.interaction.dirty).toBe(true)
    })

    it('emits validate effect', () => {
      const state = simpleState()
      const cmd: Command = { type: 'SetValue', nodeId: nid('name'), value: 'Bob' }
      const { effects } = processCommand(state, cmd, simpleDoc)
      expect(effects).toContainEqual({
        type: 'validate',
        nodeIds: [nid('name')],
      })
    })

    it('does not mutate original state', () => {
      const state = simpleState()
      const original = (state.data as Record<string, unknown>).name
      processCommand(state, { type: 'SetValue', nodeId: nid('name'), value: 'Bob' }, simpleDoc)
      expect((state.data as Record<string, unknown>).name).toBe(original)
    })
  })

  describe('SetTouched', () => {
    it('marks node as touched', () => {
      const state = simpleState()
      const { nextState } = processCommand(
        state,
        { type: 'SetTouched', nodeId: nid('name') },
        simpleDoc,
      )
      expect(nextState.nodes.get(nid('name'))!.interaction.touched).toBe(true)
    })
  })

  describe('Submit', () => {
    it('transitions to validating', () => {
      const state = simpleState()
      const { nextState, effects } = processCommand(
        state,
        { type: 'Submit' },
        simpleDoc,
      )
      expect(nextState.submission.status).toBe('validating')
      expect(effects.some((e) => e.type === 'validate')).toBe(true)
    })
  })

  describe('Reset', () => {
    it('replaces data and clears interaction state', () => {
      const state = simpleState()
      state.nodes.get(nid('name'))!.interaction.dirty = true
      const { nextState } = processCommand(
        state,
        { type: 'Reset', data: { name: 'New', age: 0 } },
        simpleDoc,
      )
      expect((nextState.data as Record<string, unknown>).name).toBe('New')
      expect(nextState.nodes.get(nid('name'))!.interaction.dirty).toBe(false)
    })

    it('emits recompile effect', () => {
      const state = simpleState()
      const { effects } = processCommand(
        state,
        { type: 'Reset' },
        simpleDoc,
      )
      expect(effects).toContainEqual({ type: 'recompile', reason: 'data-changed' })
    })
  })

  describe('SetValue reversibility', () => {
    it('setting back to original value restores data', () => {
      const state = simpleState()
      const r1 = processCommand(
        state,
        { type: 'SetValue', nodeId: nid('name'), value: 'Bob' },
        simpleDoc,
      )
      const r2 = processCommand(
        r1.nextState,
        { type: 'SetValue', nodeId: nid('name'), value: 'Alice' },
        simpleDoc,
      )
      expect((r2.nextState.data as Record<string, unknown>).name).toBe('Alice')
    })
  })
})

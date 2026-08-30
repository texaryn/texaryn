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
import { processCommand, registerArray, insertItem } from '../../index.js'
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

const initialData = { name: 'Alice', age: 30 }

function simpleState(): RuntimeState {
  return {
    data: { ...initialData },
    initialData: { ...initialData },
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

    it('marks node as dirty and modified', () => {
      const state = simpleState()
      const cmd: Command = { type: 'SetValue', nodeId: nid('name'), value: 'Bob' }
      const { nextState } = processCommand(state, cmd, simpleDoc)
      const interaction = nextState.nodes.get(nid('name'))!.interaction
      expect(interaction.dirty).toBe(true)
      expect(interaction.modified).toBe(true)
    })

    it('emits recompile effect (not validate)', () => {
      const state = simpleState()
      const cmd: Command = { type: 'SetValue', nodeId: nid('name'), value: 'Bob' }
      const { effects } = processCommand(state, cmd, simpleDoc)
      expect(effects).toContainEqual({
        type: 'recompile',
        reason: 'data-changed',
      })
      expect(effects.some((e) => e.type === 'validate')).toBe(false)
    })

    it('does not mutate original state', () => {
      const state = simpleState()
      const original = (state.data as Record<string, unknown>).name
      processCommand(state, { type: 'SetValue', nodeId: nid('name'), value: 'Bob' }, simpleDoc)
      expect((state.data as Record<string, unknown>).name).toBe(original)
    })

    it('handles root data pointer (empty string)', () => {
      const rootFieldDoc: UIDocument = {
        version: 1,
        rootId: nid('root'),
        nodes: {
          [nid('root') as string]: makeFieldNode('root', ''),
        },
      }
      const state: RuntimeState = {
        data: 'old',
        initialData: 'old',
        nodes: new Map([[nid('root'), makeNodeState('old')]]),
        identities: emptyIdentities(),
        submission: { status: 'idle' },
      }
      const { nextState } = processCommand(
        state,
        { type: 'SetValue', nodeId: nid('root'), value: 'new' },
        rootFieldDoc,
      )
      expect(nextState.data).toBe('new')
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
    it('resets to initial data when no replacement provided', () => {
      const state = simpleState()
      const r1 = processCommand(
        state,
        { type: 'SetValue', nodeId: nid('name'), value: 'Bob' },
        simpleDoc,
      )
      const { nextState } = processCommand(
        r1.nextState,
        { type: 'Reset' },
        simpleDoc,
      )
      expect((nextState.data as Record<string, unknown>).name).toBe('Alice')
      expect(nextState.nodes.get(nid('name'))!.interaction.dirty).toBe(false)
    })

    it('populates node values from reset data', () => {
      const state = simpleState()
      const { nextState } = processCommand(
        state,
        { type: 'Reset' },
        simpleDoc,
      )
      expect(nextState.nodes.get(nid('name'))!.value).toBe('Alice')
      expect(nextState.nodes.get(nid('age'))!.value).toBe(30)
    })

    it('resets to explicit data when provided', () => {
      const state = simpleState()
      const { nextState } = processCommand(
        state,
        { type: 'Reset', data: { name: 'New', age: 0 } },
        simpleDoc,
      )
      expect((nextState.data as Record<string, unknown>).name).toBe('New')
      expect(nextState.initialData).toEqual({ name: 'New', age: 0 })
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
    it('setting back to original value clears modified', () => {
      const state = simpleState()
      const r1 = processCommand(
        state,
        { type: 'SetValue', nodeId: nid('name'), value: 'Bob' },
        simpleDoc,
      )
      expect(r1.nextState.nodes.get(nid('name'))!.interaction.modified).toBe(true)
      const r2 = processCommand(
        r1.nextState,
        { type: 'SetValue', nodeId: nid('name'), value: 'Alice' },
        simpleDoc,
      )
      expect((r2.nextState.data as Record<string, unknown>).name).toBe('Alice')
      expect(r2.nextState.nodes.get(nid('name'))!.interaction.modified).toBe(false)
    })
  })

  const arrayDoc: UIDocument = {
    version: 1,
    rootId: nid('list'),
    nodes: {
      [nid('list') as string]: {
        ...makeContainerNode('list', '/items', [], 'array'),
        containerType: 'array' as const,
      },
    },
  }

  function arrayState(items: unknown[]): RuntimeState {
    let identities = registerArray(emptyIdentities(), nid('list'))
    for (let i = 0; i < items.length; i++) {
      identities = insertItem(identities, nid('list'), i).map
    }
    return {
      data: { items },
      initialData: { items: [...items] },
      nodes: new Map(),
      identities,
      submission: { status: 'idle' },
    }
  }

  describe('InsertItem', () => {
    it('inserts a value at the given index', () => {
      const state = arrayState(['a', 'b'])
      const { nextState } = processCommand(
        state,
        { type: 'InsertItem', containerId: nid('list'), index: 1, value: 'x' },
        arrayDoc,
      )
      expect((nextState.data as { items: unknown[] }).items).toEqual(['a', 'x', 'b'])
    })

    it('assigns a stable identity to the new item', () => {
      const state = arrayState(['a'])
      const { nextState } = processCommand(
        state,
        { type: 'InsertItem', containerId: nid('list'), index: 1, value: 'b' },
        arrayDoc,
      )
      const ids = nextState.identities.arrayIdentities.get(nid('list'))!
      expect(ids).toHaveLength(2)
    })

    it('emits recompile effect', () => {
      const state = arrayState([])
      const { effects } = processCommand(
        state,
        { type: 'InsertItem', containerId: nid('list'), index: 0, value: 'a' },
        arrayDoc,
      )
      expect(effects).toContainEqual({ type: 'recompile', reason: 'data-changed' })
    })
  })

  describe('RemoveItem', () => {
    it('removes the item at the given index', () => {
      const state = arrayState(['a', 'b', 'c'])
      const { nextState } = processCommand(
        state,
        { type: 'RemoveItem', containerId: nid('list'), index: 1 },
        arrayDoc,
      )
      expect((nextState.data as { items: unknown[] }).items).toEqual(['a', 'c'])
    })

    it('rejects out-of-range index (negative)', () => {
      const state = arrayState(['a'])
      const { nextState } = processCommand(
        state,
        { type: 'RemoveItem', containerId: nid('list'), index: -1 },
        arrayDoc,
      )
      expect(nextState).toBe(state)
    })

    it('rejects out-of-range index (beyond length)', () => {
      const state = arrayState(['a'])
      const { nextState } = processCommand(
        state,
        { type: 'RemoveItem', containerId: nid('list'), index: 5 },
        arrayDoc,
      )
      expect(nextState).toBe(state)
    })
  })

  describe('MoveItem', () => {
    it('moves an item from one index to another', () => {
      const state = arrayState(['a', 'b', 'c'])
      const { nextState } = processCommand(
        state,
        { type: 'MoveItem', containerId: nid('list'), from: 0, to: 2 },
        arrayDoc,
      )
      expect((nextState.data as { items: unknown[] }).items).toEqual(['b', 'c', 'a'])
    })

    it('rejects out-of-range from index', () => {
      const state = arrayState(['a', 'b'])
      const { nextState } = processCommand(
        state,
        { type: 'MoveItem', containerId: nid('list'), from: 5, to: 0 },
        arrayDoc,
      )
      expect(nextState).toBe(state)
    })

    it('rejects out-of-range to index', () => {
      const state = arrayState(['a', 'b'])
      const { nextState } = processCommand(
        state,
        { type: 'MoveItem', containerId: nid('list'), from: 0, to: 5 },
        arrayDoc,
      )
      expect(nextState).toBe(state)
    })
  })

  describe('Reset identity reconciliation', () => {
    it('reconciles array identities when data changes', () => {
      const state = arrayState(['a', 'b'])
      const r1 = processCommand(
        state,
        { type: 'InsertItem', containerId: nid('list'), index: 0, value: 'x' },
        arrayDoc,
      )
      const idsBeforeReset = r1.nextState.identities.arrayIdentities.get(nid('list'))!
      expect(idsBeforeReset).toHaveLength(3)

      const { nextState } = processCommand(
        r1.nextState,
        { type: 'Reset', data: { items: ['b', 'a'] } },
        arrayDoc,
      )
      const idsAfterReset = nextState.identities.arrayIdentities.get(nid('list'))!
      expect(idsAfterReset).toHaveLength(2)
    })

    it('preserves matched identities across reset', () => {
      const state = arrayState(['a', 'b'])
      const r1 = processCommand(
        state,
        { type: 'InsertItem', containerId: nid('list'), index: 2, value: 'c' },
        arrayDoc,
      )
      const idsBefore = r1.nextState.identities.arrayIdentities.get(nid('list'))!
      const idForA = idsBefore[0]
      const idForB = idsBefore[1]

      const { nextState } = processCommand(
        r1.nextState,
        { type: 'Reset', data: { items: ['b', 'a'] } },
        arrayDoc,
      )
      const idsAfter = nextState.identities.arrayIdentities.get(nid('list'))!
      expect(idsAfter[0]).toBe(idForB)
      expect(idsAfter[1]).toBe(idForA)
    })
  })
})

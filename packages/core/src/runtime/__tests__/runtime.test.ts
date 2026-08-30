import { describe, it, expect, vi } from 'vitest'
import { createFormRuntime } from '../runtime.js'
import type { SchemaEvaluationPort, SchemaProjection, NodeProjection, ChildProjection } from '../../schema/port.js'
import type { JsonPointer, NodeId, ValidationResult } from '../../types.js'

function toPointer(s: string): JsonPointer { return s as JsonPointer }

function makeProjection(
  entries: Array<[string, Partial<NodeProjection> & { children?: ChildProjection[] }]>,
): SchemaProjection {
  const nodes = new Map<JsonPointer, NodeProjection>()
  for (const [pointer, partial] of entries) {
    nodes.set(toPointer(pointer), {
      type: partial.type ?? 'string',
      constraints: partial.constraints ?? {},
      active: partial.active ?? true,
      annotations: partial.annotations ?? {},
      children: partial.children,
      enumValues: partial.enumValues,
      format: partial.format,
    })
  }
  return { nodes }
}

function makePort(
  projectionFn: (data: unknown) => SchemaProjection,
  validateFn?: (data: unknown) => ValidationResult,
): SchemaEvaluationPort {
  return {
    project: projectionFn,
    validate: validateFn ?? (() => ({ valid: true, errors: [] })),
  }
}

const simpleProjection = makeProjection([
  ['', {
    type: 'object',
    children: [
      { pointer: toPointer('/name'), key: 'name', required: true },
      { pointer: toPointer('/age'), key: 'age', required: false },
    ],
  }],
  ['/name', { type: 'string', annotations: { title: 'Name' } }],
  ['/age', { type: 'integer', annotations: { title: 'Age' } }],
])

function findFieldNode(runtime: ReturnType<typeof createFormRuntime>, dataPointer: string): NodeId {
  const doc = runtime.document.getSnapshot()
  const entry = Object.entries(doc.nodes).find(
    ([, n]) => n.dataPointer === dataPointer,
  )
  if (!entry) throw new Error(`No node with dataPointer ${dataPointer}`)
  return entry[0] as NodeId
}

describe('FormRuntime', () => {
  it('creates initial document from projection', () => {
    const port = makePort(() => simpleProjection)
    const runtime = createFormRuntime(port, { initialData: { name: 'Alice', age: 30 } })
    const doc = runtime.document.getSnapshot()
    expect(doc.version).toBe(1)
    expect(doc.rootId).toBeDefined()
    expect(Object.keys(doc.nodes).length).toBe(3)
    runtime.destroy()
  })

  it('initializes node stores with data values', () => {
    const port = makePort(() => simpleProjection)
    const runtime = createFormRuntime(port, { initialData: { name: 'Alice', age: 30 } })
    const nameId = findFieldNode(runtime, '/name')
    const state = runtime.getNodeState(nameId)!
    expect(state.value.getSnapshot()).toBe('Alice')
    expect(state.dirty.getSnapshot()).toBe(false)
    expect(state.touched.getSnapshot()).toBe(false)
    expect(state.visible.getSnapshot()).toBe(true)
    expect(state.disabled.getSnapshot()).toBe(false)
    expect(state.validationStatus.getSnapshot()).toBe('idle')
    expect(state.errors.getSnapshot()).toEqual([])
    runtime.destroy()
  })

  it('dispatch SetValue updates value and data stores', () => {
    const port = makePort(() => simpleProjection)
    const runtime = createFormRuntime(port, { initialData: { name: '', age: 0 } })
    const nameId = findFieldNode(runtime, '/name')
    runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Bob' })
    expect(runtime.getNodeState(nameId)!.value.getSnapshot()).toBe('Bob')
    expect((runtime.data.getSnapshot() as Record<string, unknown>).name).toBe('Bob')
    runtime.destroy()
  })

  it('dispatch SetValue marks dirty', () => {
    const port = makePort(() => simpleProjection)
    const runtime = createFormRuntime(port, { initialData: { name: '' } })
    const nameId = findFieldNode(runtime, '/name')
    runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Bob' })
    expect(runtime.getNodeState(nameId)!.dirty.getSnapshot()).toBe(true)
    runtime.destroy()
  })

  it('dispatch SetTouched marks touched', () => {
    const port = makePort(() => simpleProjection)
    const runtime = createFormRuntime(port, { initialData: { name: '' } })
    const nameId = findFieldNode(runtime, '/name')
    runtime.dispatch({ type: 'SetTouched', nodeId: nameId })
    expect(runtime.getNodeState(nameId)!.touched.getSnapshot()).toBe(true)
    runtime.destroy()
  })

  it('dispatch SetValue triggers recompile and updates visible stores', () => {
    let callCount = 0
    const port = makePort((data) => {
      callCount++
      const toggled = (data as Record<string, unknown>).toggle === true
      return makeProjection([
        ['', {
          type: 'object',
          children: [
            { pointer: toPointer('/toggle'), key: 'toggle', required: false },
            { pointer: toPointer('/extra'), key: 'extra', required: false },
          ],
        }],
        ['/toggle', { type: 'boolean' }],
        ['/extra', { type: 'string', active: toggled }],
      ])
    })
    const runtime = createFormRuntime(port, { initialData: { toggle: false } })
    const extraId = findFieldNode(runtime, '/extra')
    expect(runtime.getNodeState(extraId)!.visible.getSnapshot()).toBe(false)

    const toggleId = findFieldNode(runtime, '/toggle')
    runtime.dispatch({ type: 'SetValue', nodeId: toggleId, value: true })
    expect(runtime.getNodeState(extraId)!.visible.getSnapshot()).toBe(true)
    expect(callCount).toBeGreaterThanOrEqual(2)
    runtime.destroy()
  })

  it('dispatch Submit triggers validation and updates error stores on failure', async () => {
    const port = makePort(
      () => simpleProjection,
      () => ({
        valid: false,
        errors: [{
          instancePointer: '/name',
          keyword: 'minLength',
          message: 'Must not be empty',
          params: {},
        }],
      }),
    )
    const runtime = createFormRuntime(port, { initialData: { name: '' } })
    runtime.dispatch({ type: 'Submit' })
    await vi.waitFor(() => {
      const nameId = findFieldNode(runtime, '/name')
      expect(runtime.getNodeState(nameId)!.errors.getSnapshot().length).toBeGreaterThan(0)
    })
    const nameId = findFieldNode(runtime, '/name')
    expect(runtime.getNodeState(nameId)!.validationStatus.getSnapshot()).toBe('invalid')
    expect(runtime.submission.getSnapshot().status).toBe('idle')
    runtime.destroy()
  })

  it('dispatch Submit calls onSubmit when valid', async () => {
    let submitted = false
    const port = makePort(
      () => simpleProjection,
      () => ({ valid: true, errors: [] }),
    )
    const runtime = createFormRuntime(port, {
      initialData: { name: 'Alice' },
      onSubmit: async () => { submitted = true },
    })
    runtime.dispatch({ type: 'Submit' })
    await vi.waitFor(() => {
      expect(runtime.submission.getSnapshot().status).toBe('submitted')
    })
    expect(submitted).toBe(true)
    runtime.destroy()
  })

  it('dispatch Reset restores initial state', () => {
    const port = makePort(() => simpleProjection)
    const runtime = createFormRuntime(port, { initialData: { name: 'Alice', age: 30 } })
    const nameId = findFieldNode(runtime, '/name')
    runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Bob' })
    expect(runtime.getNodeState(nameId)!.value.getSnapshot()).toBe('Bob')
    runtime.dispatch({ type: 'Reset' })
    expect(runtime.getNodeState(nameId)!.value.getSnapshot()).toBe('Alice')
    expect(runtime.getNodeState(nameId)!.dirty.getSnapshot()).toBe(false)
    runtime.destroy()
  })

  it('store subscribers fire on dispatch', () => {
    const port = makePort(() => simpleProjection)
    const runtime = createFormRuntime(port, { initialData: { name: '' } })
    const nameId = findFieldNode(runtime, '/name')
    let notified = false
    runtime.getNodeState(nameId)!.value.subscribe(() => { notified = true })
    runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Bob' })
    expect(notified).toBe(true)
    runtime.destroy()
  })

  it('returns undefined for unknown nodeId', () => {
    const port = makePort(() => simpleProjection)
    const runtime = createFormRuntime(port, { initialData: {} })
    expect(runtime.getNodeState('nonexistent' as NodeId)).toBeUndefined()
    runtime.destroy()
  })
})

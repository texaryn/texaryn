import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { useField } from '../use-field.js'
import { useFieldArray } from '../use-field-array.js'
import { FormContext } from '../../context.js'
import { createFormRuntime } from '@texaryn/core'
import type {
  SchemaEvaluationPort, SchemaProjection, NodeProjection,
  ChildProjection, JsonPointer, NodeId, FormRuntime,
} from '@texaryn/core'

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

const simpleProjection = makeProjection([
  ['', {
    type: 'object',
    children: [
      { pointer: toPointer('/name'), key: 'name', required: true },
    ],
  }],
  ['/name', { type: 'string', annotations: { title: 'Name' } }],
])

const arrayProjection = makeProjection([
  ['', {
    type: 'object',
    children: [
      { pointer: toPointer('/tags'), key: 'tags', required: false },
    ],
  }],
  ['/tags', { type: 'array', constraints: { maxItems: 5 } }],
])

function makePort(proj: SchemaProjection): SchemaEvaluationPort {
  return {
    project: () => proj,
    validate: () => ({ valid: true, errors: [] }),
  }
}

function findFieldNodeId(runtime: FormRuntime, dataPointer: string): NodeId {
  const doc = runtime.document.getSnapshot()
  const entry = Object.entries(doc.nodes).find(
    ([, n]) => n.dataPointer === dataPointer,
  )
  if (!entry) throw new Error(`No node with dataPointer ${dataPointer}`)
  return entry[0] as NodeId
}

function createProviderWrapper(runtime: FormRuntime) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <FormContext.Provider value={runtime}>
        {children}
      </FormContext.Provider>
    )
  }
}

describe('useField', () => {
  it('returns current field value', () => {
    const port = makePort(simpleProjection)
    const runtime = createFormRuntime(port, { initialData: { name: 'Alice' } })
    const nodeId = findFieldNodeId(runtime, '/name')
    const wrapper = createProviderWrapper(runtime)
    const { result } = renderHook(() => useField(nodeId), { wrapper })
    expect(result.current.value).toBe('Alice')
    runtime.destroy()
  })

  it('onChange dispatches SetValue and updates value', () => {
    const port = makePort(simpleProjection)
    const runtime = createFormRuntime(port, { initialData: { name: '' } })
    const nodeId = findFieldNodeId(runtime, '/name')
    const wrapper = createProviderWrapper(runtime)
    const { result } = renderHook(() => useField(nodeId), { wrapper })
    act(() => { result.current.onChange('Bob') })
    expect(result.current.value).toBe('Bob')
    runtime.destroy()
  })

  it('onBlur dispatches SetTouched', () => {
    const port = makePort(simpleProjection)
    const runtime = createFormRuntime(port, { initialData: { name: '' } })
    const nodeId = findFieldNodeId(runtime, '/name')
    const wrapper = createProviderWrapper(runtime)
    const { result } = renderHook(() => useField(nodeId), { wrapper })
    act(() => { result.current.onBlur() })
    expect(result.current.touched).toBe(true)
    runtime.destroy()
  })

  it('returns default state for unknown nodeId', () => {
    const port = makePort(simpleProjection)
    const runtime = createFormRuntime(port, { initialData: {} })
    const wrapper = createProviderWrapper(runtime)
    const { result } = renderHook(() => useField('nonexistent' as NodeId), { wrapper })
    expect(result.current.value).toBeUndefined()
    expect(result.current.errors).toEqual([])
    expect(result.current.showErrors).toBe(false)
    runtime.destroy()
  })

  it('returns showErrors from node state', () => {
    const port: SchemaEvaluationPort = {
      project: () => simpleProjection,
      validate: () => ({
        valid: false,
        errors: [{ instancePointer: '/name', keyword: 'minLength', params: {} }],
      }),
    }
    const runtime = createFormRuntime(port, {
      initialData: { name: '' },
      hints: { '/name': { validationTrigger: 'blur' } },
    })
    const nodeId = findFieldNodeId(runtime, '/name')
    const wrapper = createProviderWrapper(runtime)
    const { result } = renderHook(() => useField(nodeId), { wrapper })
    expect(result.current.showErrors).toBe(false)
    act(() => { result.current.onBlur() })
    expect(result.current.showErrors).toBe(true)
    runtime.destroy()
  })
})

describe('useFieldArray', () => {
  it('returns items from array container', () => {
    const port = makePort(arrayProjection)
    const runtime = createFormRuntime(port, { initialData: { tags: ['a', 'b'] } })
    const doc = runtime.document.getSnapshot()
    const arrayId = Object.values(doc.nodes).find(
      (n) => n.type === 'container' && n.containerType === 'array',
    )!.id
    const wrapper = createProviderWrapper(runtime)
    const { result } = renderHook(() => useFieldArray(arrayId), { wrapper })
    expect(result.current.items.length).toBe(2)
    runtime.destroy()
  })
})

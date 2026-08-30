import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useForm } from '../use-form.js'
import type {
  SchemaEvaluationPort, SchemaProjection, NodeProjection,
  ChildProjection, JsonPointer,
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

function makePort(proj: SchemaProjection): SchemaEvaluationPort {
  return {
    project: () => proj,
    validate: () => ({ valid: true, errors: [] }),
  }
}

describe('useForm', () => {
  it('returns document on initial render', () => {
    const port = makePort(simpleProjection)
    const { result } = renderHook(() => useForm(port, { initialData: { name: 'Alice' } }))
    expect(result.current.document.version).toBe(1)
    expect(result.current.document.rootId).toBeDefined()
  })

  it('returns current data', () => {
    const port = makePort(simpleProjection)
    const { result } = renderHook(() => useForm(port, { initialData: { name: 'Alice' } }))
    expect((result.current.data as Record<string, unknown>).name).toBe('Alice')
  })

  it('re-renders when data changes via dispatch', () => {
    const port = makePort(simpleProjection)
    const { result } = renderHook(() => useForm(port, { initialData: { name: '' } }))
    const nameNode = Object.values(result.current.document.nodes).find(
      n => n.type === 'field' && n.dataPointer === '/name',
    )!
    act(() => {
      result.current.dispatch({ type: 'SetValue', nodeId: nameNode.id, value: 'Bob' })
    })
    expect((result.current.data as Record<string, unknown>).name).toBe('Bob')
  })

  it('cleans up runtime on unmount', () => {
    const port = makePort(simpleProjection)
    const { unmount } = renderHook(() => useForm(port))
    unmount()
  })
})

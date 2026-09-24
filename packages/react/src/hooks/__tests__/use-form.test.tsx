import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { StrictMode } from 'react'
import { useForm } from '../use-form.js'
import { FormProvider } from '../../context.js'
import { FormRoot } from '../../components/FormRoot.js'
import { createDefaultRegistry } from '../../widgets/index.js'
import type {
  SchemaEvaluationPort, SchemaProjection, NodeProjection,
  ChildProjection, JsonPointer, FormRuntime, NodeId,
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

function nameNodeId(runtime: FormRuntime): NodeId {
  return Object.values(runtime.document.getSnapshot().nodes).find(
    n => n.type === 'field' && n.dataPointer === '/name',
  )!.id
}

function nextTask(): Promise<void> {
  return new Promise(resolve => { setTimeout(resolve, 0) })
}

afterEach(() => {
  cleanup()
})

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

  it('destroys the runtime on the task after unmount', async () => {
    const port = makePort(simpleProjection)
    const { result, unmount } = renderHook(() => useForm(port))
    const runtime = result.current.runtime
    const destroy = vi.spyOn(runtime, 'destroy')
    unmount()
    expect(destroy).not.toHaveBeenCalled()
    await nextTask()
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(runtime.getNodeState(nameNodeId(runtime))).toBeUndefined()
  })
})

describe('useForm under StrictMode', () => {
  const registry = createDefaultRegistry()

  function Form({ port, onSubmit, onRuntime }: {
    port: SchemaEvaluationPort
    onSubmit: (data: unknown) => void
    onRuntime: (runtime: FormRuntime) => void
  }) {
    const form = useForm(port, { initialData: { name: '' }, validationDebounceMs: 0, onSubmit })
    onRuntime(form.runtime)
    return (
      <FormProvider value={form.runtime}>
        <FormRoot registry={registry} />
        <button type="button" onClick={() => form.dispatch({ type: 'Submit' })}>
          Submit
        </button>
      </FormProvider>
    )
  }

  function renderStrict() {
    const onSubmit = vi.fn()
    const runtimes = new Set<FormRuntime>()
    const view = render(
      <StrictMode>
        <Form port={makePort(simpleProjection)} onSubmit={onSubmit} onRuntime={r => { runtimes.add(r) }} />
      </StrictMode>,
    )
    return { ...view, onSubmit, runtimes }
  }

  it('keeps one live runtime through the effect replay, so typing and submit work', async () => {
    const { onSubmit, runtimes } = renderStrict()
    await nextTask()

    expect(runtimes.size).toBe(1)
    const [runtime] = runtimes
    expect(runtime.getNodeState(nameNodeId(runtime))).toBeDefined()

    const input = screen.getByLabelText(/^Name/) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Ada' } })
    expect(input.value).toBe('Ada')

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({ name: 'Ada' })
    })
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('still destroys the runtime once on a real unmount', async () => {
    const { runtimes, unmount } = renderStrict()
    await nextTask()
    const [runtime] = runtimes
    const destroy = vi.spyOn(runtime, 'destroy')

    unmount()
    await nextTask()
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(runtime.getNodeState(nameNodeId(runtime))).toBeUndefined()
  })
})

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { createStore } from '@texaryn/core'
import type {
  FormRuntime,
  NodeId,
  JsonPointer,
  VisibleError,
  UIDocument,
  SubmissionState,
  SchemaEvaluationPort,
} from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { FormProvider } from '../../context.js'
import { ErrorSummary } from '../ErrorSummary.js'
import { FormRoot } from '../FormRoot.js'
import { useForm } from '../../hooks/use-form.js'
import { createDefaultRegistry } from '../../widgets/index.js'

afterEach(() => {
  cleanup()
})

function makeMockRuntime(visibleErrors: VisibleError[]): FormRuntime {
  return {
    document: createStore<UIDocument>({ version: 1, rootId: 'node_1' as NodeId, nodes: {} }),
    data: createStore<unknown>({}),
    submission: createStore<SubmissionState>({ status: 'idle', attempts: 0 }),
    visibleErrors: createStore<VisibleError[]>(visibleErrors),
    dispatch: () => {},
    getNodeState: () => undefined,
    destroy: () => {},
  }
}

function renderWithRuntime(runtime: FormRuntime) {
  return render(
    <FormProvider value={runtime}>
      <ErrorSummary />
    </FormProvider>,
  )
}

describe('ErrorSummary', () => {
  it('renders nothing when no visible errors', () => {
    const { container } = renderWithRuntime(makeMockRuntime([]))
    expect(container.innerHTML).toBe('')
  })

  it('renders error list when visible errors exist', () => {
    const errors: VisibleError[] = [{
      nodeId: 'node_2' as NodeId,
      fieldTitle: 'Name',
      pointer: '/name' as JsonPointer,
      errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }],
    }]
    renderWithRuntime(makeMockRuntime(errors))
    // No live role: the fields announce their own errors, so an aggregate
    // region would speak the same validation event a second time.
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(/Name/)).toBeTruthy()
    expect(screen.getByText(/Required/)).toBeTruthy()
  })

  it('links each error to the field input by anchor', () => {
    const errors: VisibleError[] = [{
      nodeId: 'node_2' as NodeId,
      fieldTitle: 'Email',
      pointer: '/email' as JsonPointer,
      errors: [{ instancePointer: '/email', keyword: 'format', message: 'Invalid email', params: {} }],
    }]
    renderWithRuntime(makeMockRuntime(errors))
    const link = screen.getByRole('link')
    // The prefix belongs to the provider instance, so only the shape is fixed.
    expect(link.getAttribute('href')).toMatch(/^#texaryn-[0-9a-z_]+-node_2-input$/)
  })

  it('falls back to pointer when fieldTitle is undefined', () => {
    const errors: VisibleError[] = [{
      nodeId: 'node_2' as NodeId,
      fieldTitle: undefined,
      pointer: '/name' as JsonPointer,
      errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }],
    }]
    renderWithRuntime(makeMockRuntime(errors))
    expect(screen.getByText(/\/name/)).toBeTruthy()
  })

  it('falls back to nodeId when both fieldTitle and pointer are null', () => {
    const errors: VisibleError[] = [{
      nodeId: 'node_2' as NodeId,
      fieldTitle: undefined,
      pointer: null,
      errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }],
    }]
    renderWithRuntime(makeMockRuntime(errors))
    expect(screen.getByText(/node_2/)).toBeTruthy()
  })

  it('falls back to keyword when message is undefined', () => {
    const errors: VisibleError[] = [{
      nodeId: 'node_2' as NodeId,
      fieldTitle: 'Name',
      pointer: '/name' as JsonPointer,
      errors: [{ instancePointer: '/name', keyword: 'minLength', params: {} }],
    }]
    renderWithRuntime(makeMockRuntime(errors))
    expect(screen.getByText(/minLength/)).toBeTruthy()
  })

  it('renders multiple fields with errors', () => {
    const errors: VisibleError[] = [
      {
        nodeId: 'node_2' as NodeId,
        fieldTitle: 'Name',
        pointer: '/name' as JsonPointer,
        errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }],
      },
      {
        nodeId: 'node_3' as NodeId,
        fieldTitle: 'Age',
        pointer: '/age' as JsonPointer,
        errors: [{ instancePointer: '/age', keyword: 'minimum', message: 'Too low', params: {} }],
      },
    ]
    renderWithRuntime(makeMockRuntime(errors))
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
  })
})

describe('ErrorSummary over a live runtime', () => {
  const registry = createDefaultRegistry()

  const schema = {
    type: 'object',
    properties: {
      name: { type: 'string', title: 'Full Name', minLength: 1 },
    },
    required: ['name'],
  }

  function Form({ port }: { port: SchemaEvaluationPort }) {
    const form = useForm(port, { initialData: { name: '' } })
    return (
      <FormProvider value={form.runtime}>
        <ErrorSummary />
        <FormRoot registry={registry} />
        <button type="button" onClick={() => form.dispatch({ type: 'Submit' })}>
          Submit
        </button>
      </FormProvider>
    )
  }

  async function renderForm() {
    const port = await createJsonSchemaAdapter(schema)
    render(<Form port={port} />)
    await waitFor(() => {
      expect(screen.getByLabelText('Full Name')).toBeTruthy()
    })
  }

  it('lists nothing before the user submits', async () => {
    await renderForm()
    expect(screen.queryAllByRole('alert')).toHaveLength(0)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('links a failed submit to the input the renderer actually mounted', async () => {
    await renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => {
      expect(screen.getByRole('link')).toBeTruthy()
    })
    const href = screen.getByRole('link').getAttribute('href') ?? ''
    expect(document.getElementById(href.slice(1))).toBe(screen.getByLabelText('Full Name'))
  })
})

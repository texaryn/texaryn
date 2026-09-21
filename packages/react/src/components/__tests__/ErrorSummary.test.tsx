import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { createStore, englishMessages } from '@texaryn/core'
import type {
  FormRuntime,
  NodeId,
  JsonPointer,
  VisibleError,
  UIDocument,
  SubmissionState,
  SchemaEvaluationPort,
  InitializationReport,
  FormMessages,
  WritableStore,
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

function makeMockRuntime(visibleErrors: VisibleError[]): FormRuntime & { submission: WritableStore<SubmissionState> } {
  return {
    document: createStore<UIDocument>({ version: 1, rootId: 'node_1' as NodeId, nodes: {} }),
    data: createStore<unknown>({}),
    submission: createStore<SubmissionState>({ status: 'idle', attempts: 0 }),
    visibleErrors: createStore<VisibleError[]>(visibleErrors),
    initialization: createStore<InitializationReport | undefined>(undefined),
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
    const group = screen.getByRole('group', { name: 'There is a problem' })
    expect(group.getAttribute('tabindex')).toBe('-1')
    const heading = group.querySelector('h2')!
    expect(group.firstElementChild).toBe(heading)
    expect(group.getAttribute('aria-labelledby')).toBe(heading.id)
    expect(heading.id).toMatch(/^texaryn-[0-9a-z_]+-error-summary-heading$/)
    expect(screen.getByRole('listitem').textContent).toBe('Name: Required')
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
    expect(screen.getByRole('group', { name: 'There are 2 problems' })).toBeTruthy()
  })

  it('does not focus a summary mounted after an old failed attempt', () => {
    const runtime = makeMockRuntime([
      {
        nodeId: 'node_2' as NodeId,
        fieldTitle: 'Name',
        pointer: '/name' as JsonPointer,
        errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }],
      },
    ])
    runtime.submission.set({ status: 'idle', attempts: 2 })
    renderWithRuntime(runtime)
    expect(screen.getByRole('group')).toBeTruthy()
    expect(document.activeElement).toBe(document.body)
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

  function Form({
    port,
    focus,
    messages,
  }: {
    port: SchemaEvaluationPort
    focus?: boolean
    messages?: FormMessages
  }) {
    const form = useForm(port, { initialData: { name: '' }, validationDebounceMs: 0 })
    return (
      <FormProvider value={form.runtime} messages={messages}>
        <ErrorSummary focus={focus} />
        <FormRoot registry={registry} />
        <button type="button" onClick={() => form.dispatch({ type: 'Submit' })}>
          Submit
        </button>
      </FormProvider>
    )
  }

  async function renderForm(props: { focus?: boolean; messages?: FormMessages } = {}) {
    const port = await createJsonSchemaAdapter(schema)
    render(<Form port={port} {...props} />)
    await waitFor(() => {
      expect(screen.getByLabelText(/^Full Name/)).toBeTruthy()
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
    expect(document.getElementById(href.slice(1))).toBe(screen.getByLabelText(/^Full Name/))
  })

  it('focuses the group once a failed submit settles, and again on the next attempt', async () => {
    await renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('group', { name: 'There is a problem' }))
    })
    const group = screen.getByRole('group')
    screen.getByLabelText(/^Full Name/).focus()
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => {
      expect(document.activeElement).toBe(group)
    })
  })

  it('leaves focus alone when told not to move it', async () => {
    await renderForm({ focus: false })
    const input = screen.getByLabelText(/^Full Name/)
    input.focus()
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => {
      expect(screen.getByRole('group')).toBeTruthy()
    })
    expect(document.activeElement).toBe(input)
  })

  it('renders the heading and the detail from the configured messages', async () => {
    const french: FormMessages = {
      ...englishMessages,
      errorSummaryHeading: ({ count }) => (count === 1 ? 'Il y a un problème' : `Il y a ${count} problèmes`),
      errorSummaryDetail: ({ messages }) => ` : ${messages.join(', ')}`,
    }
    await renderForm({ messages: french })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => {
      expect(screen.getByRole('group', { name: 'Il y a un problème' })).toBeTruthy()
    })
    expect(screen.getByRole('listitem').textContent).toMatch(/^Full Name : ./)
  })
})

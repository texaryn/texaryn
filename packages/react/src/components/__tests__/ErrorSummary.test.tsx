import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { createPortal } from 'react-dom'
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
    initializationPolicy: 'none',
    dispatch: () => {},
    subscribeMutations: () => () => {},
    registerCommandGuard: () => () => {},
    applyRemoteSnapshot: () => {},
    lockArrayStructure: () => () => {},
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
    const group = screen.getByRole('region', { name: 'There is a problem' })
    expect(group.getAttribute('tabindex')).toBe('-1')
    const heading = group.querySelector('h2')!
    expect(group.firstElementChild).toBe(heading)
    expect(group.getAttribute('aria-labelledby')).toBe(heading.id)
    expect(heading.id).toMatch(/^texaryn-[0-9a-z_]+-error-summary-heading$/)
    expect(screen.getByRole('listitem').textContent).toBe('Name: This field is required.')
    expect(screen.getByText(/Name/)).toBeTruthy()
    expect(screen.getByText(/This field is required/)).toBeTruthy()
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

  it('focuses a linked field inside the summary shadow root', () => {
    const host = document.createElement('div')
    document.body.append(host)
    const shadow = host.attachShadow({ mode: 'open' })
    const errors: VisibleError[] = [{
      nodeId: 'node_2' as NodeId,
      fieldTitle: 'Email',
      pointer: '/email' as JsonPointer,
      errors: [{ instancePointer: '/email', keyword: 'format', message: 'Invalid email', params: {} }],
    }]
    render(createPortal(
      <FormProvider value={makeMockRuntime(errors)}>
        <ErrorSummary />
      </FormProvider>,
      shadow,
    ))

    const link = shadow.querySelector('a')!
    const input = document.createElement('input')
    input.id = link.hash.slice(1)
    shadow.append(input)
    fireEvent.click(link)

    expect(shadow.activeElement).toBe(input)
    host.remove()
  })

  it('uses a readable label when fieldTitle is undefined', () => {
    const errors: VisibleError[] = [{
      nodeId: 'node_2' as NodeId,
      fieldTitle: undefined,
      pointer: '/name' as JsonPointer,
      errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }],
    }]
    renderWithRuntime(makeMockRuntime(errors))
    expect(screen.getByText(/Name/)).toBeTruthy()
  })

  it('uses a generic label when fieldTitle and pointer are absent', () => {
    const errors: VisibleError[] = [{
      nodeId: 'node_2' as NodeId,
      fieldTitle: undefined,
      pointer: null,
      errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }],
    }]
    renderWithRuntime(makeMockRuntime(errors))
    expect(screen.getByText(/Field/)).toBeTruthy()
  })

  it('uses safe copy when message is undefined', () => {
    const errors: VisibleError[] = [{
      nodeId: 'node_2' as NodeId,
      fieldTitle: 'Name',
      pointer: '/name' as JsonPointer,
      errors: [{ instancePointer: '/name', keyword: 'minLength', params: {} }],
    }]
    renderWithRuntime(makeMockRuntime(errors))
    expect(screen.getByText(/This value is too short/)).toBeTruthy()
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
    expect(screen.getByRole('region', { name: 'There are 2 problems' })).toBeTruthy()
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
    expect(screen.getByRole('region')).toBeTruthy()
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
    initialData,
  }: {
    port: SchemaEvaluationPort
    focus?: boolean
    messages?: FormMessages
    initialData?: unknown
  }) {
    const form = useForm(port, { initialData: initialData ?? { name: '' }, validationDebounceMs: 0 })
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

  async function renderForm(props: {
    focus?: boolean
    messages?: FormMessages
    schema?: unknown
    initialData?: unknown
    expectedLabel?: RegExp
  } = {}) {
    const port = await createJsonSchemaAdapter(props.schema ?? schema)
    render(<Form port={port} focus={props.focus} messages={props.messages} initialData={props.initialData} />)
    await waitFor(() => {
      expect(screen.getByLabelText(props.expectedLabel ?? /^Full Name/)).toBeTruthy()
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

  it('focuses the region once a failed submit settles, and again on the next attempt', async () => {
    await renderForm()
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('region', { name: 'There is a problem' }))
    })
    const group = screen.getByRole('region')
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
      expect(screen.getByRole('region')).toBeTruthy()
    })
    expect(document.activeElement).toBe(input)
  })

  it('renders the heading and the detail from the configured messages', async () => {
    const french: FormMessages = {
      ...englishMessages,
      errorSummaryHeading: ({ count }) => (count === 1 ? 'Il y a un problème' : `Il y a ${count} problèmes`),
      errorSummaryDetail: ({ messages }) => ` : ${messages.join(', ')}`,
      validationMessage: () => 'Champ invalide.',
    }
    await renderForm({ messages: french })
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Il y a un problème' })).toBeTruthy()
    })
    expect(screen.getByRole('listitem').textContent).toMatch(/^Full Name : ./)
  })

  it('uses the same localized fallback label for an untitled field and its summary link', async () => {
    const french: FormMessages = {
      ...englishMessages,
      errorSummaryHeading: () => 'Il y a un problème',
      errorSummaryDetail: ({ messages }) => ` : ${messages.join(', ')}`,
      fieldLabel: ({ fieldName, itemPosition }) =>
        fieldName ?? (itemPosition === undefined ? 'Champ' : `Élément ${itemPosition}`),
      validationMessage: () => 'Ce champ est invalide.',
    }
    await renderForm({
      schema: {
        type: 'object',
        properties: { first_name: { type: 'string', minLength: 1 } },
        required: ['first_name'],
      },
      initialData: { first_name: '' },
      messages: french,
      expectedLabel: /^First name/,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Il y a un problème' })).toBeTruthy()
    })
    expect(screen.getByRole('link', { name: 'First name' })).toBeTruthy()
    expect(screen.getByLabelText(/^First name/)).toBeTruthy()
  })
})

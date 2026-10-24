import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import type { Accessor } from 'solid-js'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import type { FormRuntime, NodeId, UIHints } from '@texaryn/core'
import type { JSX } from 'solid-js'
import { createForm } from '../src/form.js'
import { createDefaultRegistry } from '../src/registry.js'
import { FormRoot } from '../src/components/FormRoot.js'
import { useField } from '../src/field.js'
import { createArrayDragTransfer, dispatchArrayDrag } from '../../../tests/renderer-conformance/array-drag.js'

afterEach(cleanup)

function NativeForm(props: { form: FormRuntime; children: JSX.Element }) {
  function submit(event: SubmitEvent) {
    event.preventDefault()
    props.form.dispatch({ type: 'Submit' })
  }
  return <form noValidate onSubmit={submit}>{props.children}</form>
}

async function renderForm(
  schema: Record<string, unknown>,
  initialData: unknown = {},
  hints?: UIHints,
) {
  const port = await createJsonSchemaAdapter(schema)
  const form = createForm(port, { initialData, hints })
  const rendered = render(() => <FormRoot form={form} registry={createDefaultRegistry()} destroyOnUnmount={false} />)
  return { form, ...rendered }
}

describe('Solid renderer', () => {
  it('updates form data from a labeled field', async () => {
    const { form } = await renderForm({
      type: 'object',
      properties: { name: { type: 'string', title: 'Name' } },
    })
    const input = screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement
    expect(document.querySelector('form')).toBeNull()

    fireEvent.input(input, { target: { value: 'Ada' } })

    await waitFor(() => expect(form.data.getSnapshot()).toEqual({ name: 'Ada' }))
  })

  it('shows and focuses the error summary after an invalid submit', async () => {
    const port = await createJsonSchemaAdapter({
      type: 'object',
      properties: { name: { type: 'string', title: 'Name', minLength: 2 } },
      required: ['name'],
    })
    const form = createForm(port, { initialData: { name: '' } })
    render(() => (
      <NativeForm form={form}>
        <FormRoot form={form} registry={createDefaultRegistry()} showErrorSummary />
        <button type="submit">Submit</button>
      </NativeForm>
    ))

    fireEvent.submit(document.querySelector('form')!)

    const summary = await screen.findByRole('region', { name: 'There is a problem' })
    await waitFor(() => expect(document.activeElement).toBe(summary))
    expect(screen.getByRole('textbox', { name: 'Name (required)' }).getAttribute('aria-invalid')).toBe('true')
    expect(summary.querySelector('a')?.getAttribute('href')).toBeTruthy()
  })

  it('restores read-only checkbox and select state after browser changes', async () => {
    const { form } = await renderForm({
      type: 'object',
      properties: {
        active: { type: 'boolean', title: 'Active', readOnly: true },
        role: { type: 'string', title: 'Role', enum: ['dev', 'pm'], readOnly: true },
      },
    }, { active: false, role: 'dev' })
    const checkbox = screen.getByRole('checkbox', { name: 'Active' }) as HTMLInputElement
    const select = screen.getByRole('combobox', { name: 'Role' }) as HTMLSelectElement

    fireEvent.click(checkbox)
    fireEvent.change(select, { target: { value: '1' } })

    expect(checkbox.checked).toBe(false)
    expect(select.value).toBe('0')
    expect(form.data.getSnapshot()).toEqual({ active: false, role: 'dev' })
  })

  it('matches object enum values without depending on property insertion order', async () => {
    const { form } = await renderForm({
      type: 'object',
      properties: {
        choice: {
          type: ['string', 'object'],
          title: 'Choice',
          enum: [{ label: 'item', nested: { left: 1, right: 2 } }],
        },
      },
    }, { choice: { nested: { right: 2, left: 1 }, label: 'item' } })
    const select = screen.getByRole('combobox', { name: 'Choice' }) as HTMLSelectElement

    expect(select.value).toBe('0')
    expect(form.data.getSnapshot()).toEqual({ choice: { nested: { right: 2, left: 1 }, label: 'item' } })
  })

  it('renders editable checkboxes and hinted textareas', async () => {
    const { form } = await renderForm({
      type: 'object',
      properties: {
        active: { type: 'boolean', title: 'Active' },
        notes: { type: 'string', title: 'Notes' },
      },
    }, { active: false, notes: 'First' }, {
      '/notes': { widget: 'textarea' },
    })
    const checkbox = screen.getByRole('checkbox', { name: 'Active' }) as HTMLInputElement
    const textarea = screen.getByRole('textbox', { name: 'Notes' }) as HTMLTextAreaElement

    fireEvent.click(checkbox)
    fireEvent.input(textarea, { target: { value: 'Updated notes' } })

    await waitFor(() => expect(form.data.getSnapshot()).toEqual({
      active: true,
      notes: 'Updated notes',
    }))
  })

  it('keeps array rows attached to their stable item ids after a move', async () => {
    const { form } = await renderForm({
      type: 'object',
      properties: {
        people: {
          type: 'array',
          title: 'People',
          items: { type: 'object', properties: { name: { type: 'string', title: 'Name' } } },
        },
      },
    }, { people: [{ name: 'Ada' }, { name: 'Grace' }] }, { '/people': { canReorder: true } })
    const rows = [...document.querySelectorAll<HTMLElement>('[data-array-row]')]
    const firstInput = rows[0]?.querySelector('input')
    const secondInput = rows[1]?.querySelector('input')
    const moveDown = rows[0]?.querySelector<HTMLButtonElement>('[data-reorder-direction="down"]')

    fireEvent.click(moveDown!)

    await waitFor(() => expect(form.data.getSnapshot()).toEqual({ people: [{ name: 'Grace' }, { name: 'Ada' }] }))
    expect(document.querySelectorAll('[data-array-row]')[1]?.querySelector('input')).toBe(firstInput)
    expect(document.querySelectorAll('[data-array-row]')[0]?.querySelector('input')).toBe(secondInput)
  })

  it('adds and removes array rows through the default controls', async () => {
    const { form } = await renderForm({
      type: 'object',
      properties: {
        people: {
          type: 'array',
          title: 'People',
          items: { type: 'object', title: 'Person', properties: { name: { type: 'string' } } },
        },
      },
    }, { people: [{ name: 'Ada' }] })
    const add = screen.getByRole('button', { name: 'Add item to People' })

    fireEvent.click(add)
    await waitFor(() => expect(form.data.getSnapshot()).toEqual({ people: [{ name: 'Ada' }, null] }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Person 2 from People' }))
    await waitFor(() => expect(form.data.getSnapshot()).toEqual({ people: [{ name: 'Ada' }] }))
  })

  it('restores focus to the moved array row controls at either end', async () => {
    const { form } = await renderForm({
      type: 'object',
      properties: {
        people: {
          type: 'array',
          title: 'People',
          items: { type: 'object', properties: { name: { type: 'string', title: 'Name' } } },
        },
      },
    }, { people: [{ name: 'Ada' }, { name: 'Grace' }, { name: 'Lin' }] }, { '/people': { canReorder: true } })

    const rows = [...document.querySelectorAll<HTMLElement>('[data-array-row]')]
    const firstDown = rows[0]!.querySelector<HTMLButtonElement>('[data-reorder-direction="down"]')!
    firstDown.focus()
    fireEvent.click(firstDown)
    await waitFor(() => expect(form.data.getSnapshot()).toEqual({ people: [{ name: 'Grace' }, { name: 'Ada' }, { name: 'Lin' }] }))

    const movedRows = [...document.querySelectorAll<HTMLElement>('[data-array-row]')]
    const middleUp = movedRows[1]!.querySelector<HTMLButtonElement>('[data-reorder-direction="up"]')!
    middleUp.focus()
    fireEvent.click(middleUp)
    await waitFor(() => expect(document.activeElement?.getAttribute('data-reorder-direction')).toBe('down'))

    const reorderedRows = [...document.querySelectorAll<HTMLElement>('[data-array-row]')]
    const middleDown = reorderedRows[1]!.querySelector<HTMLButtonElement>('[data-reorder-direction="down"]')!
    middleDown.focus()
    fireEvent.click(middleDown)
    await waitFor(() => expect(document.activeElement?.getAttribute('data-reorder-direction')).toBe('up'))
  })

  it('destroys replaced forms and the active form on unmount by default', async () => {
    const port = await createJsonSchemaAdapter({ type: 'object', properties: {} })
    const first = createForm(port)
    const second = createForm(port)
    const firstDestroy = vi.spyOn(first, 'destroy')
    const secondDestroy = vi.spyOn(second, 'destroy')
    const [current, setCurrent] = createSignal(first)
    const rendered = render(() => <FormRoot form={current()} />)

    setCurrent(second)
    await waitFor(() => expect(firstDestroy).toHaveBeenCalledOnce())
    rendered.unmount()
    expect(secondDestroy).toHaveBeenCalledOnce()
  })

  it('updates a field binding through number, enum, blur, read-only, and missing-node states', async () => {
    const port = await createJsonSchemaAdapter({
      type: 'object',
      properties: {
        age: { type: 'integer', description: 'Age in years' },
        role: { type: 'string', enum: ['user', 'admin'] },
        locked: { type: 'string', readOnly: true },
      },
    })
    const form = createForm(port, { initialData: { age: 3, role: 'user', locked: 'fixed' } })
    const nodeIdAt = (pointer: string): NodeId => Object.values(form.document.getSnapshot().nodes)
      .find((node) => node.dataPointer === pointer)!.id
    const [nodeId, setNodeId] = createSignal(nodeIdAt('/age'))

    function FieldProbe(props: { nodeId: Accessor<NodeId> }) {
      const field = useField(props.nodeId)
      return <div>
        <span data-testid="field-label">{field.label()}</span>
        <span data-testid="field-description">{field.description()}</span>
        <span data-testid="field-display">{field.display()}</span>
        <span data-testid="field-input-id">{field.inputId()}</span>
        <span data-testid="field-fallbacks">
          {`${field.dirty()} ${field.touched()} ${field.visible()} ${field.disabled()} ${field.showErrors()} ${field.visibleErrors().length}`}
        </span>
        <button type="button" onClick={() => field.setRaw('7')}>Set number</button>
        <button type="button" onClick={() => field.setRaw('')}>Clear number</button>
        <button type="button" onClick={() => field.setRaw('', '99')}>Set invalid enum index</button>
        <button type="button" onClick={() => field.setRaw('', '1')}>Set enum index</button>
        <button type="button" onClick={() => field.setValue('changed')}>Set direct value</button>
        <button type="button" onClick={field.onBlur}>Blur field</button>
      </div>
    }

    render(() => <FormRoot form={form} idPrefix="field-probe" destroyOnUnmount={false}>
      <FieldProbe nodeId={nodeId} />
    </FormRoot>)

    expect(screen.getByTestId('field-label').textContent).toBe('Age')
    expect(screen.getByTestId('field-description').textContent).toBe('Age in years')
    expect(screen.getByTestId('field-input-id').textContent).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Set number' }))
    await waitFor(() => expect(form.data.getSnapshot()).toEqual({ age: 7, role: 'user', locked: 'fixed' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear number' }))
    await waitFor(() => expect(screen.getByTestId('field-display').textContent).toBe(''))
    fireEvent.click(screen.getByRole('button', { name: 'Blur field' }))
    await waitFor(() => expect(form.getNodeState(nodeIdAt('/age'))?.touched.getSnapshot()).toBe(true))

    setNodeId(nodeIdAt('/role'))
    fireEvent.click(screen.getByRole('button', { name: 'Set invalid enum index' }))
    expect(form.data.getSnapshot()).toMatchObject({ role: 'user' })
    fireEvent.click(screen.getByRole('button', { name: 'Set enum index' }))
    await waitFor(() => expect(form.data.getSnapshot()).toMatchObject({ role: 'admin' }))

    setNodeId(nodeIdAt('/locked'))
    fireEvent.click(screen.getByRole('button', { name: 'Set direct value' }))
    fireEvent.click(screen.getByRole('button', { name: 'Set number' }))
    expect(form.data.getSnapshot()).toMatchObject({ locked: 'fixed' })

    setNodeId('missing-node' as NodeId)
    await waitFor(() => {
      expect(screen.getByTestId('field-label').textContent).toBe('')
      expect(screen.getByTestId('field-description').textContent).toBe('')
      expect(screen.getByTestId('field-display').textContent).toBe('')
      expect(screen.getByTestId('field-input-id').textContent).toContain('missing-node')
      expect(screen.getByTestId('field-fallbacks').textContent).toBe('false false true false false 0')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Set number' }))
  })

  it('reorders the selected stable row with native drag events', async () => {
    const { form } = await renderForm({
      type: 'object',
      properties: { people: { type: 'array', items: { type: 'string' } } },
    }, { people: ['Ada', 'Grace', 'Lin'] }, { '/people': { canReorder: true } })
    const root = document.querySelector<HTMLElement>('[data-array-container]')!
    const rows = [...root.querySelectorAll<HTMLElement>('[data-array-row]')]
    const transfer = createArrayDragTransfer()
    const handle = rows[1]!.querySelector<HTMLElement>('[draggable="true"]')!
    expect(handle.tabIndex).toBe(-1)
    expect(handle.getAttribute('aria-hidden')).toBe('true')
    rows[0]!.getBoundingClientRect = () => ({ top: 0, bottom: 100, height: 100 } as DOMRect)

    dispatchArrayDrag('dragstart', handle, transfer)
    dispatchArrayDrag('dragover', rows[0]!, transfer, 10)
    dispatchArrayDrag('drop', rows[0]!, transfer, 10)

    await waitFor(() => expect(form.data.getSnapshot()).toEqual({ people: ['Grace', 'Ada', 'Lin'] }))
  })

  it('ignores missing payloads and clears stale drops without a session', async () => {
    await renderForm({
      type: 'object',
      properties: { people: { type: 'array', items: { type: 'string' } } },
    }, { people: ['Ada', 'Grace', 'Lin'] }, { '/people': { canReorder: true } })
    const root = document.querySelector<HTMLElement>('[data-array-container]')!
    const rows = [...root.querySelectorAll<HTMLElement>('[data-array-row]')]
    const emptyTransfer = createArrayDragTransfer()
    dispatchArrayDrag('dragover', rows[0]!, emptyTransfer)
    dispatchArrayDrag('drop', rows[0]!, emptyTransfer)

    const staleTransfer = createArrayDragTransfer()
    staleTransfer.setData('application/x-texaryn-array-item', 'removed-item')
    root.setAttribute('data-array-drag-active', '')
    rows[0]!.setAttribute('data-dragging', '')
    rows[1]!.setAttribute('data-drop-target', '')
    dispatchArrayDrag('dragover', rows[1]!, staleTransfer)
    dispatchArrayDrag('dragleave', rows[1]!, staleTransfer)
    dispatchArrayDrag('drop', rows[1]!, staleTransfer)

    expect(root.hasAttribute('data-array-drag-active')).toBe(false)
    expect(rows[0]!.hasAttribute('data-dragging')).toBe(false)
    expect(rows[1]!.hasAttribute('data-drop-target')).toBe(false)
  })
})

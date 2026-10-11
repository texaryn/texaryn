import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createForm } from '../src/form.js'
import { createDefaultRegistry } from '../src/registry.js'
import { FormRoot } from '../src/components/FormRoot.js'
import { createArrayDragTransfer, dispatchArrayDrag } from '../../../tests/renderer-conformance/array-drag.js'

afterEach(cleanup)

async function renderForm(
  schema: Record<string, unknown>,
  initialData: unknown = {},
  hints?: Record<string, { canReorder?: boolean }>,
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
    render(() => <FormRoot form={form} registry={createDefaultRegistry()} showErrorSummary />)

    fireEvent.submit(document.querySelector('form')!)

    const summary = await screen.findByRole('group')
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
})

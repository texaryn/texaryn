import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/svelte'
import { get } from 'svelte/store'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createForm } from '../src/lib/form.js'
import { createDefaultRegistry } from '../src/lib/registry.js'
import FormRoot from '../src/lib/components/FormRoot.svelte'
import { createArrayDragTransfer, dispatchArrayDrag } from '../../../tests/renderer-conformance/array-drag.js'

afterEach(() => {
  document.body.replaceChildren()
})

async function renderForm(
  schema: Record<string, unknown>,
  initialData: unknown = {},
  hints?: Record<string, { canReorder?: boolean }>,
) {
  const port = await createJsonSchemaAdapter(schema)
  const form = createForm(port, { initialData, hints })
  const rendered = render(FormRoot, {
    props: { form, registry: createDefaultRegistry() },
  })
  return { ...rendered, form }
}

describe('Svelte renderer', () => {
  it('binds text and checkbox fields to the shared runtime', async () => {
    const { form } = await renderForm(
      {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name' },
          active: { type: 'boolean', title: 'Active' },
        },
      },
      { name: 'Ada', active: false },
    )
    expect(get(form.document).version).toBe(1)
    expect(get(form.submission).status).toBe('idle')
    expect(get(form.visibleErrors)).toEqual([])

    const name = screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement
    const active = screen.getByRole('checkbox', { name: 'Active' }) as HTMLInputElement

    await fireEvent.input(name, { target: { value: 'Grace' } })
    await fireEvent.change(active, { target: { checked: true } })

    expect(get(form.data)).toEqual({ name: 'Grace', active: true })
  })

  it('announces required field errors after submission', async () => {
    await renderForm({
      type: 'object',
      properties: { name: { type: 'string', title: 'Name', minLength: 2 } },
      required: ['name'],
    })

    const formElement = document.querySelector('form')
    expect(formElement).not.toBeNull()
    await fireEvent.submit(formElement!)

    const summary = await screen.findByRole('group')
    expect(summary.querySelector('a')?.getAttribute('href')).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Name' }).getAttribute('aria-invalid')).toBe('true')
  })

  it('switches runtimes consistently and transfers default teardown ownership', async () => {
    const port = await createJsonSchemaAdapter({
      type: 'object',
      properties: { name: { type: 'string', title: 'Name', minLength: 2 } },
      required: ['name'],
    })
    const first = createForm(port, { initialData: { name: 'Ada' } })
    const second = createForm(port, { initialData: { name: 'G' } })
    const firstDestroy = vi.spyOn(first.runtime, 'destroy')
    const secondDestroy = vi.spyOn(second.runtime, 'destroy')
    const rendered = render(FormRoot, { props: { form: first } })

    await fireEvent.submit(document.querySelector('form')!)
    await vi.waitFor(() => expect(get(first.submission).status).toBe('submitted'))

    await rendered.rerender({ form: second })
    expect((screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement).value).toBe('G')
    expect(firstDestroy).toHaveBeenCalledTimes(1)

    const input = screen.getByRole('textbox', { name: 'Name' })
    await fireEvent.input(input, { target: { value: '' } })
    expect(get(second.data)).toEqual({ name: '' })
    expect(get(first.data)).toEqual({ name: 'Ada' })

    await fireEvent.submit(document.querySelector('form')!)
    const summary = await screen.findByRole('group')
    await vi.waitFor(() => expect(document.activeElement).toBe(summary))
    expect(get(second.visibleErrors)).toHaveLength(1)

    rendered.unmount()
    expect(firstDestroy).toHaveBeenCalledTimes(1)
    expect(secondDestroy).toHaveBeenCalledTimes(1)
  })

  it('keeps mixed and object enum values distinct and restores a read-only select', async () => {
    const { form } = await renderForm(
      {
        type: 'object',
        properties: {
          choice: {
            type: 'string',
            title: 'Choice',
            enum: [1, '1', { code: 'one' }, { code: 'two' }],
            readOnly: true,
          },
        },
      },
      { choice: { code: 'two' } },
    )

    const select = screen.getByRole('combobox', { name: 'Choice' }) as HTMLSelectElement
    expect(select.value).toBe('3')
    expect(select.getAttribute('aria-readonly')).toBe('true')

    await fireEvent.change(select, { target: { value: '0' } })

    expect(get(form.data)).toEqual({ choice: { code: 'two' } })
    expect(select.value).toBe('3')
  })

  it('keeps keyed array rows attached to their stable item ids after a move', async () => {
    const { form } = await renderForm(
      {
        type: 'object',
        properties: {
          people: {
            type: 'array',
            title: 'People',
            items: {
              type: 'object',
              properties: { name: { type: 'string', title: 'Name' } },
            },
          },
        },
      },
      { people: [{ name: 'Ada' }, { name: 'Grace' }] },
      { '/people': { canReorder: true } },
    )

    const rows = [...document.querySelectorAll<HTMLElement>('[data-array-row]')]
    const firstInput = rows[0]?.querySelector('input')
    const secondInput = rows[1]?.querySelector('input')
    expect(firstInput).not.toBeNull()
    expect(secondInput).not.toBeNull()

    const moveDown = rows[0]?.querySelector<HTMLButtonElement>('[data-reorder-direction="down"]')
    expect(moveDown).not.toBeNull()
    await fireEvent.click(moveDown!)

    expect(get(form.data)).toEqual({ people: [{ name: 'Grace' }, { name: 'Ada' }] })
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

    expect(get(form.data)).toEqual({ people: ['Grace', 'Ada', 'Lin'] })
  })
})

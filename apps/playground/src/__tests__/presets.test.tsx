import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { createFormRuntime } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { App } from '../App.js'
import { applyPreset } from '../workbench/presets.js'
import { editSchema, readSchemaText } from './schema-text.js'

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
})
afterEach(cleanup)

async function open(title: string): Promise<void> {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: title }))
}

function presetSelect(): HTMLSelectElement {
  return screen.getByLabelText('Data preset') as HTMLSelectElement
}

describe('data presets', () => {
  it('apply in place and show the errors of an invalid preset', async () => {
    await open('String constraints')
    fireEvent.change(await screen.findByLabelText('Data preset'), { target: { value: 'too-short' } })
    const username = (await screen.findByLabelText('Username')) as HTMLInputElement
    await waitFor(() => expect(username.value).toBe('ab'))
    await waitFor(() => expect(username.getAttribute('aria-invalid')).toBe('true'))
    fireEvent.change(presetSelect(), { target: { value: 'valid' } })
    await waitFor(() => expect(username.value).toBe('grace'))
    expect(username.getAttribute('aria-invalid')).not.toBe('true')
  })

  it('validates presets with no hints and with change, blur and submit hints', async () => {
    await open('Validation triggers')
    fireEvent.change(await screen.findByLabelText('Data preset'), { target: { value: 'too-short' } })
    await waitFor(() => {
      expect(screen.getByLabelText('Validated on change').getAttribute('aria-invalid')).toBe('true')
      expect(screen.getByLabelText('Validated on blur').getAttribute('aria-invalid')).toBe('true')
      expect(screen.getByLabelText('Validated on submit').getAttribute('aria-invalid')).toBe('true')
    })
  })

  it('resets to an empty object when initial data is undefined', async () => {
    const port = await createJsonSchemaAdapter({ type: 'object' })
    const runtime = createFormRuntime(port, { initialData: undefined })
    runtime.dispatch({ type: 'Reset', data: { populated: true } })
    applyPreset(runtime, undefined, false)
    expect(runtime.data.getSnapshot()).toEqual({})
    runtime.destroy()
  })

  it('selects Custom after the user edits', async () => {
    await open('String constraints')
    fireEvent.change(await screen.findByLabelText('Data preset'), { target: { value: 'valid' } })
    fireEvent.change(await screen.findByLabelText('Username'), { target: { value: 'linus' } })
    await waitFor(() => expect(presetSelect().value).toBe('custom'))
  })

  it('stays available while the editor holds invalid JSON', async () => {
    await open('String constraints')
    await screen.findByLabelText('Data preset')
    editSchema('{')
    fireEvent.change(presetSelect(), { target: { value: 'too-short' } })
    await waitFor(() => expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('ab'))
  })

  it('is withdrawn once an edited schema applies', async () => {
    await open('String constraints')
    await screen.findByLabelText('Data preset')
    const schema = JSON.parse(readSchemaText()) as Record<string, unknown>
    schema.title = 'Edited'
    editSchema(JSON.stringify(schema, null, 2))
    await waitFor(() => expect(screen.queryByLabelText('Data preset')).toBeNull(), { timeout: 3000 })
  })

  it('restores the matching preset label when the example schema returns', async () => {
    await open('String constraints')
    const initialSchema = readSchemaText()
    fireEvent.change(await screen.findByLabelText('Data preset'), { target: { value: 'too-short' } })
    await waitFor(() => expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('ab'))

    const editedSchema = JSON.parse(initialSchema) as Record<string, unknown>
    editedSchema.title = 'Edited'
    editSchema(JSON.stringify(editedSchema, null, 2))
    await waitFor(() => expect(screen.queryByLabelText('Data preset')).toBeNull(), { timeout: 3000 })

    editSchema(initialSchema)
    await waitFor(() => expect(presetSelect().value).toBe('too-short'), { timeout: 3000 })
    const username = (screen.getByLabelText('Username') as HTMLInputElement)
    expect(username.value).toBe('ab')
    await waitFor(() => expect(username.getAttribute('aria-invalid')).toBe('true'))
  })

  it('does not appear for an example without presets', async () => {
    await open('String field')
    await screen.findByLabelText('Name')
    expect(screen.queryByLabelText('Data preset')).toBeNull()
  })
})

describe('width presets', () => {
  it('applies the selected maximum, reports effective width and remembers the choice', async () => {
    await open('String field')
    fireEvent.click(screen.getByRole('button', { name: 'Phone' }))
    expect(document.querySelector<HTMLElement>('[data-pane-host="preview"]')!.style.maxWidth).toBe('375px')
    expect(screen.getByText('Maximum 375px')).toBeTruthy()
    cleanup()
    await open('String field')
    expect(screen.getByRole('button', { name: 'Phone', pressed: true })).toBeTruthy()
  })
})

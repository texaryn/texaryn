import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '../App.js'
import { resetMediaQueries, setMediaQuery } from '../test-setup.js'
import { NARROW_QUERY } from '../workbench/use-narrow-viewport.js'

const MOUNT = import.meta.env.BASE_URL

function setPath(path: string): void {
  window.history.replaceState(null, '', path)
}

beforeEach(() => setPath(MOUNT))
afterEach(() => {
  cleanup()
  resetMediaQueries()
  setPath(MOUNT)
})

async function openStringExample(): Promise<void> {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
  await screen.findByLabelText('Name')
}

describe('schema editor lifecycle', () => {
  it('keeps form data while applying a changed schema', async () => {
    await openStringExample()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Grace' } })

    const editor = screen.getByLabelText(/^JSON Schema/) as HTMLTextAreaElement
    fireEvent.change(editor, {
      target: {
        value: JSON.stringify(
          {
            type: 'object',
            properties: {
              name: { type: 'string', title: 'Name' },
              note: { type: 'string', title: 'Note' },
            },
          },
          null,
          2,
        ),
      },
    })

    const note = (await screen.findByLabelText('Note', {}, { timeout: 3000 })) as HTMLInputElement
    expect(note).toBeTruthy()
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Grace')
  })

  it('keeps the last valid form and inspector visible for invalid JSON', async () => {
    await openStringExample()
    const editor = screen.getByLabelText(/^JSON Schema/) as HTMLTextAreaElement
    fireEvent.change(editor, { target: { value: '{\n  "type": ' } })

    expect((await screen.findByRole('status')).textContent).toMatch(/last valid schema/i)
    expect(screen.getByLabelText('Name')).toBeTruthy()
    expect(screen.getByRole('tablist', { name: 'Inspector' })).toBeTruthy()
    expect(screen.getAllByText(/invalid json/i).length).toBeGreaterThan(0)
  })

  it('resets current data to the selected example defaults', async () => {
    await openStringExample()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Grace' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reset data' }))

    await waitFor(() => {
      expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('')
    })
  })

  it('provides a compact mobile panel selector and starts on the preview', async () => {
    setMediaQuery(NARROW_QUERY, true)
    render(<App />)
    const columns = document.querySelector('.pg-columns') as HTMLElement
    expect(columns.dataset.mobilePanel).toBe('preview')

    fireEvent.click(screen.getByRole('button', { name: /^Inspector$/ }))
    expect(columns.dataset.mobilePanel).toBe('inspector')

    fireEvent.click(screen.getByRole('button', { name: /^Schema$/ }))
    expect(columns.dataset.mobilePanel).toBe('schema')
    expect(screen.getByLabelText(/^JSON Schema/)).toBeTruthy()
  })
})

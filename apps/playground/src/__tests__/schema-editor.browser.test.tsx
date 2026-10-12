import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { page, userEvent } from '@vitest/browser/context'
import { App } from '../App.js'

const MOUNT = import.meta.env.BASE_URL

function setPath(path: string): void {
  window.history.replaceState(null, '', path)
}

beforeEach(async () => {
  window.localStorage.clear()
  await page.viewport(1512, 900)
  setPath(MOUNT)
})
afterEach(() => {
  cleanup()
  setPath(MOUNT)
})

async function openStringExample(): Promise<void> {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
  await screen.findByLabelText('Name')
}

async function codeEditor(): Promise<HTMLElement> {
  return waitFor(() => {
    const editor = screen.getByRole('textbox', { name: 'JSON Schema' })
    expect(editor.classList.contains('cm-content')).toBe(true)
    return editor
  })
}

describe('schema editor lifecycle', () => {
  it('keeps form data while applying a changed schema', async () => {
    await openStringExample()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Grace' } })

    const editor = await codeEditor()
    await userEvent.fill(
      editor,
      JSON.stringify(
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
    )

    const note = (await screen.findByLabelText('Note', {}, { timeout: 3000 })) as HTMLInputElement
    expect(note).toBeTruthy()
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Grace')
  })

  it('keeps the last valid form and inspector visible for invalid JSON', async () => {
    await openStringExample()
    const editor = await codeEditor()
    await userEvent.fill(editor, '{\n  "type": ')

    await waitFor(() =>
      expect(screen.getAllByRole('status').map((node) => node.textContent).join(' ')).toMatch(/last valid schema/i),
    )
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

  it('keeps the selected example when CodeMirror receives its schema', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
    await codeEditor()

    fireEvent.click(await screen.findByRole('button', { name: 'Boolean field' }))

    expect(await screen.findByLabelText('Subscribe to the newsletter')).toBeTruthy()
    await waitFor(() => {
      expect(window.location.pathname).toBe(`${MOUNT}basics-boolean`)
      expect(window.location.hash).toBe('')
    })
  })

  it('restores browser history without turning a route into a custom schema', async () => {
    await openStringExample()
    await codeEditor()
    window.history.replaceState(null, '', `${MOUNT}basics-boolean`)
    fireEvent.popState(window)

    expect(await screen.findByLabelText('Subscribe to the newsletter')).toBeTruthy()
    await waitFor(() => {
      expect(window.location.pathname).toBe(`${MOUNT}basics-boolean`)
      expect(window.location.hash).toBe('')
    })
  })

  it('provides a compact mobile panel selector and starts on the preview', async () => {
    await page.viewport(390, 844)
    render(<App />)
    const columns = document.querySelector('.pg-columns') as HTMLElement
    expect(columns.dataset.mobilePanel).toBe('preview')

    fireEvent.click(screen.getByRole('button', { name: /^Inspector$/ }))
    expect(columns.dataset.mobilePanel).toBe('inspector')

    fireEvent.click(screen.getByRole('button', { name: /^Schema$/ }))
    expect(columns.dataset.mobilePanel).toBe('schema')
    expect(await codeEditor()).toBeTruthy()
  })

  it('restores an edited schema from its shared URL after a reload', async () => {
    await page.viewport(1512, 900)
    await openStringExample()
    const editor = await codeEditor()
    await userEvent.fill(editor, JSON.stringify({
      type: 'object',
      properties: { nickname: { type: 'string', title: 'Nickname' } },
    }, null, 2))

    await screen.findByLabelText('Nickname')
    await waitFor(() => expect(window.location.hash).toMatch(/^#schema=/))
    const sharedUrl = window.location.href

    cleanup()
    window.history.replaceState(null, '', sharedUrl)
    render(<App />)

    expect(await screen.findByLabelText('Nickname')).toBeTruthy()
    expect(await codeEditor()).toBeTruthy()
  })
})

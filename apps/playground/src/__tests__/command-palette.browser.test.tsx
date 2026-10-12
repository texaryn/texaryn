import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { page, userEvent } from '@vitest/browser/context'
import { App } from '../App.js'

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
})
afterEach(cleanup)

describe('the command palette in Chromium', () => {
  it('restores CodeMirror focus after a command and Escape', async () => {
    await page.viewport(1512, 900)
    render(<App />)
    await screen.findByLabelText('Name')
    await waitFor(() => expect(document.querySelector('.cm-editor .cm-content')).toBeTruthy())
    const editor = document.querySelector<HTMLElement>('.cm-editor .cm-content')!
    editor.focus()
    await waitFor(() => expect(document.activeElement).toBe(editor))

    await userEvent.keyboard('{Control>}k{/Control}')
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' })
    const input = dialog.querySelector('input')!
    await userEvent.type(input, 'Theme: dark')
    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(editor))
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))

    await userEvent.keyboard('{Control>}k{/Control}')
    const reopened = await screen.findByRole('dialog', { name: 'Command palette' })
    expect(reopened).toBeTruthy()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(editor))

    await userEvent.keyboard('{Meta>}k{/Meta}')
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeTruthy()
  })

  it('opens from the phone button and announces clipboard feedback outside hidden panes', async () => {
    await page.viewport(390, 844)
    render(<App />)
    await screen.findByLabelText('Name')
    await userEvent.click(screen.getByRole('button', { name: 'Open command palette' }))
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' })
    const input = dialog.querySelector('input')!
    await userEvent.type(input, 'Copy schema')
    await userEvent.keyboard('{Enter}')

    const status = await screen.findByRole('status', { name: 'Clipboard status' })
    await waitFor(() => expect(status.textContent).not.toBe(''))
    expect(status.closest('[data-pane]')).toBeNull()
  })
})

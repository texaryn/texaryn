import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { App } from '../App.js'
import { resetMediaQueries, setMediaQuery } from '../test-setup.js'
import { NARROW_QUERY } from '../workbench/use-narrow-viewport.js'

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
})
afterEach(() => {
  cleanup()
  resetMediaQueries()
  vi.restoreAllMocks()
})

async function openPalette(): Promise<HTMLElement> {
  render(<App />)
  await screen.findByLabelText('Name')
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
  return screen.findByRole('dialog', { name: 'Command palette' })
}

function paletteInput(dialog: HTMLElement): HTMLInputElement {
  return dialog.querySelector('input')!
}

describe('the command palette', () => {
  it('opens on Ctrl K and switches to the selected renderer command', async () => {
    const dialog = await openPalette()
    fireEvent.change(paletteInput(dialog), { target: { value: 'bootst' } })
    fireEvent.click(await screen.findByRole('option', { name: 'Switch to React · Bootstrap 5' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull())
    expect((screen.getByLabelText(/renderer/i) as HTMLSelectElement).value).toBe('bootstrap')
  })

  it('opens on Cmd K too, and closes on Escape', async () => {
    render(<App />)
    await screen.findByLabelText('Name')
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull())
  })

  it('formats an unchanged example without switching it to Custom', async () => {
    render(<App />)
    await screen.findByLabelText('Name')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' })
    fireEvent.change(paletteInput(dialog), { target: { value: 'Format schema' } })
    fireEvent.keyDown(paletteInput(dialog), { key: 'Enter' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull())
    expect(screen.getByRole('button', { name: 'String field' }).getAttribute('aria-current')).toBe('true')
  })

  it('reports clipboard failure in the app-shell live region', async () => {
    const dialog = await openPalette()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error('denied')) },
    })
    fireEvent.change(paletteInput(dialog), { target: { value: 'Copy schema' } })
    fireEvent.keyDown(paletteInput(dialog), { key: 'Enter' })
    const status = await screen.findByRole('status', { name: 'Clipboard status' })
    await waitFor(() => expect(status.textContent).toMatch(/copy failed/i))
    expect(status.closest('[data-pane]')).toBeNull()
  })

  it('applies a data preset through the workspace', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String constraints' }))
    await screen.findByLabelText('Username')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const dialog = await screen.findByRole('dialog', { name: 'Command palette' })
    fireEvent.change(paletteInput(dialog), { target: { value: 'Too short' } })
    fireEvent.keyDown(paletteInput(dialog), { key: 'Enter' })
    await waitFor(() => expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('ab'))
    expect((screen.getByLabelText('Data preset') as HTMLSelectElement).value).toBe('too-short')
  })

  it('opens from a Commands button on a phone', async () => {
    setMediaQuery(NARROW_QUERY, true)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Open command palette' }))
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeTruthy()
  })
})

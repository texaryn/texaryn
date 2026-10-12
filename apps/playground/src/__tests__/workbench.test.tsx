import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { App } from '../App.js'
import { LAYOUT_STORAGE_KEY, PANEL_STORAGE_PREFIX } from '../workbench/layout.js'

beforeEach(() => window.localStorage.clear())
afterEach(cleanup)

function panelKeys(): string[] {
  const keys: string[] = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key?.startsWith(PANEL_STORAGE_PREFIX)) keys.push(key)
  }
  return keys
}

function host(id: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-pane-host="${id}"]`)
  if (!element) throw new Error(`no host ${id}`)
  return element
}

function inOverlay(id: string): boolean {
  return host(id).closest('.pg-overlay') !== null
}

function panels(): HTMLElement {
  return document.querySelector<HTMLElement>('.pg-workbench__panels')!
}

async function openWithData(): Promise<HTMLInputElement> {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
  const name = (await screen.findByLabelText('Name')) as HTMLInputElement
  fireEvent.change(name, { target: { value: 'Ada' } })
  return name
}

describe('the desktop workbench', () => {
  it('maximizes the preview in an overlay and restores it without remounting the form', async () => {
    const name = await openWithData()
    fireEvent.click(screen.getByRole('button', { name: 'Maximize preview' }))
    expect(inOverlay('preview')).toBe(true)
    expect(panels().hasAttribute('inert')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Restore preview' }))
    expect(inOverlay('preview')).toBe(false)
    expect(panels().hasAttribute('inert')).toBe(false)
    expect(screen.getByLabelText('Name')).toBe(name)
    expect(name.value).toBe('Ada')
  })

  it('shows schema and preview in Focus and leaves the rest inert underneath', async () => {
    await openWithData()
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }))
    expect(inOverlay('schema')).toBe(true)
    expect(inOverlay('preview')).toBe(true)
    expect(inOverlay('inspector')).toBe(false)
    expect(panels().hasAttribute('inert')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Exit Focus' }))
    expect(inOverlay('schema')).toBe(false)
  })

  it('makes a collapsed inspector body unreachable', async () => {
    await openWithData()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse inspector' }))
    expect(host('inspector').closest('[inert]')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Expand inspector' })).toBeTruthy()
  })

  it('collapses the example list to a rail and expands it again', async () => {
    await openWithData()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse examples' }))
    expect(host('examples').closest('[inert]')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Expand examples' }))
    expect(host('examples').closest('[inert]')).toBeNull()
  })

  it('names every separator', async () => {
    await openWithData()
    for (const name of [
      'Resize examples and workspace',
      'Resize schema and preview',
      'Resize workspace and inspector',
    ]) {
      expect(screen.getByRole('separator', { name })).toBeTruthy()
    }
  })

  it('stores no panel size for a maximize or Focus', async () => {
    await openWithData()
    fireEvent.click(screen.getByRole('button', { name: 'Maximize schema' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore schema' }))
    fireEvent.click(screen.getByRole('button', { name: 'Focus' }))
    fireEvent.click(screen.getByRole('button', { name: 'Exit Focus' }))
    expect(panelKeys()).toEqual([])
  })

  it('moves focus into an overlay and back to the button that opened it', async () => {
    await openWithData()
    const maximize = screen.getByRole('button', { name: 'Maximize preview' })
    maximize.focus()
    fireEvent.click(maximize)
    const restore = screen.getByRole('button', { name: 'Restore preview' })
    expect(document.activeElement).toBe(restore)
    fireEvent.click(restore)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Maximize preview' }))

    const focus = screen.getByRole('button', { name: 'Focus' })
    focus.focus()
    fireEvent.click(focus)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Exit Focus' }))
    fireEvent.click(screen.getByRole('button', { name: 'Exit Focus' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Focus' }))
  })

  it('returns focus to the control behind the latest overlay change', async () => {
    await openWithData()
    const maximize = screen.getByRole('button', { name: 'Maximize preview' })
    maximize.focus()
    fireEvent.click(maximize)
    const focus = screen.getByRole('button', { name: 'Focus' })
    focus.focus()
    fireEvent.click(focus)
    fireEvent.click(screen.getByRole('button', { name: 'Exit Focus' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Focus' }))

    screen.getByRole('button', { name: 'Maximize preview' }).focus()
    fireEvent.click(screen.getByRole('button', { name: 'Maximize preview' }))
    const reset = screen.getByRole('button', { name: 'Reset layout' })
    reset.focus()
    fireEvent.click(reset)
    expect(document.activeElement).toBe(reset)
  })

  it('restores focus to the pane button when the overlay was already open at mount', async () => {
    window.localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ version: 1, inspectorCollapsed: false, examplesCollapsed: false, maximized: 'preview', focus: false, previewWidth: 'fit' }),
    )
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Restore preview' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Maximize preview' }))
  })

  it('restores focus to the Focus button when Focus was already open at mount', async () => {
    window.localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ version: 1, inspectorCollapsed: false, examplesCollapsed: false, maximized: null, focus: true, previewWidth: 'fit' }),
    )
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Exit Focus' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Focus' }))
  })

  it('remembers a collapsed inspector across a reload and forgets it on Reset layout', async () => {
    await openWithData()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse inspector' }))
    cleanup()
    await openWithData()
    expect(screen.getByRole('button', { name: 'Expand inspector' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reset layout' }))
    expect(screen.getByRole('button', { name: 'Collapse inspector' })).toBeTruthy()
  })
})

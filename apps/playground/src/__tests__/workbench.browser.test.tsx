import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { page, userEvent } from '@vitest/browser/context'
import { THEME_STORAGE_KEY } from '../../../../theme.config.mjs'
import { App } from '../App.js'
import { PANEL_STORAGE_PREFIX } from '../workbench/layout.js'
import { editSchema, readSchemaText } from './schema-text.js'

const SIZES = [
  [1512, 900],
  [1024, 768],
  [820, 800],
  [819, 800],
  [390, 844],
] as const

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function paneWidth(id: string): number {
  return document.querySelector(`[data-pane="${id}"]`)!.getBoundingClientRect().width
}

function panelKeys(): string[] {
  const keys: string[] = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key?.startsWith(PANEL_STORAGE_PREFIX)) keys.push(key)
  }
  return keys
}

const SAVE_DEBOUNCE_MS = 100

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, SAVE_DEBOUNCE_MS * 2.5))
}

function savedSizes(): Record<string, string | null> {
  return Object.fromEntries(panelKeys().map((key) => [key, window.localStorage.getItem(key)]))
}

async function toPhoneAndBack(): Promise<void> {
  await page.viewport(390, 844)
  await waitFor(() => {
    expect(document.querySelector('.pg-workbench')).toBeNull()
    expect(document.querySelector('.pg-columns [data-pane-host="preview"]')).not.toBeNull()
  })
  await page.viewport(1512, 900)
  await waitFor(() => expect(document.querySelector('.pg-workbench [data-pane-host="preview"]')).not.toBeNull())
}

describe.each(['light', 'dark'] as const)('the playground in %s', (theme) => {
  for (const [width, height] of SIZES) {
    it(`fits ${width}x${height} without horizontal scrolling`, async () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
      await page.viewport(width, height)
      render(<App />)
      await screen.findByLabelText('Name')
      await waitFor(() => expect(document.documentElement.dataset.theme).toBe(theme))
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
      if (width >= 820) {
        expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(window.innerHeight)
        expect(paneWidth('schema')).toBeGreaterThanOrEqual(280)
        expect(paneWidth('preview')).toBeGreaterThanOrEqual(320)
      } else {
        expect(screen.getByRole('group', { name: 'Playground panels' })).toBeTruthy()
      }
    })
  }
})

describe('the desktop workbench in Chromium', () => {
  it('gives every separator its 4px thickness', async () => {
    await page.viewport(1512, 900)
    render(<App />)
    await screen.findByLabelText('Name')
    const separators = screen.getAllByRole('separator')
    expect(separators).toHaveLength(3)
    for (const separator of separators) {
      const box = separator.getBoundingClientRect()
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(4)
    }
  })

  it('opens with default sizes when saved panel sizes are malformed', async () => {
    await page.viewport(1512, 900)
    render(<App />)
    await screen.findByLabelText('Name')
    const defaultWidth = paneWidth('schema')
    screen.getByRole('separator', { name: 'Resize schema and preview' }).focus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
    await waitFor(() => expect(panelKeys().length).toBeGreaterThan(0))
    await settle()

    for (const [index, key] of panelKeys().entries()) {
      window.localStorage.setItem(key, ['{broken', 'null', '{"schema":"wide"}'][index % 3])
    }
    cleanup()
    render(<App />)
    await screen.findByLabelText('Name')
    expect(screen.getAllByRole('separator')).toHaveLength(3)
    expect(paneWidth('schema')).toBeCloseTo(defaultWidth, 0)
  })

  it('resizes from the keyboard, saves that size, and restores it exactly after Maximize', async () => {
    await page.viewport(1512, 900)
    render(<App />)
    await screen.findByLabelText('Name')
    const before = paneWidth('schema')
    screen.getByRole('separator', { name: 'Resize schema and preview' }).focus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}')
    const schema = paneWidth('schema')
    const preview = paneWidth('preview')
    expect(schema).toBeGreaterThan(before + 10)
    await waitFor(() => expect(panelKeys().length).toBeGreaterThan(0))

    fireEvent.click(screen.getByRole('button', { name: 'Maximize preview' }))
    expect(document.querySelector('.pg-overlay')!.getBoundingClientRect().width).toBeGreaterThan(1000)
    fireEvent.click(screen.getByRole('button', { name: 'Restore preview' }))
    expect(paneWidth('schema')).toBeCloseTo(schema, 0)
    expect(paneWidth('preview')).toBeCloseTo(preview, 0)

    cleanup()
    render(<App />)
    await screen.findByLabelText('Name')
    expect(paneWidth('schema')).toBeCloseTo(schema, 0)
  })

  it('keeps typed data across the breakpoint in both directions', async () => {
    await page.viewport(1512, 900)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
    const name = (await screen.findByLabelText('Name')) as HTMLInputElement
    await userEvent.fill(name, 'Ada')
    await toPhoneAndBack()
    expect(screen.getByLabelText('Name')).toBe(name)
    expect(name.value).toBe('Ada')
  })

  for (const renderer of ['default', 'bootstrap'] as const) {
    it(`submits once with ${renderer} from the Maximize overlay and after a breakpoint crossing`, async () => {
      const log = vi.spyOn(console, 'log').mockImplementation(() => {})
      await page.viewport(1512, 900)
      render(<App />)
      fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
      fireEvent.change(screen.getByLabelText(/renderer/i), { target: { value: renderer } })
      await screen.findByRole('region', { name: renderer === 'default' ? 'Rendered by React · Default' : 'Rendered by React · Bootstrap 5' })
      if (renderer === 'bootstrap') {
        // Submit does nothing until the Bootstrap form ref is set, so wait for the form.
        await waitFor(() =>
          expect(document.querySelector('.pg-bootstrap-shadow-host')?.shadowRoot?.querySelector('form')).toBeTruthy(),
        )
      }

      fireEvent.click(screen.getByRole('button', { name: 'Maximize preview' }))
      fireEvent.click(screen.getByRole('button', { name: /^Submit$/ }))
      await screen.findByText('Submitted successfully.', {}, { timeout: 3000 })
      expect(log.mock.calls.filter(([first]) => first === 'Submitted:')).toHaveLength(1)
      fireEvent.click(screen.getByRole('button', { name: 'Restore preview' }))

      await toPhoneAndBack()
      fireEvent.click(screen.getByRole('button', { name: /^Submit$/ }))
      await waitFor(() => expect(log.mock.calls.filter(([first]) => first === 'Submitted:')).toHaveLength(2), {
        timeout: 3000,
      })
    })
  }

  it('collapses the example list when its separator passes the minimum and shows the rail', async () => {
    await page.viewport(1512, 900)
    render(<App />)
    await screen.findByLabelText('Name')
    expect(screen.queryByRole('button', { name: 'Expand examples' })).toBeNull()
    screen.getByRole('separator', { name: 'Resize examples and workspace' }).focus()
    await userEvent.keyboard('{ArrowLeft>10/}')
    await screen.findByRole('button', { name: 'Expand examples' })
    expect(document.querySelector('[data-pane="examples"]')!.hasAttribute('inert')).toBe(true)
    expect(paneWidth('examples')).toBeLessThan(1)
  })

  it('moves keyboard focus between the collapse and expand controls of the example list', async () => {
    await page.viewport(1512, 900)
    render(<App />)
    await screen.findByLabelText('Name')
    screen.getByRole('button', { name: 'Collapse examples' }).focus()
    await userEvent.keyboard('{Enter}')
    const expand = await screen.findByRole('button', { name: 'Expand examples' })
    await settle()
    expect(document.activeElement).toBe(expand)

    await userEvent.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Expand examples' })).toBeNull())
    await settle()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Collapse examples' }))
  })

  it('keeps the inspector collapsed after a reload', async () => {
    await page.viewport(1512, 900)
    render(<App />)
    await screen.findByLabelText('Name')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse inspector' }))
    await screen.findByRole('button', { name: 'Expand inspector' })

    cleanup()
    render(<App />)
    await screen.findByLabelText('Name')
    await settle()
    expect(screen.getByRole('button', { name: 'Expand inspector' })).toBeTruthy()
    expect(document.querySelector('[data-pane-host="inspector"]')!.closest('.pg-pane__body')!.hasAttribute('inert')).toBe(true)
    const panel = document.querySelector('[data-pane="inspector"]')!.closest('[data-panel]')!
    expect(Math.abs(panel.getBoundingClientRect().height - 32)).toBeLessThanOrEqual(1)
    expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(window.innerHeight)
  })

  it('leaves saved sizes and rendered widths unchanged across Maximize and Restore with the examples collapsed', async () => {
    await page.viewport(1512, 900)
    render(<App />)
    await screen.findByLabelText('Name')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse examples' }))
    await screen.findByRole('button', { name: 'Expand examples' })
    screen.getByRole('separator', { name: 'Resize schema and preview' }).focus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    await waitFor(() => expect(panelKeys().length).toBeGreaterThan(0))
    await settle()
    const sizes = savedSizes()
    const schema = paneWidth('schema')
    const preview = paneWidth('preview')

    fireEvent.click(screen.getByRole('button', { name: 'Maximize preview' }))
    fireEvent.click(screen.getByRole('button', { name: 'Restore preview' }))
    await waitFor(() => expect(Math.abs(paneWidth('schema') - schema)).toBeLessThanOrEqual(1))
    expect(Math.abs(paneWidth('preview') - preview)).toBeLessThanOrEqual(1)
    await settle()
    expect(savedSizes()).toEqual(sizes)
    expect(Math.abs(paneWidth('schema') - schema)).toBeLessThanOrEqual(1)
  })
})

const MOD = navigator.platform.includes('Mac') ? 'Meta' : 'Control'

describe('the schema editor in Chromium', () => {
  it('draws an underline under an invalid keyword value', async () => {
    await page.viewport(1512, 900)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
    await waitFor(() => expect(document.querySelector('.cm-editor')).toBeTruthy())
    editSchema(readSchemaText().replace('"type": "string"', '"type": "strin"'))
    await waitFor(() => expect(document.querySelector('.cm-lintRange-error')?.textContent).toBe('"strin"'), {
      timeout: 3000,
    })
  })

  it('takes real typing, undoes it, and lets Tab leave', async () => {
    await page.viewport(1512, 900)
    render(<App />)
    await waitFor(() => expect(document.querySelector('.cm-content')).toBeTruthy())
    const content = document.querySelector<HTMLElement>('.cm-content')!
    await userEvent.click(content)
    await userEvent.keyboard('{End} ')
    const typed = readSchemaText()
    await userEvent.keyboard(`{${MOD}>}z{/${MOD}}`)
    expect(readSchemaText()).not.toBe(typed)
    await userEvent.keyboard('{Tab}')
    expect(document.activeElement?.closest('.cm-editor')).toBeNull()
  })

  it('keeps the same editor, its undo history and its click positions across the breakpoint', async () => {
    await page.viewport(1512, 900)
    render(<App />)
    await waitFor(() => expect(document.querySelector('.cm-content')).toBeTruthy())
    const editor = document.querySelector('.cm-editor')
    const before = readSchemaText()
    await userEvent.click(document.querySelector<HTMLElement>('.cm-content')!)
    await userEvent.keyboard('{End} ')
    await toPhoneAndBack()
    expect(document.querySelector('.cm-editor')).toBe(editor)
    await userEvent.click(document.querySelectorAll<HTMLElement>('.cm-line')[2]!)
    await waitFor(() =>
      expect(screen.getByRole('contentinfo', { name: 'Status' }).textContent).toContain('Ln 3,'),
    )
    await userEvent.keyboard(`{${MOD}>}z{/${MOD}}`)
    expect(readSchemaText()).toBe(before)
  })
})

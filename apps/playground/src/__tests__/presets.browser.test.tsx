import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { page, userEvent } from '@vitest/browser/context'
import { App } from '../App.js'
import { findRendererInput } from './renderer-test-utils.js'

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
})
afterEach(cleanup)

describe('preview width presets in Chromium', () => {
  it('reports the rendered width as the pane and viewport change', async () => {
    await page.viewport(820, 800)
    render(<App />)
    await screen.findByLabelText('Name')
    screen.getByRole('button', { name: 'Tablet' }).click()

    const host = document.querySelector<HTMLElement>('.pg-workbench [data-pane-host="preview"]')!
    await waitFor(() => expect(screen.getByText('Maximum 768px')).toBeTruthy())
    await waitFor(() => {
      const effective = Math.round(host.getBoundingClientRect().width)
      expect(effective).toBeGreaterThan(0)
      expect(effective).toBeLessThan(768)
      expect(screen.getByText(`Effective ${effective}px`)).toBeTruthy()
    })

    await page.viewport(2048, 1080)
    await waitFor(() => expect(host.getBoundingClientRect().width).toBeCloseTo(768, 0))
    await waitFor(() => expect(screen.getByText('Effective 768px')).toBeTruthy())

    screen.getByRole('separator', { name: 'Resize schema and preview' }).focus()
    await userEvent.keyboard('{ArrowRight}'.repeat(30))
    await waitFor(() => {
      const effective = Math.round(host.getBoundingClientRect().width)
      expect(effective).toBeLessThan(768)
      expect(screen.getByText(`Effective ${effective}px`)).toBeTruthy()
    })
  })
})

describe('invalid preset feedback across renderers in Chromium', () => {
  it('marks the invalid field in every renderer', async () => {
    await page.viewport(1512, 900)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String constraints' }))
    fireEvent.change(await screen.findByLabelText('Data preset'), { target: { value: 'too-short' } })

    const renderers = [
      ['default', 'React · Default'],
      ['bootstrap', 'React · Bootstrap 5'],
      ['mui', 'React · Material UI'],
      ['emotion', 'React · Emotion styles'],
      ['tailwind', 'React · Tailwind CSS'],
      ['vue', 'Vue · Default'],
      ['svelte', 'Svelte · Default'],
      ['solid', 'Solid · Default'],
      ['wc', 'Web Components · Default'],
    ] as const
    const selector = screen.getByLabelText('Form renderer')

    for (const [key, label] of renderers) {
      fireEvent.change(selector, { target: { value: key } })
      const region = await screen.findByRole('region', { name: `Rendered by ${label}` })
      const username = await findRendererInput(region, 'Username')
      await waitFor(() => expect(username.getAttribute('aria-invalid')).toBe('true'))
    }
  }, 30_000)
})

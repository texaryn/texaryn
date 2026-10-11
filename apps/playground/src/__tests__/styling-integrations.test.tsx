import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from '../App.js'

afterEach(cleanup)

const styleSystems = [
  { key: 'emotion', label: 'React · Emotion styles' },
  { key: 'tailwind', label: 'React · Tailwind CSS' },
] as const

describe.each(styleSystems)('$label styling integration', ({ key, label }) => {
  it('scopes consumer styles around accessible widgets and preserves form state', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))

    const renderer = screen.getByLabelText(/renderer/i) as HTMLSelectElement
    fireEvent.change(renderer, { target: { value: key } })
    await waitFor(() => expect(renderer.value).toBe(key))

    const surface = await screen.findByRole('region', { name: `Rendered by ${label}` })
    const scope = surface.querySelector<HTMLElement>(`[data-style-system="${key}"]`)
    if (!scope) throw new Error(`The ${key} styles are not scoped to the renderer surface`)
    const name = within(scope).getByRole('textbox', { name: 'Name' }) as HTMLInputElement

    expect(name.id).not.toBe('')
    expect(name.labels?.[0]?.htmlFor).toBe(name.id)
    expect(scope.getAttribute('data-style-system')).toBe(key)
    expect(scope.getAttribute('data-theme')).toBe(document.documentElement.dataset.theme)

    if (key === 'tailwind') {
      expect(scope.className).toContain('[&_label]:block')
    }

    fireEvent.change(name, { target: { value: 'Ada Lovelace' } })
    expect(name.value).toBe('Ada Lovelace')

    fireEvent.change(renderer, { target: { value: 'default' } })
    await waitFor(() => expect(renderer.value).toBe('default'))
    expect(
      (await screen.findByRole('textbox', { name: 'Name' }) as HTMLInputElement).value,
    ).toBe('Ada Lovelace')
  })
})

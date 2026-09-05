// The architectural invariant the playground exists to demonstrate: the form
// runtime belongs to the selected example, and the renderer is presentation
// over it. Switching renderer must not touch live data.
//
// If this fails, the playground is showing several separate forms rather than
// one form through every renderer, which is the opposite of the claim.
//
// The surfaces come out of the selector rather than a list here, so a fifth
// one is covered by this test the day it is offered. A copied list would have
// gone on passing while saying nothing about the new surface.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { App } from '../App.js'

afterEach(() => {
  cleanup()
})

function rendererSelect(): HTMLSelectElement {
  return screen.getByLabelText(/renderer/i) as HTMLSelectElement
}

async function switchRenderer(value: string): Promise<void> {
  fireEvent.change(rendererSelect(), { target: { value } })
  await waitFor(() => {
    expect(rendererSelect().value).toBe(value)
  })
}

describe('switching renderer', () => {
  it('preserves edited form data across every renderer and back', async () => {
    render(<App />)

    // Drive a named example rather than whatever happens to be first, so the
    // test does not silently change meaning when the catalog grows.
    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))

    const name = await screen.findByLabelText('Name')
    fireEvent.change(name, { target: { value: 'Ada Lovelace' } })
    expect((name as HTMLInputElement).value).toBe('Ada Lovelace')

    // Every other surface, then back to the one it started on. Returning is
    // half the claim: a renderer that rebuilt the form would look right on the
    // way out and lose the edit on the way home.
    const initial = rendererSelect().value
    const offered = Array.from(rendererSelect().options, (option) => option.value)
    expect(offered.length).toBeGreaterThan(1)

    for (const renderer of [...offered.filter((value) => value !== initial), initial]) {
      await switchRenderer(renderer)

      const field = await screen.findByLabelText('Name')
      expect(
        (field as HTMLInputElement).value,
        `editing was lost switching to ${renderer}`,
      ).toBe('Ada Lovelace')
    }
  })
})

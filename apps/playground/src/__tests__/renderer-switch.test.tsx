// The architectural invariant the playground exists to demonstrate: the form
// runtime belongs to the selected example, and the renderer is presentation
// over it. Switching renderer must not touch live data.
//
// If this fails, the playground is showing three separate forms rather than
// one form through three renderers, which is the opposite of the claim.
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

    for (const renderer of ['bootstrap', 'mui', 'vue', 'default']) {
      await switchRenderer(renderer)

      const field = await screen.findByLabelText('Name')
      expect(
        (field as HTMLInputElement).value,
        `editing was lost switching to ${renderer}`,
      ).toBe('Ada Lovelace')
    }
  })
})

// The playground can render Vue because the package is in this repository.
// Advertising a plain "Vue" would claim something nobody can install, and the
// project's rule is that a capability the site advertises has to be real.
describe('what the renderer list claims', () => {
  it('marks Vue as preview and says the package is unpublished', async () => {
    render(<App />)

    const option = Array.from(rendererSelect().options).find((o) => o.value === 'vue')
    expect(option?.textContent).toMatch(/preview/i)

    await switchRenderer('vue')
    expect(await screen.findByText(/not published yet/i)).toBeDefined()
  })

  it('says nothing about publication for renderers that are published', async () => {
    render(<App />)
    await switchRenderer('mui')
    expect(screen.queryByText(/not published yet/i)).toBeNull()
  })
})

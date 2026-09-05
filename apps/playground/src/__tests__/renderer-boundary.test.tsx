// The playground is a React shell around a form subtree that a chosen
// renderer owns. Selecting Vue switches that subtree and nothing else, which
// is deliberate and is the architectural claim the app exists to demonstrate.
//
// A screenshot of the old layout could not tell the two apart: the shell's own
// Submit button sat inside the same undifferentiated column as the rendered
// form, so "Vue" appeared to be rendering React buttons. The boundary is now
// in the DOM, and this pins it there. Names, not test ids: the seam is only
// useful if a reader of the page can see it too.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { App } from '../App.js'

afterEach(cleanup)

const RENDERERS = [
  { key: 'default', name: 'Rendered by React · Default' },
  { key: 'bootstrap', name: 'Rendered by React · Bootstrap 5' },
  { key: 'mui', name: 'Rendered by React · Material UI' },
  { key: 'vue', name: 'Rendered by Vue · Default' },
] as const

describe('the renderer-owned region', () => {
  it('holds the form and none of the playground controls, for every renderer', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
    await screen.findByLabelText('Name')

    for (const { key, name } of RENDERERS) {
      fireEvent.change(screen.getByLabelText(/renderer/i), { target: { value: key } })
      await waitFor(() => {
        expect((screen.getByLabelText(/renderer/i) as HTMLSelectElement).value).toBe(key)
      })

      const region = await screen.findByRole('region', { name })
      await within(region).findByLabelText('Name')

      expect(
        within(region).queryByRole('button', { name: /^Submit$/ }),
        `Submit is the playground's, not ${name}'s`,
      ).toBeNull()
      expect(
        within(region).queryByLabelText(/simulate failure/i),
        `Simulate failure is the playground's, not ${name}'s`,
      ).toBeNull()
    }
  })

  // Three of the four surfaces are React and one is not. A list reading
  // "Material UI" beside "Vue" invites reading the fourth as the only one with
  // a framework, which is the confusion the boxed region exists to remove.
  it('names a framework on every option, not only on the one that is not React', () => {
    render(<App />)

    const options = within(screen.getByLabelText(/renderer/i)).getAllByRole('option')
    expect(options.length).toBeGreaterThan(1)
    for (const option of options) {
      expect(
        option.textContent,
        `"${option.textContent}" does not say which framework renders it`,
      ).toMatch(/^(React|Vue) · .+/)
    }
  })

  it('keeps the controls reachable outside the region', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
    await screen.findByLabelText('Name')

    const controls = await screen.findByRole('region', { name: 'Playground controls' })
    expect(within(controls).getByRole('button', { name: /^Submit$/ })).toBeTruthy()
    expect(within(controls).getByLabelText(/simulate failure/i)).toBeTruthy()
  })
})

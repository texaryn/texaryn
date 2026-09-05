// The playground is a React shell around a form subtree that a chosen
// renderer owns. Selecting Vue switches that subtree and nothing else, which
// is deliberate and is the architectural claim the app exists to demonstrate.
//
// A screenshot of the old layout could not tell the two apart: the shell's own
// Submit button sat inside the same undifferentiated column as the rendered
// form, so "Vue" appeared to be rendering React buttons. The boundary is now
// in the DOM, and this pins it there. Names, not test ids: the seam is only
// useful if a reader of the page can see it too.
//
// Both claims here read the surfaces out of the selector rather than listing
// them. A list would have to be edited whenever one is added, and the edit
// that gets forgotten is the one that leaves a new surface unchecked while
// every test still passes.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { App } from '../App.js'

afterEach(cleanup)

function rendererSelect(): HTMLSelectElement {
  return screen.getByLabelText(/renderer/i) as HTMLSelectElement
}

function surfaces(): { value: string; label: string }[] {
  return within(rendererSelect())
    .getAllByRole('option')
    .map((option) => ({
      value: (option as HTMLOptionElement).value,
      label: option.textContent ?? '',
    }))
}

describe('the renderer-owned region', () => {
  it('holds the form and none of the playground controls, for every surface', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
    await screen.findByLabelText('Name')

    const offered = surfaces()
    expect(offered.length).toBeGreaterThan(1)

    for (const { value, label } of offered) {
      fireEvent.change(rendererSelect(), { target: { value } })
      await waitFor(() => expect(rendererSelect().value).toBe(value))

      const region = await screen.findByRole('region', { name: `Rendered by ${label}` })
      await within(region).findByLabelText('Name')

      expect(
        within(region).queryByRole('button', { name: /^Submit$/ }),
        `Submit is the playground's, not ${label}'s`,
      ).toBeNull()
      expect(
        within(region).queryByLabelText(/simulate failure/i),
        `Simulate failure is the playground's, not ${label}'s`,
      ).toBeNull()
    }
  })

  // Three of the four surfaces are React and one is not. A list reading
  // "Material UI" beside "Vue" invites reading the fourth as the only one with
  // a framework, which is the confusion the boxed region exists to remove.
  it('names a framework on every option, not only on the one that is not React', () => {
    render(<App />)

    const offered = surfaces()
    expect(offered.length).toBeGreaterThan(1)
    for (const { label } of offered) {
      expect(label, `"${label}" does not say which framework renders it`).toMatch(
        /^(React|Vue) · .+/,
      )
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

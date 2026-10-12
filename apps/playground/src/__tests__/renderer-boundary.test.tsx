// The playground is a React shell around a form subtree that a chosen
// renderer owns. Selecting another framework switches that subtree and nothing else, which
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
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { App } from '../App.js'
import { findRendererInput } from './renderer-test-utils.js'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

function rendererSelect(): HTMLSelectElement {
  return screen.getByLabelText('Form renderer') as HTMLSelectElement
}

function surfaces(): { value: string; label: string }[] {
  return within(rendererSelect())
    .getAllByRole('option')
    .map((option) => ({
      value: (option as HTMLOptionElement).value,
      label: option.textContent ?? '',
    }))
}

function deepQuery<T extends Element>(root: ParentNode, selector: string): T[] {
  const matches = [...root.querySelectorAll<T>(selector)]
  for (const element of root.querySelectorAll<HTMLElement>('*')) {
    if (element.shadowRoot) matches.push(...deepQuery<T>(element.shadowRoot, selector))
  }
  return matches
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
      await findRendererInput(region, 'Name')

      const forms = deepQuery<HTMLFormElement>(document, '.pg-runtime-form')
      expect(forms).toHaveLength(1)
      expect((await findRendererInput(region, 'Name')).form).toBe(forms[0])
      expect(region.querySelector('form')).toBeNull()
      expect(
        within(region).queryByRole('button', { name: /^Submit$/ }),
        `Submit is the playground's, not ${label}'s`,
      ).toBeNull()
      expect(
        within(region).queryByLabelText(/simulate failure/i),
        `Simulate failure is the playground's, not ${label}'s`,
      ).toBeNull()
    }
  }, 15_000)

  // Three of the offered surfaces are React and three are hosted frameworks. A list reading
  // "Material UI" beside "Vue" invites reading the others as the only ones
  // with a framework, which is the confusion the boxed region exists to
  // remove. The list of technologies is written out rather than matched
  // loosely, because a pattern that accepted anything before the separator
  // would accept "Material UI · Default", which is the thing being guarded
  // against.
  it('names what renders every option, not only the ones that are not React', () => {
    render(<App />)

    const offered = surfaces()
    expect(offered.length).toBeGreaterThan(1)
    for (const { label } of offered) {
      expect(label, `"${label}" does not say what renders it`).toMatch(
        /^(React|Vue|Svelte|Solid|Web Components) · .+/,
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

  it('routes the Bootstrap playground button through the shadow form submit event', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
    await screen.findByLabelText('Name')
    fireEvent.change(rendererSelect(), { target: { value: 'bootstrap' } })

    const form = await waitFor(() => {
      expect(rendererSelect().value).toBe('bootstrap')
      return deepQuery<HTMLFormElement>(document, '.pg-runtime-form')[0]!
    })
    const nativeSubmit = vi.fn((event: Event) => event.preventDefault())
    form.addEventListener('submit', nativeSubmit)

    fireEvent.click(await screen.findByRole('button', { name: /^Submit$/ }))

    expect(nativeSubmit).toHaveBeenCalledTimes(1)
  }, 15_000)
})

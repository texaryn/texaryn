import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { examples } from '@texaryn/examples'
import { App } from '../App.js'

// The application mount, which differs between development, Pages and the
// test environment. Deriving it keeps these tests true wherever it is.
const MOUNT = import.meta.env.BASE_URL

function setPath(path: string, search = ''): void {
  window.history.replaceState(null, '', `${path}${search}`)
}

function at(exampleId: string): string {
  return `${MOUNT}${exampleId}`
}

beforeEach(() => {
  setPath(MOUNT)
})

afterEach(() => {
  cleanup()
  setPath(MOUNT)
})

function nav(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Examples' })
}

function search(): HTMLInputElement {
  return screen.getByLabelText(/search examples/i) as HTMLInputElement
}

describe('example browser', () => {
  it('lists every registered example exactly once', () => {
    render(<App />)
    for (const example of examples) {
      expect(
        within(nav()).getAllByRole('button', { name: example.title }),
        `${example.id} should appear once`,
      ).toHaveLength(1)
    }
  })

  it('groups examples under headings taken from their category', () => {
    render(<App />)
    const categories = new Set(examples.map((example) => example.category))
    const headings = within(nav())
      .getAllByRole('heading')
      .map((heading) => heading.textContent)

    expect(headings.length).toBe(categories.size)
  })

  it('matches search against title, description and capability id', () => {
    render(<App />)

    fireEvent.change(search(), { target: { value: 'String field' } })
    expect(within(nav()).getByRole('button', { name: 'String field' })).toBeTruthy()

    // Capability ids are searchable, which is how someone finds the example
    // for a feature whose name is not in any title.
    fireEvent.change(search(), { target: { value: 'schema.composition.oneOf' } })
    expect(within(nav()).getByRole('button', { name: 'oneOf' })).toBeTruthy()
    expect(within(nav()).queryByRole('button', { name: 'String field' })).toBeNull()

    // Description text is searchable too, and narrowing to it excludes the
    // examples that only match on title.
    fireEvent.change(search(), { target: { value: 'assistive technology' } })
    expect(within(nav()).queryByRole('button', { name: 'String field' })).toBeNull()
    expect(within(nav()).getAllByRole('button').length).toBeGreaterThan(0)
  })

  it('says so when nothing matches', () => {
    render(<App />)
    fireEvent.change(search(), { target: { value: 'zzzz-no-such-example' } })
    expect(screen.getByText(/no example matches/i)).toBeTruthy()
  })
})

describe('example selection and the URL', () => {
  it('puts the selected example in the path and loads its data', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'String enum' }))

    await waitFor(() => {
      expect(window.location.pathname).toBe(at('basics-enum-string'))
    })
    const role = await screen.findByLabelText('Role')
    expect((role as HTMLSelectElement).value).toBe('developer')
  })

  it('selects the example named by the URL on first load', async () => {
    setPath(at('basics-boolean'))
    render(<App />)

    const subscribe = await screen.findByLabelText(/subscribe to the newsletter/i)
    expect(subscribe).toBeTruthy()
    expect(
      within(nav()).getByRole('button', { name: 'Boolean field' }).getAttribute('aria-current'),
    ).toBe('true')
  })

  it('reads the renderer from the query on first load', async () => {
    setPath(at('basics-string'), '?renderer=mui')
    render(<App />)

    await waitFor(() => {
      expect((screen.getByLabelText(/renderer/i) as HTMLSelectElement).value).toBe('mui')
    })
  })

  it('writes a chosen renderer into the query', async () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText(/renderer/i), { target: { value: 'bootstrap' } })

    await waitFor(() => {
      expect(window.location.search).toBe('?renderer=bootstrap')
    })
  })

  it('falls back deterministically for an unknown example id', async () => {
    setPath(at('does-not-exist'))
    render(<App />)

    const first = examples[0]
    await waitFor(() => {
      expect(window.location.pathname).toBe(at(first.id))
    })
    expect(
      within(nav()).getByRole('button', { name: first.title }).getAttribute('aria-current'),
    ).toBe('true')
  })

  it('resets to the declared initial data when another example is selected', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
    const name = await screen.findByLabelText('Name')
    fireEvent.change(name, { target: { value: 'edited' } })
    expect((name as HTMLInputElement).value).toBe('edited')

    fireEvent.click(within(nav()).getByRole('button', { name: 'Number field' }))
    await screen.findByLabelText('Price')

    fireEvent.click(within(nav()).getByRole('button', { name: 'String field' }))
    const again = await screen.findByLabelText('Name')
    expect(
      (again as HTMLInputElement).value,
      'returning to an example starts from its declared initial data',
    ).toBe('')
  })
})

describe('scope', () => {
  it('ships no schema, IR or runtime inspector yet', () => {
    render(<App />)
    expect(screen.queryByText(/^UI Document$/i)).toBeNull()
    expect(screen.queryByText(/^Runtime state$/i)).toBeNull()
    expect(screen.queryByText(/^IR$/i)).toBeNull()
  })
})

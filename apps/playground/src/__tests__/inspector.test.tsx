import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { App } from '../App.js'
import { encodeSharedSchema } from '../routing.js'

function setPath(path: string, search = ''): void {
  window.history.replaceState(null, '', `${path}${search}`)
}

beforeEach(() => {
  window.localStorage.clear()
  setPath(import.meta.env.BASE_URL)
})
afterEach(() => {
  cleanup()
  setPath(import.meta.env.BASE_URL)
})

function tab(name: string): HTMLElement {
  return within(screen.getByRole('tablist', { name: 'Inspector' })).getByRole('tab', {
    name,
  })
}

function panel(): HTMLElement {
  return screen.getByRole('tabpanel')
}

// The adapter is async, so the inspector only exists once the form is ready.
async function openExample(title: string): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: title }))
  await waitFor(() => {
    expect(screen.getByRole('tablist', { name: 'Inspector' })).toBeTruthy()
  })
}

describe('inspector panes', () => {
  it('shows live data that follows an edit', async () => {
    render(<App />)
    await openExample('String field')

    fireEvent.click(tab('Data'))
    await waitFor(() => expect(panel().textContent).toContain('name'))

    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Ada' } })
    await waitFor(() => expect(panel().textContent).toContain('Ada'))
  })

  it('shows a custom schema restored from a shared link', async () => {
    const custom = JSON.stringify(
      { type: 'object', title: 'Edited schema', properties: { q: { type: 'string' } } },
      null,
      2,
    )
    setPath(`${import.meta.env.BASE_URL}#schema=${encodeSharedSchema(custom)}`)
    render(<App />)

    await waitFor(() => expect(screen.getByRole('tablist', { name: 'Inspector' })).toBeTruthy())
    fireEvent.click(tab('Schema'))

    await waitFor(() => expect(panel().textContent).toContain('Edited schema'))
  })

  it('shows the hints actually supplied to the runtime', async () => {
    render(<App />)
    await openExample('Widget selection')

    fireEvent.click(tab('Hints'))
    await waitFor(() => {
      expect(panel().textContent).toContain('/body')
      expect(panel().textContent).toContain('textarea')
    })
  })

  it('says an example has no hints rather than showing an empty object', async () => {
    render(<App />)
    await openExample('String field')

    fireEvent.click(tab('Hints'))
    await waitFor(() => expect(panel().textContent).toMatch(/no hints/i))
  })

  // A Map serializes to {} under JSON.stringify, so this pane is the one that
  // would silently look empty if the serializer were naive.
  it('serializes the projection map rather than an empty object', async () => {
    render(<App />)
    await openExample('Nested object')

    fireEvent.click(tab('Projection'))
    await waitFor(() => {
      expect(panel().textContent).toContain('/address/city')
      expect(panel().textContent).not.toMatch(/"nodes":\s*\{\}/)
    })
  })

  it('updates the projection when data changes', async () => {
    render(<App />)
    await openExample('if / then / else')

    fireEvent.click(tab('Projection'))
    await waitFor(() => expect(panel().textContent).toContain('/companyName'))

    // The conditional branch decides which nodes are active, so the projection
    // has to be recomputed from current data rather than cached from mount.
    const before = panel().textContent ?? ''
    const accountType = (await screen.findByLabelText(/^Account type/)) as HTMLSelectElement
    const nextValue = accountType.value === 'business' ? 'personal' : 'business'
    fireEvent.change(accountType, {
      target: { value: nextValue },
    })
    await waitFor(() => expect(accountType.value).toBe(nextValue))
    await waitFor(() => expect(panel().textContent).not.toBe(before))
  })

  it('shows the IR document with each node pointer', async () => {
    render(<App />)
    await openExample('Nested object')

    fireEvent.click(tab('IR'))
    await waitFor(() => {
      expect(panel().textContent).toContain('/address/city')
      expect(panel().textContent).toContain('rootId')
    })
  })

  it('shows submission state', async () => {
    render(<App />)
    await openExample('String field')

    fireEvent.click(tab('Runtime'))
    await waitFor(() => expect(panel().textContent).toContain('idle'))
  })
})

// Each NodeState property is its own Store. Reading a snapshot would render
// the right value once and then never move, so this is the assertion that
// proves the panes are subscribed rather than sampled.
describe('per-node runtime state is reactive', () => {
  it('reflects touched and dirty changing without any data-shape change', async () => {
    render(<App />)
    await openExample('String field')

    fireEvent.click(tab('Runtime'))
    await waitFor(() => expect(panel().textContent).toContain('/name'))

    const row = () =>
      within(panel())
        .getAllByRole('row')
        .find((candidate) => candidate.textContent?.includes('/name'))

    expect(row()?.textContent, 'starts untouched and clean').toContain('false')

    const name = await screen.findByLabelText('Name')
    fireEvent.change(name, { target: { value: 'Ada' } })
    await waitFor(() => {
      expect(row()?.textContent, 'dirty should become true after an edit').toContain('true')
    })

    fireEvent.blur(name)
    await waitFor(() => {
      const cells = within(row() as HTMLElement).getAllByRole('cell')
      // Pointer, dirty, touched, status, showErrors.
      expect(cells[2].textContent, 'touched should become true after a blur').toBe('true')
    })
  })
})

describe('validation pane', () => {
  it('shows the runtime visible errors rather than a re-run validation', async () => {
    render(<App />)
    await openExample('Error association')

    fireEvent.click(tab('Validation'))
    await waitFor(() => expect(panel().textContent).toMatch(/no visible errors/i))

    // The field is invalid from the start, so anything that re-ran validation
    // itself would print an error here immediately. visibleErrors stays empty
    // until the runtime decides the error should be shown.
    const username = await screen.findByLabelText(/^Username/)
    fireEvent.blur(username)

    await waitFor(() => {
      expect(panel().textContent).not.toMatch(/no visible errors/i)
    })
  })
})

describe('inspector and renderer switching', () => {
  it('keeps live runtime state when the renderer changes', async () => {
    render(<App />)
    await openExample('String field')

    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Ada' } })
    fireEvent.click(tab('Data'))
    await waitFor(() => expect(panel().textContent).toContain('Ada'))

    fireEvent.change(screen.getByLabelText('Form renderer'), { target: { value: 'mui' } })

    await waitFor(() => {
      expect(panel().textContent, 'inspector state survives a renderer change').toContain(
        'Ada',
      )
    })
  })
})

describe('inspector tab keyboard behavior', () => {
  it('moves selection and focus with arrow keys and links tabs to the panel', async () => {
    render(<App />)
    await openExample('String field')

    const dataTab = tab('Data')
    expect(dataTab.getAttribute('aria-controls')).toBe(panel().id)
    expect(panel().getAttribute('aria-labelledby')).toBe(dataTab.id)
    expect(dataTab.tabIndex).toBe(0)

    dataTab.focus()
    fireEvent.keyDown(dataTab, { key: 'ArrowRight' })

    const validationTab = tab('Validation')
    expect(validationTab.tabIndex).toBe(0)
    expect(document.activeElement).toBe(validationTab)

    fireEvent.keyDown(validationTab, { key: 'End' })
    const hintsTab = tab('Hints')
    expect(hintsTab.tabIndex).toBe(0)
    expect(document.activeElement).toBe(hintsTab)
  })
})

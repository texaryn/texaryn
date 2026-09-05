import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { App } from '../App.js'

function setPath(path: string, search = ''): void {
  window.history.replaceState(null, '', `${path}${search}`)
}

beforeEach(() => setPath('/'))
afterEach(() => {
  cleanup()
  setPath('/')
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
    await waitFor(() => expect(panel().textContent).toContain('"name"'))

    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Ada' } })
    await waitFor(() => expect(panel().textContent).toContain('Ada'))
  })

  it('shows the schema text, including edits to a custom schema', async () => {
    render(<App />)
    await openExample('String field')

    fireEvent.click(tab('Schema'))
    await waitFor(() => expect(panel().textContent).toContain('String field'))

    const editor = screen.getByLabelText('JSON Schema') as HTMLTextAreaElement
    const custom = JSON.stringify(
      { type: 'object', title: 'Edited schema', properties: { q: { type: 'string' } } },
      null,
      2,
    )
    fireEvent.change(editor, { target: { value: custom } })

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
    fireEvent.change(await screen.findByLabelText('Account type'), {
      target: { value: 'personal' },
    })
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
    const username = await screen.findByLabelText('Username')
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

    fireEvent.change(screen.getByLabelText(/renderer/i), { target: { value: 'mui' } })

    await waitFor(() => {
      expect(panel().textContent, 'inspector state survives a renderer change').toContain(
        'Ada',
      )
    })
  })
})

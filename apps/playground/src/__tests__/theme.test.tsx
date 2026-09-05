// Behaviour, not appearance. What matters is which authority decides the mode
// and what each renderer is handed, so these drive the preference and the
// system answer and read back the document attribute, the Bootstrap attribute
// and MUI's palette mode.
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { useTheme as useMuiTheme } from '@mui/material'
import { App } from '../App.js'
import { RendererSurface } from '../RendererSurface.js'
import { setMediaQuery, resetMediaQueries } from '../test-setup.js'
import { DARK_QUERY, THEME_ATTRIBUTE, THEME_STORAGE_KEY } from '../../../../theme.config.mjs'

afterEach(() => {
  cleanup()
  resetMediaQueries()
  localStorage.clear()
  document.documentElement.removeAttribute(THEME_ATTRIBUTE)
})

function themeSelect(): HTMLSelectElement {
  return screen.getByLabelText('Select theme') as HTMLSelectElement
}

function documentTheme(): string | null {
  return document.documentElement.getAttribute(THEME_ATTRIBUTE)
}

async function choose(preference: string): Promise<void> {
  fireEvent.change(themeSelect(), { target: { value: preference } })
  await waitFor(() => expect(themeSelect().value).toBe(preference))
}

describe('the theme controller', () => {
  it('starts on auto and follows the system', async () => {
    setMediaQuery(DARK_QUERY, true)
    render(<App />)

    await waitFor(() => expect(documentTheme()).toBe('dark'))
    expect(themeSelect().value).toBe('auto')
  })

  it('follows the system changing while on auto, not only at load', async () => {
    setMediaQuery(DARK_QUERY, false)
    render(<App />)
    await waitFor(() => expect(documentTheme()).toBe('light'))

    setMediaQuery(DARK_QUERY, true)
    await waitFor(() => expect(documentTheme()).toBe('dark'))
  })

  it('ignores the system changing once a mode is chosen', async () => {
    setMediaQuery(DARK_QUERY, true)
    render(<App />)
    await choose('light')
    await waitFor(() => expect(documentTheme()).toBe('light'))

    setMediaQuery(DARK_QUERY, false)
    setMediaQuery(DARK_QUERY, true)
    expect(
      documentTheme(),
      'an explicit Light must not lose to a machine set to dark',
    ).toBe('light')
  })

  it('persists the choice and restores it on the next load', async () => {
    setMediaQuery(DARK_QUERY, false)
    render(<App />)
    await choose('dark')

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    cleanup()
    document.documentElement.removeAttribute(THEME_ATTRIBUTE)
    render(<App />)

    await waitFor(() => expect(documentTheme()).toBe('dark'))
    expect(themeSelect().value).toBe('dark')
  })
})

describe('the theme and the renderer are independent', () => {
  it('keeps the theme and the form data across a renderer switch', async () => {
    setMediaQuery(DARK_QUERY, false)
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
    const name = await screen.findByLabelText('Name')
    fireEvent.change(name, { target: { value: 'Ada Lovelace' } })

    await choose('dark')
    await waitFor(() => expect(documentTheme()).toBe('dark'))

    // Read out of the selector rather than listed, for the same reason the
    // boundary test does: a surface added later has to be covered by the test
    // that already exists, not by remembering to extend a list.
    const offered = within(screen.getByLabelText(/renderer/i))
      .getAllByRole('option')
      .map((option) => (option as HTMLOptionElement).value)
    expect(offered.length).toBeGreaterThan(1)

    for (const renderer of offered) {
      fireEvent.change(screen.getByLabelText(/renderer/i), { target: { value: renderer } })
      await waitFor(() => {
        expect((screen.getByLabelText(/renderer/i) as HTMLSelectElement).value).toBe(renderer)
      })

      expect(documentTheme(), `switching to ${renderer} changed the theme`).toBe('dark')
      expect(themeSelect().value, `switching to ${renderer} changed the preference`).toBe('dark')
      expect(
        ((await screen.findByLabelText('Name')) as HTMLInputElement).value,
        `switching to ${renderer} lost the data`,
      ).toBe('Ada Lovelace')
    }
  })

  it('gives Bootstrap the resolved mode, and only Bootstrap', async () => {
    setMediaQuery(DARK_QUERY, false)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))

    fireEvent.change(screen.getByLabelText(/renderer/i), { target: { value: 'bootstrap' } })
    const region = await screen.findByRole('region', { name: /Bootstrap 5$/ })
    expect(region.getAttribute('data-bs-theme')).toBe('light')

    await choose('dark')
    await waitFor(() => {
      expect(
        screen.getByRole('region', { name: /Bootstrap 5$/ }).getAttribute('data-bs-theme'),
      ).toBe('dark')
    })

    fireEvent.change(screen.getByLabelText(/renderer/i), { target: { value: 'default' } })
    const plain = await screen.findByRole('region', { name: /React · Default$/ })
    expect(
      plain.getAttribute('data-bs-theme'),
      'a renderer that does not read the attribute should not be given it',
    ).toBeNull()
  })
})

function MuiModeProbe() {
  return <span data-testid="mui-mode">{useMuiTheme().palette.mode}</span>
}

describe('the MUI adapter', () => {
  it('hands MUI the resolved mode as its palette mode', () => {
    const { rerender } = render(
      <RendererSurface rendererKey="mui" label="React · Material UI" theme="dark">
        <MuiModeProbe />
      </RendererSurface>,
    )
    expect(screen.getByTestId('mui-mode').textContent).toBe('dark')

    rerender(
      <RendererSurface rendererKey="mui" label="React · Material UI" theme="light">
        <MuiModeProbe />
      </RendererSurface>,
    )
    expect(screen.getByTestId('mui-mode').textContent).toBe('light')
  })

  it('leaves every other renderer on the default MUI palette', () => {
    render(
      <RendererSurface rendererKey="default" label="React · Default" theme="dark">
        <MuiModeProbe />
      </RendererSurface>,
    )
    expect(
      screen.getByTestId('mui-mode').textContent,
      'only the MUI surface should carry a MUI theme',
    ).toBe('light')
  })

  it('scopes both adapters to the renderer-owned region', () => {
    render(
      <RendererSurface rendererKey="bootstrap" label="React · Bootstrap 5" theme="dark">
        <span>form</span>
      </RendererSurface>,
    )
    const region = screen.getByRole('region', { name: 'Rendered by React · Bootstrap 5' })
    expect(within(region).getByText('form')).toBeTruthy()
    expect(document.documentElement.hasAttribute('data-bs-theme')).toBe(false)
  })
})

import { describe, it, expect, afterEach } from 'vitest'
import { act, render, screen, cleanup, fireEvent } from '@testing-library/react'
import { App } from '../App.js'
import { resetMediaQueries, setMediaQuery } from '../test-setup.js'
import { NARROW_QUERY } from '../workbench/use-narrow-viewport.js'

afterEach(() => {
  cleanup()
  resetMediaQueries()
})

describe('crossing the phone breakpoint', () => {
  it('keeps the form, its data and the schema editor element', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
    const name = (await screen.findByLabelText('Name')) as HTMLInputElement
    fireEvent.change(name, { target: { value: 'Ada' } })
    const editor = screen.getByLabelText(/^JSON Schema/)

    act(() => setMediaQuery(NARROW_QUERY, true))
    expect(document.querySelector('.pg-workbench')).toBeNull()
    expect(document.querySelector('.pg-columns')).not.toBeNull()
    expect(screen.getByLabelText('Name')).toBe(name)
    expect(name.value).toBe('Ada')
    expect(screen.getByLabelText(/^JSON Schema/)).toBe(editor)

    act(() => setMediaQuery(NARROW_QUERY, false))
    expect(document.querySelector('.pg-workbench')).not.toBeNull()
    expect(screen.getByLabelText('Name')).toBe(name)
  })

  it('shows #241 phone controls only on a phone', async () => {
    render(<App />)
    await screen.findByLabelText('Name')
    expect(screen.queryByRole('group', { name: 'Playground panels' })).toBeNull()
    act(() => setMediaQuery(NARROW_QUERY, true))
    expect(screen.getByRole('group', { name: 'Playground panels' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Focus' })).toBeNull()
  })
})

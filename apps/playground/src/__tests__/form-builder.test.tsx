import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from '../App.js'

function setPath(path: string): void {
  window.history.replaceState(null, '', path)
}

beforeEach(() => setPath('/'))
afterEach(() => {
  cleanup()
  setPath('/')
})

describe('visual form builder', () => {
  it('adds and edits scalar root fields while keeping the JSON editor in sync', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
    fireEvent.click(screen.getByRole('button', { name: 'Visual' }))

    await waitFor(() => expect(screen.getByRole('group', { name: 'name' })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Add field' }))

    const field = await screen.findByRole('group', { name: 'field' })
    fireEvent.change(within(field).getByLabelText('Label'), { target: { value: 'Age' } })
    fireEvent.change(within(field).getByLabelText('Type'), { target: { value: 'number' } })
    fireEvent.click(within(field).getByLabelText('Required'))

    fireEvent.click(screen.getByRole('button', { name: 'JSON' }))
    const source = screen.getByLabelText(/^JSON Schema/) as HTMLTextAreaElement
    const schema = JSON.parse(source.value) as {
      properties: Record<string, { type: string; title: string }>
      required: string[]
    }

    expect(schema.properties.field).toEqual({ type: 'number', title: 'Age' })
    expect(schema.required).toEqual(['field'])
  })

  it('preserves advanced properties and routes unsupported root schemas to JSON', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'if / then / else' }))
    fireEvent.click(screen.getByRole('button', { name: 'Visual' }))

    expect(screen.getByRole('status').textContent).toContain('root keywords')
    expect(screen.queryByRole('button', { name: 'Add field' })).toBeNull()
  })
})

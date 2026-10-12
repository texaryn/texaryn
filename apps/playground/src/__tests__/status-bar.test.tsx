import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { App } from '../App.js'
import { dialectLabel } from '../workbench/dialect-label.js'
import { encodeSharedSchema } from '../routing.js'
import { editSchema, readSchemaText } from './schema-text.js'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', import.meta.env.BASE_URL)
})

describe('dialectLabel', () => {
  it('names the declared dialect', () => {
    expect(dialectLabel({ $schema: 'https://json-schema.org/draft/2020-12/schema' })).toBe('Draft 2020-12')
    expect(dialectLabel({ $schema: 'https://json-schema.org/draft/2019-09/schema' })).toBe('Draft 2019-09')
    expect(dialectLabel({ $schema: 'http://json-schema.org/draft-07/schema#' })).toBe('Draft 7')
    expect(dialectLabel({ $schema: 'http://json-schema.org/draft-04/schema#' })).toBe('Draft 4')
  })

  it('says draft 7 is assumed when nothing is declared, as the adapter does', () => {
    expect(dialectLabel({ type: 'object' })).toBe('Draft 7 (no $schema)')
    expect(dialectLabel({ $schema: 42 })).toBe('Draft 7 (no $schema)')
  })

  it('says draft 7 is assumed when the declared $schema is not recognised', () => {
    expect(dialectLabel({ $schema: 'https://example.com/custom' })).toBe('Draft 7 (unrecognized $schema)')
    expect(dialectLabel({ $schema: 'http://json-schema.org/draft-06/schema#' })).toBe(
      'Draft 7 (unrecognized $schema)',
    )
  })
})

describe('the status bar', () => {
  it('reports the dialect and the JSON state', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
    const status = screen.getByRole('contentinfo', { name: 'Status' })
    expect(status.textContent).toContain('Draft 2020-12')
    expect(status.textContent).toContain('JSON valid')
    editSchema('{')
    expect(status.textContent).toContain('JSON error')
  })

  it('reports the JSON state of a schema restored from a shared link', () => {
    window.history.replaceState(
      null,
      '',
      `${import.meta.env.BASE_URL}#schema=${encodeSharedSchema('{')}`,
    )
    render(<App />)
    const status = screen.getByRole('contentinfo', { name: 'Status' })
    expect(status.textContent).toContain('Draft 7')
    expect(status.textContent).toContain('JSON error')
  })

  it('announces the schema error count in a polite status region', async () => {
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
    const status = within(screen.getByRole('contentinfo', { name: 'Status' })).getByRole('status')
    expect(status.textContent).toBe('')
    const valid = readSchemaText()
    editSchema(valid.replace('"type": "string"', '"type": "strin"'))
    await waitFor(() => expect(status.textContent).toBe('1 schema error. Press F8 to go to it.'), { timeout: 3000 })
    editSchema(valid)
    await waitFor(() => expect(status.textContent).toBe(''), { timeout: 3000 })
  })
})

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { App } from '../App.js'
import { dialectLabel } from '../workbench/dialect-label.js'

afterEach(cleanup)

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
    fireEvent.change(screen.getByLabelText(/^JSON Schema/), { target: { value: '{' } })
    expect(status.textContent).toContain('JSON error')
  })
})

import { describe, it, expect, afterEach } from 'vitest'
import { act, render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { forEachDiagnostic } from '@codemirror/lint'
import { undo, undoDepth } from '@codemirror/commands'
import { App } from '../App.js'
import { resetMediaQueries, setMediaQuery } from '../test-setup.js'
import { NARROW_QUERY } from '../workbench/use-narrow-viewport.js'
import { editSchema, readSchemaText } from './schema-text.js'

afterEach(() => {
  cleanup()
  resetMediaQueries()
})

function view(): EditorView {
  const element = document.querySelector<HTMLElement>('.cm-editor')
  if (!element) throw new Error('no CodeMirror editor')
  return EditorView.findFromDOM(element)!
}

function diagnostics(): { text: string; message: string }[] {
  const found: { text: string; message: string }[] = []
  forEachDiagnostic(view().state, (diagnostic, from, to) => {
    found.push({ text: view().state.doc.sliceString(from, to), message: diagnostic.message })
  })
  return found
}

async function openStringField(): Promise<void> {
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'String field' }))
  await waitFor(() => expect(document.querySelector('.cm-editor')).toBeTruthy())
}

describe('the schema editor', () => {
  it('shows the example schema under the JSON Schema label', async () => {
    await openStringField()
    expect(readSchemaText()).toContain('"title": "String field"')
  })

  it('underlines an invalid keyword value and counts it in the status bar', async () => {
    await openStringField()
    editSchema(readSchemaText().replace('"type": "string"', '"type": "strin"'))
    await waitFor(() => expect(diagnostics().map((entry) => entry.text)).toContain('"strin"'), { timeout: 3000 })
    expect(screen.getByRole('contentinfo', { name: 'Status' }).textContent).toContain('1 schema error')
  })

  it('reports a rejected schema at the start instead of failing', async () => {
    await openStringField()
    const schema = JSON.parse(readSchemaText()) as Record<string, unknown>
    schema.$defs = { loop: { $ref: '#/$defs/loop' } }
    ;(schema.properties as Record<string, unknown>).loop = { $ref: '#/$defs/loop' }
    editSchema(JSON.stringify(schema, null, 2))
    await waitFor(() => expect(diagnostics().some((entry) => /itself/.test(entry.message))).toBe(true), {
      timeout: 3000,
    })
  })

  it('makes Format undoable and starts a fresh history for another example', async () => {
    await openStringField()
    const minified = JSON.stringify(JSON.parse(readSchemaText()))
    editSchema(minified)
    fireEvent.click(screen.getByRole('button', { name: 'Format' }))
    expect(readSchemaText()).toContain('\n  "type"')
    act(() => {
      undo(view())
    })
    expect(readSchemaText()).toBe(minified)
    fireEvent.click(screen.getByRole('button', { name: 'Number field' }))
    await waitFor(() => expect(readSchemaText()).toContain('Price'))
    expect(undoDepth(view().state)).toBe(0)
  })

  it('stays mounted while the visual builder shows', async () => {
    await openStringField()
    const editor = document.querySelector('.cm-editor')
    fireEvent.click(screen.getByRole('button', { name: 'Visual' }))
    fireEvent.click(screen.getByRole('button', { name: 'JSON' }))
    expect(document.querySelector('.cm-editor')).toBe(editor)
  })

  it('takes the hidden code editor out of the accessibility tree while the visual builder shows', async () => {
    await openStringField()
    fireEvent.click(screen.getByRole('button', { name: 'Visual' }))
    expect(document.querySelector<HTMLElement>('.pg-code-editor-frame')!.hidden).toBe(true)
    expect(screen.queryByRole('textbox', { name: /^JSON Schema/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'JSON' }))
    expect(screen.getByRole('textbox', { name: /^JSON Schema/ })).toBeTruthy()
  })

  it('loads on a phone only when the Schema view first opens', async () => {
    setMediaQuery(NARROW_QUERY, true)
    render(<App />)
    await screen.findByLabelText('Name')
    expect(document.querySelector('.cm-editor')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Schema$/ }))
    await waitFor(() => expect(document.querySelector('.cm-editor')).toBeTruthy())
  })
})

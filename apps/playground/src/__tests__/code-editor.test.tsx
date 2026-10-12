import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { EditorView } from '@codemirror/view'
import { forEachDiagnostic } from '@codemirror/lint'
import { undo, undoDepth } from '@codemirror/commands'
import { App } from '../App.js'
import SchemaEditor from '../editor/SchemaEditor.js'
import { resetMediaQueries, setMediaQuery } from '../test-setup.js'
import { NARROW_QUERY } from '../workbench/use-narrow-viewport.js'
import { editSchema, readSchemaText } from './schema-text.js'

afterEach(() => {
  cleanup()
  resetMediaQueries()
  vi.restoreAllMocks()
  window.localStorage.clear()
  window.history.replaceState(null, '', import.meta.env.BASE_URL)
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

describe('the schema editor toolbar', () => {
  it('keeps the Format button in place and disables it while the JSON does not parse', async () => {
    await openStringField()
    const format = screen.getByRole('button', { name: 'Format' })
    expect(format).toHaveProperty('disabled', false)
    editSchema('{')
    expect(screen.getByRole('button', { name: 'Format' })).toBe(format)
    expect(format).toHaveProperty('disabled', true)
  })

  it('leaves an already formatted example selected when Format changes nothing', async () => {
    await openStringField()
    const example = screen.getByRole('button', { name: 'String field' })
    expect(example.getAttribute('aria-current')).toBe('true')
    const before = readSchemaText()
    fireEvent.click(screen.getByRole('button', { name: 'Format' }))
    expect(readSchemaText()).toBe(before)
    expect(example.getAttribute('aria-current')).toBe('true')
    expect(undoDepth(view().state)).toBe(0)
  })

  it('handles a refused clipboard write', async () => {
    await openStringField()
    const written: string[] = []
    // Not vi.fn: a mock attaches its own handlers to the promise it returns.
    const writeText = (text: string) => {
      written.push(text)
      return Promise.reject(new Error('denied'))
    }
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const unhandled: unknown[] = []
    const record = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', record)
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
      await new Promise((resolve) => setTimeout(resolve, 20))
    } finally {
      process.off('unhandledRejection', record)
      Reflect.deleteProperty(navigator, 'clipboard')
    }
    expect(written).toEqual([readSchemaText()])
    expect(unhandled).toEqual([])
    expect(screen.getByText('Copy failed').getAttribute('role')).toBe('status')
  })

  it('says Copied in a polite status region after the clipboard accepts the schema', async () => {
    await openStringField()
    const written: string[] = []
    const writeText = async (text: string) => {
      written.push(text)
    }
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
      await waitFor(() => expect(screen.getByText('Copied').getAttribute('role')).toBe('status'))
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard')
    }
    expect(written).toEqual([readSchemaText()])
  })

  it('says Copy failed when the browser has no clipboard API', async () => {
    await openStringField()
    Reflect.deleteProperty(navigator, 'clipboard')
    expect(navigator.clipboard?.writeText).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(screen.getByText('Copy failed').getAttribute('role')).toBe('status'))
  })
})

describe('SchemaEditor', () => {
  function mount(props: Partial<Parameters<typeof SchemaEditor>[0]> = {}) {
    const base = {
      value: '{}',
      onChange: () => {},
      labelledBy: 'label',
      documentKey: 0,
    }
    const result = render(<SchemaEditor {...base} {...props} />)
    return {
      rerender: (next: Partial<Parameters<typeof SchemaEditor>[0]>) =>
        result.rerender(<SchemaEditor {...base} {...props} {...next} />),
    }
  }

  function type(text: string): void {
    const editor = view()
    editor.dispatch({ changes: { from: editor.state.doc.length, insert: text } })
  }

  it('keeps a newer keystroke when an older value comes back from the parent', () => {
    const emitted: string[] = []
    const { rerender } = mount({ value: '{}', onChange: (text) => emitted.push(text) })
    type(' ')
    type('\n')
    expect(emitted).toEqual(['{} ', '{} \n'])

    rerender({ value: '{} ' })
    expect(view().state.doc.toString()).toBe('{} \n')

    rerender({ value: '{} \n' })
    rerender({ value: '{"type":"object"}' })
    expect(view().state.doc.toString()).toBe('{"type":"object"}')
  })

  it('clears the issue count and the cursor when another document arrives', () => {
    const onSchemaIssues = vi.fn()
    const onCursor = vi.fn()
    const { rerender } = mount({ value: '{}', onSchemaIssues, onCursor })
    rerender({ value: '{"type":"string"}', documentKey: 1 })
    expect(view().state.doc.toString()).toBe('{"type":"string"}')
    expect(onSchemaIssues).toHaveBeenLastCalledWith(null)
    expect(onCursor).toHaveBeenLastCalledWith(null)
  })
})

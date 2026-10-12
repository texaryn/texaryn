import { act, fireEvent, screen } from '@testing-library/react'
import { EditorView } from '@codemirror/view'

function editorElement(): HTMLElement {
  return screen.getByLabelText(/^JSON Schema/)
}

function viewFor(element: HTMLElement): EditorView {
  const view = EditorView.findFromDOM(element.closest<HTMLElement>('.cm-editor') ?? element)
  if (!view) throw new Error('the JSON Schema label points at neither a textarea nor an editor')
  return view
}

export function readSchemaText(): string {
  const element = editorElement()
  return element instanceof HTMLTextAreaElement ? element.value : viewFor(element).state.doc.toString()
}

// Replaces the whole document. Tests of state use it; tests of typing use a
// real browser in workbench.browser.test.tsx.
export function editSchema(text: string): void {
  const element = editorElement()
  if (element instanceof HTMLTextAreaElement) {
    fireEvent.change(element, { target: { value: text } })
    return
  }
  const view = viewFor(element)
  act(() => {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
  })
}

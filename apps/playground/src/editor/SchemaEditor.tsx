import { useEffect, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import type { Extension } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, isolateHistory } from '@codemirror/commands'
import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from '@codemirror/language'
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search'
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { linter, lintGutter, lintKeymap } from '@codemirror/lint'
import { json, jsonParseLinter } from '@codemirror/lang-json'
import { PANE_ATTACH_EVENT } from '../workbench/pane-hosts.js'
import { editorHighlight, editorTheme } from './theme.js'
import { schemaLintSource } from './schema-lint.js'
import { schemaCompletionSource } from './completion.js'

export interface SchemaEditorProps {
  value: string
  onChange: (text: string) => void
  labelledBy: string
  documentKey: number
  onSchemaIssues?: (count: number | null) => void
  onCursor?: (cursor: { line: number; column: number } | null) => void
}

export default function SchemaEditor({
  value,
  onChange,
  labelledBy,
  documentKey,
  onSchemaIssues,
  onCursor,
}: SchemaEditorProps) {
  const host = useRef<HTMLDivElement | null>(null)
  const view = useRef<EditorView | null>(null)
  const extensions = useRef<Extension[]>([])
  const callbacks = useRef({ onChange, onSchemaIssues, onCursor })
  const emitted = useRef(new Set<string>())
  callbacks.current = { onChange, onSchemaIssues, onCursor }

  useEffect(() => {
    extensions.current = [
      lineNumbers(),
      foldGutter(),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      drawSelection(),
      history(),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      highlightSelectionMatches(),
      json(),
      editorTheme,
      editorHighlight,
      linter(jsonParseLinter()),
      linter(schemaLintSource((count) => callbacks.current.onSchemaIssues?.(count)), { delay: 300 }),
      lintGutter(),
      autocompletion({ override: [schemaCompletionSource] }),
      // No indentWithTab: Tab has to leave the editor for keyboard users.
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap,
      ]),
      EditorView.contentAttributes.of({ 'aria-labelledby': labelledBy }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const text = update.state.doc.toString()
          emitted.current.add(text)
          callbacks.current.onChange(text)
        }
        if (update.selectionSet || update.focusChanged) {
          const head = update.state.selection.main.head
          const line = update.state.doc.lineAt(head)
          callbacks.current.onCursor?.(update.view.hasFocus ? { line: line.number, column: head - line.from + 1 } : null)
        }
      }),
    ]
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({ doc: value, extensions: extensions.current }),
    })
    view.current = editor
    // The pane host moves between layouts without remounting this view, so its
    // cached geometry has to be refreshed when it lands somewhere new.
    const paneHost = host.current!.closest('.pg-pane-host')
    const remeasure = () => editor.requestMeasure()
    paneHost?.addEventListener(PANE_ATTACH_EVENT, remeasure)
    return () => {
      paneHost?.removeEventListener(PANE_ATTACH_EVENT, remeasure)
      editor.destroy()
      view.current = null
    }
  }, [labelledBy])

  // Another example is another document: undo must not cross into it.
  const firstKey = useRef(documentKey)
  useEffect(() => {
    const editor = view.current
    if (!editor || documentKey === firstKey.current) return
    firstKey.current = documentKey
    emitted.current.clear()
    editor.setState(EditorState.create({ doc: value, extensions: extensions.current }))
    callbacks.current.onSchemaIssues?.(null)
    callbacks.current.onCursor?.(null)
  }, [documentKey])

  // Format and the visual builder change the same document: an undoable edit.
  useEffect(() => {
    const editor = view.current
    if (!editor) return
    const current = editor.state.doc.toString()
    if (current === value) {
      emitted.current.clear()
      return
    }
    // A value this editor emitted is an echo that a newer keystroke has outrun.
    if (emitted.current.has(value)) return
    emitted.current.clear()
    editor.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      annotations: isolateHistory.of('full'),
    })
  }, [value])

  return <div ref={host} className="pg-code-editor" />
}

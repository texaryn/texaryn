import { useEffect, useRef } from 'react'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { json } from '@codemirror/lang-json'
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language'
import {
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view'

export function JsonSchemaEditor({
  value,
  labelledBy,
  onChange,
}: {
  value: string
  labelledBy: string
  onChange: (value: string) => void
}) {
  const parent = useRef<HTMLDivElement>(null)
  const editor = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const synchronizing = useRef(false)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!parent.current) return

    const view = new EditorView({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        bracketMatching(),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        json(),
        EditorView.lineWrapping,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.contentAttributes.of({ 'aria-labelledby': labelledBy }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !synchronizing.current) {
            onChangeRef.current(update.state.doc.toString())
          }
        }),
      ],
      parent: parent.current,
    })
    editor.current = view

    return () => {
      view.destroy()
      editor.current = null
    }
  }, [labelledBy])

  useEffect(() => {
    const view = editor.current
    if (!view || view.state.doc.toString() === value) return
    synchronizing.current = true
    try {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      })
    } finally {
      synchronizing.current = false
    }
  }, [value])

  return <div ref={parent} className="pg-schema-editor" />
}

import { Component, Suspense, lazy } from 'react'
import type { ReactNode } from 'react'
import type { SchemaEditorProps } from './editor/SchemaEditor.js'

const SchemaEditor = lazy(() => import('./editor/SchemaEditor.js'))

function PlainEditor({ value, onChange, labelledBy }: SchemaEditorProps) {
  return (
    <textarea
      aria-labelledby={labelledBy}
      className="pg-schema-editor"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      spellCheck={false}
      wrap="off"
    />
  )
}

class EditorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

// `load` turns true the first time the schema pane is visible and stays true.
// Until then, and for good if the chunk fails, the textarea is the editor.
export function SchemaEditorSlot({ load, ...props }: SchemaEditorProps & { load: boolean }) {
  const plain = <PlainEditor {...props} />
  if (!load) return plain
  return (
    <EditorBoundary fallback={plain}>
      <Suspense fallback={plain}>
        <SchemaEditor {...props} />
      </Suspense>
    </EditorBoundary>
  )
}

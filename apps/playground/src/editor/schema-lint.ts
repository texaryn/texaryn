import type { Diagnostic } from '@codemirror/lint'
import type { EditorView } from '@codemirror/view'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { checkSchema } from '@texaryn/schema-json'
import { rangeForPointer } from './pointer-range.js'

export function schemaLintSource(onCount: (count: number | null) => void) {
  let generation = 0
  return async (view: EditorView): Promise<Diagnostic[]> => {
    const current = ++generation
    const doc = view.state.doc
    const text = doc.toString()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      onCount(null)
      return []
    }
    const tree = ensureSyntaxTree(view.state, doc.length, 200) ?? syntaxTree(view.state)
    let diagnostics: Diagnostic[]
    try {
      const issues = await checkSchema(parsed)
      diagnostics = issues.map((issue) => ({
        ...rangeForPointer(tree, text, issue.pointer),
        severity: 'error' as const,
        message: issue.message,
        source: 'JSON Schema',
      }))
    } catch (error) {
      diagnostics = [
        {
          from: 0,
          to: Math.min(1, text.length),
          severity: 'error' as const,
          message: error instanceof Error ? error.message : String(error),
          source: 'Texaryn',
        },
      ]
    }
    // CodeMirror drops diagnostics for an outdated document; the count is ours to drop.
    if (current === generation && view.state.doc === doc) onCount(diagnostics.length)
    return diagnostics
  }
}

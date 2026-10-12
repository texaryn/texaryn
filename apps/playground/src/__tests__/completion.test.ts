import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { CompletionContext } from '@codemirror/autocomplete'
import type { CompletionResult } from '@codemirror/autocomplete'
import { ensureSyntaxTree } from '@codemirror/language'
import { json } from '@codemirror/lang-json'
import { schemaCompletionSource } from '../editor/completion.js'

function complete(doc: string, pos = doc.length): CompletionResult | null {
  const state = EditorState.create({ doc, extensions: [json()] })
  ensureSyntaxTree(state, state.doc.length, 1000)
  return schemaCompletionSource(new CompletionContext(state, pos, false))
}

function labels(result: CompletionResult | null): string[] {
  return (result?.options ?? []).map((option) => option.displayLabel ?? option.label)
}

describe('schemaCompletionSource', () => {
  it('offers draft 7 keywords when no $schema is declared', () => {
    const names = labels(complete('{\n  "type": "object",\n  "max'))
    expect(names).toContain('maxLength')
    expect(names).not.toContain('prefixItems')
  })

  it('follows the declared dialect', () => {
    const names = labels(complete('{\n  "$schema": "https://json-schema.org/draft/2020-12/schema",\n  "pre'))
    expect(names).toContain('prefixItems')
    expect(names).toContain('$defs')
    expect(names).not.toContain('definitions')
  })

  it('offers nothing where keys are property names', () => {
    expect(complete('{\n  "properties": {\n    "na')).toBeNull()
  })

  it('offers type names as values of type', () => {
    expect(labels(complete('{ "type": "str'))).toContain('string')
  })

  it('replaces an auto-closed quote', () => {
    const doc = '{ "max" }'
    const result = complete(doc, doc.indexOf('"max') + 4)
    expect(result?.to).toBe(doc.indexOf('"max') + 5)
  })
})

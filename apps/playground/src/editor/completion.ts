import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { syntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@lezer/common'
import { FORMATS, NAME_MAPS, SCHEMA_URIS, TYPE_VALUES, dialectOf, keywordsFor } from './keywords.js'

const TYPING = /^"[^"\\]*$/

function enclosingKey(context: CompletionContext, pos: number): string | null {
  let node: SyntaxNode | null = syntaxTree(context.state).resolveInner(pos, -1)
  while (node && node.name !== 'Object') node = node.parent
  const property = node?.parent
  if (!property || property.name !== 'Property') return null
  const name = property.getChild('PropertyName')
  if (!name) return null
  try {
    return JSON.parse(context.state.doc.sliceString(name.from, name.to)) as string
  } catch {
    return null
  }
}

export function schemaCompletionSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/"[^"\\]*$/)
  if (!word && !context.explicit) return null
  const from = word ? word.from : context.pos
  const to = context.state.doc.sliceString(context.pos, context.pos + 1) === '"' ? context.pos + 1 : context.pos
  const before = context.state.doc.sliceString(0, from).trimEnd()
  const last = before.at(-1)

  if (last === '{' || last === ',') {
    const parent = enclosingKey(context, from)
    if (parent !== null && NAME_MAPS.has(parent)) return null
    const dialect = dialectOf(context.state.doc.toString())
    return {
      from,
      to,
      validFor: TYPING,
      options: keywordsFor(dialect).map((keyword) => ({
        label: `"${keyword.name}"`,
        displayLabel: keyword.name,
        detail: keyword.detail,
        type: 'property',
        apply: `"${keyword.name}": `,
      })),
    }
  }

  if (last === ':') {
    const key = /"((?:[^"\\]|\\.)*)"\s*$/.exec(before.slice(0, -1))?.[1]
    const values = key === 'type' ? TYPE_VALUES : key === '$schema' ? SCHEMA_URIS : key === 'format' ? FORMATS : null
    if (!values) return null
    return {
      from,
      to,
      validFor: TYPING,
      options: values.map((value) => ({ label: `"${value}"`, displayLabel: value, type: 'constant' })),
    }
  }

  return null
}

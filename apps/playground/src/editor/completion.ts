import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { syntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@lezer/common'
import { FORMATS, NAME_MAPS, SCHEMA_URIS, TYPE_VALUES, dialectOf, keywordsFor } from './keywords.js'

const TYPING = /^"[^"\\]*$/

type Role = 'schema' | 'schemaMap' | 'dependencyMap' | 'schemaList' | 'typeList' | 'data'

const SINGLE_SCHEMA: ReadonlySet<string> = new Set([
  'additionalProperties',
  'additionalItems',
  'not',
  'if',
  'then',
  'else',
  'contains',
  'propertyNames',
  'unevaluatedItems',
  'unevaluatedProperties',
  'contentSchema',
  'items',
])

const SCHEMA_LISTS: ReadonlySet<string> = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems', 'items'])

const VALUE_LISTS: Readonly<Record<string, readonly string[]>> = {
  type: TYPE_VALUES,
  $schema: SCHEMA_URIS,
  format: FORMATS,
}

function memberRole(key: string, value: SyntaxNode): Role {
  if (value.name === 'Object') {
    if (NAME_MAPS.has(key)) return 'schemaMap'
    if (key === 'dependencies') return 'dependencyMap'
    if (SINGLE_SCHEMA.has(key)) return 'schema'
  }
  if (value.name === 'Array') {
    if (SCHEMA_LISTS.has(key)) return 'schemaList'
    if (key === 'type') return 'typeList'
  }
  return 'data'
}

function elementRole(parent: Role, node: SyntaxNode): Role {
  if (node.name !== 'Object') return 'data'
  return parent === 'schemaMap' || parent === 'dependencyMap' || parent === 'schemaList' ? 'schema' : 'data'
}

function isClosed(node: SyntaxNode): boolean {
  const last = node.lastChild
  return last !== null && !last.type.isError && (last.name === '}' || last.name === ']')
}

function containsCursor(node: SyntaxNode, pos: number): boolean {
  return node.from < pos && (pos < node.to || (pos === node.to && !isClosed(node)))
}

function keyOf(doc: string, property: SyntaxNode): string | null {
  const name = property.getChild('PropertyName')
  if (!name) return null
  try {
    return JSON.parse(doc.slice(name.from, name.to)) as string
  } catch {
    return null
  }
}

const VALUE_NODES: ReadonlySet<string> = new Set(['Object', 'Array', 'String', 'Number', 'True', 'False', 'Null'])

function isValueNode(node: SyntaxNode): boolean {
  return VALUE_NODES.has(node.name)
}

type Position =
  | { kind: 'keyword' }
  | { kind: 'value'; key: string }
  | { kind: 'typeValue' }
  | null

function positionAt(context: CompletionContext, pos: number): Position {
  const doc = context.state.doc.toString()
  const before = doc.slice(0, pos).trimEnd().at(-1)
  let node = syntaxTree(context.state).topNode.firstChild
  if (node?.name !== 'Object') return null
  let role: Role = 'schema'

  for (;;) {
    let inner: SyntaxNode | null = null
    let innerRole: Role = 'data'

    for (let child: SyntaxNode | null = node.firstChild; child && !inner; child = child.nextSibling) {
      if (child.type.isError) continue
      if (node.name === 'Object' && child.name === 'Property' && containsCursor(child, pos)) {
        const key = keyOf(doc, child)
        const colon: SyntaxNode | null = child.getChild(':')
        if (key === null || !colon || colon.to > pos) return null
        for (let value: SyntaxNode | null = colon.nextSibling; value && !inner; value = value.nextSibling) {
          if (isValueNode(value) && containsCursor(value, pos)) {
            inner = value
            innerRole = role === 'schema' ? memberRole(key, value) : elementRole(role, value)
          }
        }
        if (!inner) return role === 'schema' && before === ':' && Object.hasOwn(VALUE_LISTS, key) ? { kind: 'value', key } : null
      } else if (node.name === 'Array' && isValueNode(child) && containsCursor(child, pos)) {
        inner = child
        innerRole = elementRole(role, child)
      }
    }

    if (!inner) {
      if (node.name === 'Object') return role === 'schema' && (before === '{' || before === ',') ? { kind: 'keyword' } : null
      return role === 'typeList' && (before === '[' || before === ',') ? { kind: 'typeValue' } : null
    }
    node = inner
    role = innerRole
  }
}

export function schemaCompletionSource(context: CompletionContext): CompletionResult | null {
  const word = context.matchBefore(/"[^"\\]*$/)
  if (!word && !context.explicit) return null
  const from = word ? word.from : context.pos
  const to = context.state.doc.sliceString(context.pos, context.pos + 1) === '"' ? context.pos + 1 : context.pos
  const position = positionAt(context, from)
  if (!position) return null

  if (position.kind === 'keyword') {
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

  const values = position.kind === 'typeValue' ? TYPE_VALUES : VALUE_LISTS[position.key]
  return {
    from,
    to,
    validFor: TYPING,
    options: values.map((value) => ({ label: `"${value}"`, displayLabel: value, type: 'constant' })),
  }
}

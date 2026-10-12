import type { JsonError } from '@texaryn/json-schema-library'
import type { JsonPointer } from '@texaryn/core'
import type { SchemaIssue } from './types.js'

const MAX_READINGS = 32

function escapeSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}

interface Search {
  found: string[][]
  truncated: boolean
}

function readings(node: unknown, parts: readonly string[], start: number, prefix: readonly string[], search: Search): void {
  if (search.found.length >= MAX_READINGS) {
    search.truncated = true
    return
  }
  if (start === parts.length) {
    search.found.push([...prefix])
    return
  }
  if (node === null || typeof node !== 'object') return
  for (let end = start + 1; end <= parts.length; end += 1) {
    const key = parts.slice(start, end).join('/')
    if (Object.prototype.hasOwnProperty.call(node, key)) {
      readings((node as Record<string, unknown>)[key], parts, end, [...prefix, key], search)
    }
  }
}

function sharedPrefix(paths: readonly string[][]): string[] {
  const shared: string[] = []
  for (let index = 0; paths.every((path) => index < path.length && path[index] === paths[0]![index]); index += 1) {
    shared.push(paths[0]![index]!)
  }
  return shared
}

// json-schema-library joins property names into its locations without RFC 6901
// escaping (#184), so `a/b` and nested `a` then `b` print alike. The document
// decides: one matching reading is exact; several mean the location is
// ambiguous, and only the prefix every reading shares is certain. Past the cap
// the unseen readings could diverge anywhere, so only the root is certain.
export function resolveUnescapedPath(document: unknown, path: string): string {
  const parts = path === '' ? [] : path.split('/').slice(1)
  const search: Search = { found: [], truncated: false }
  readings(document, parts, 0, [], search)
  if (search.truncated) return ''
  const { found } = search
  const segments = found.length === 0 ? parts : found.length === 1 ? found[0]! : sharedPrefix(found)
  return segments.map((segment) => `/${escapeSegment(segment)}`).join('')
}

export function toSchemaIssue(document: unknown, error: JsonError): SchemaIssue {
  const data = (error.data ?? {}) as { pointer?: unknown; message?: unknown }
  const location = typeof data.pointer === 'string' ? data.pointer.replace(/^#/, '') : ''
  return {
    pointer: resolveUnescapedPath(document, location) as JsonPointer,
    code: String(error.code),
    message: typeof data.message === 'string' ? data.message : error.message,
  }
}

type Json = Record<string, unknown>

const SINGLE = new Set([
  'additionalItems',
  'additionalProperties',
  'contains',
  'contentSchema',
  'else',
  'if',
  'items',
  'not',
  'propertyNames',
  'then',
  'unevaluatedItems',
  'unevaluatedProperties',
])
const LIST = new Set(['allOf', 'anyOf', 'items', 'oneOf', 'prefixItems'])
const MAP = new Set(['$defs', 'definitions', 'dependencies', 'dependentSchemas', 'patternProperties', 'properties'])
const REFERENCES = new Set(['$ref', '$dynamicRef', '$recursiveRef'])
const IDENTIFIERS = new Set(['$id', '$anchor', '$dynamicAnchor'])
const ALIASES: Record<string, string> = { definitions: '$defs', dependentSchemas: 'dependencies', prefixItems: 'items', additionalItems: 'items' }

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const escape = (segment: string): string => segment.replace(/~/g, '~0').replace(/\//g, '~1')
const unescape = (segment: string): string => segment.replace(/~1/g, '/').replace(/~0/g, '~')
const alias = (segment: string): string => ALIASES[segment] ?? segment

type Position = { escaped: string; raw: string; registry: string; keys: readonly string[] }
const below = (p: Position, key: string, member = false): Position => ({
  escaped: `${p.escaped}/${escape(key)}`,
  raw: `${p.raw}/${key}`,
  registry: `${p.registry}/${member ? encodeURIComponent(escape(key)) : key}`,
  keys: [...p.keys, key],
})

function decode(fragment: string): string {
  try {
    return decodeURIComponent(fragment)
  } catch {
    return fragment
  }
}

function copy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(copy)
  if (!isRecord(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return value
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copy(child)]))
}

const aliased = (pointer: string): string => pointer.split('/').map(alias).join('/')

type Reference = { strings: string[]; segments: string[] }
function spellings(reference: string): Reference[] {
  const trimmed = reference.replace(/#+$/, '')
  const first = trimmed.indexOf('#')
  if (first < 0 && !trimmed.startsWith('/')) return []
  const fragments = first < 0 ? [trimmed] : [...new Set([trimmed.slice(first + 1), trimmed.slice(trimmed.lastIndexOf('#') + 1)])]
  return fragments.map((fragment) => {
    const pointer = fragment === '' || fragment.startsWith('/') ? fragment : `/${fragment}`
    const segments = pointer === '' ? [] : pointer.slice(1).split('/').map((s) => alias(unescape(decode(s))))
    return { strings: [pointer, decode(pointer)].map(aliased), segments }
  })
}

function referencePointers(value: unknown, found: Reference[]): Reference[] {
  if (Array.isArray(value)) for (const item of value) referencePointers(item, found)
  else if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (REFERENCES.has(key) && typeof child === 'string') found.push(...spellings(child))
      referencePointers(child, found)
    }
  }
  return found
}

function declaresIdentifier(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(declaresIdentifier)
  if (!isRecord(value)) return false
  return Object.entries(value).some(([key, child]) => (IDENTIFIERS.has(key) && typeof child === 'string') || declaresIdentifier(child))
}

const unreachable = (schema: Json, keyword: string): boolean =>
  (keyword === 'then' && (schema.if === undefined || schema.if === false)) ||
  (keyword === 'else' && (schema.if === undefined || schema.if === true))

const startsWith = (a: readonly string[], b: readonly string[]) => b.length <= a.length && b.every((s, i) => a[i] === s)

/** Keeps a branch the specification never evaluates when a reference or an identifier could reach it. */
export function withoutUnreachableBranches(document: unknown): unknown {
  const references = referencePointers(document, [])
  const reached = (at: Position, bases: readonly Position[]): boolean =>
    bases.some((base) => {
      const relative = [at.escaped.slice(base.escaped.length), at.raw.slice(base.raw.length), at.registry.slice(base.registry.length)].map(aliased)
      const keys = at.keys.slice(base.keys.length).map(alias)
      return references.some(
        (reference) =>
          reference.strings.some((s) => relative.some((pointer) => s === pointer || s.startsWith(`${pointer}/`))) ||
          startsWith(reference.segments, keys),
      )
    })

  const schemaAt = (schema: unknown, position: Position, bases: readonly Position[]): unknown => {
    if (!isRecord(schema)) return copy(schema)
    const within = typeof schema.$id === 'string' && position.keys.length > 0 ? [...bases, position] : bases
    const entries: [string, unknown][] = []
    for (const [key, value] of Object.entries(schema)) {
      const at = below(position, key)
      if (unreachable(schema, key) && !reached(at, within) && !declaresIdentifier(value)) continue
      if (SINGLE.has(key) && (isRecord(value) || typeof value === 'boolean')) entries.push([key, schemaAt(value, at, within)])
      else if (LIST.has(key) && Array.isArray(value)) entries.push([key, value.map((item, i) => schemaAt(item, below(at, String(i)), within))])
      else if (MAP.has(key) && isRecord(value)) {
        const member = key === '$defs' || key === 'definitions'
        entries.push([key, Object.fromEntries(Object.entries(value).map(([name, m]) => [name, schemaAt(m, below(at, name, member), within)]))])
      } else entries.push([key, copy(value)])
    }
    return Object.fromEntries(entries)
  }

  const root: Position = { escaped: '', raw: '', registry: '', keys: [] }
  return schemaAt(document, root, [root])
}

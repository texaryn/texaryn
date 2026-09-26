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

const isRecord = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const escape = (segment: string): string => segment.replace(/~/g, '~0').replace(/\//g, '~1')

type Position = readonly [escaped: string, raw: string]
const below = ([escaped, raw]: Position, key: string): Position => [`${escaped}/${escape(key)}`, `${raw}/${key}`]

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

const aliased = (pointer: string): string =>
  pointer.split('/').map((segment) => (segment === 'definitions' ? '$defs' : segment)).join('/')

function spellings(reference: string): string[] {
  const trimmed = reference.replace(/#+$/, '')
  const hash = trimmed.indexOf('#')
  if (hash < 0 && !trimmed.startsWith('/')) return []
  const fragment = hash < 0 ? trimmed : trimmed.slice(hash + 1)
  const pointer = fragment === '' || fragment.startsWith('/') ? fragment : `/${fragment}`
  return [pointer, decode(pointer)].map(aliased)
}

function referencePointers(value: unknown, found: string[]): string[] {
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

/** Keeps a branch the specification never evaluates when a reference or an identifier could reach it. */
export function withoutUnreachableBranches(document: unknown): unknown {
  const references = referencePointers(document, [])
  const reached = ([escaped, raw]: Position, bases: readonly Position[]): boolean =>
    bases.some((base) => {
      const relative = [aliased(escaped.slice(base[0].length)), aliased(raw.slice(base[1].length))]
      return references.some((reference) => relative.some((pointer) => reference === pointer || reference.startsWith(`${pointer}/`)))
    })

  const schemaAt = (schema: unknown, position: Position, bases: readonly Position[]): unknown => {
    if (!isRecord(schema)) return copy(schema)
    const within = typeof schema.$id === 'string' && position[0] !== '' ? [...bases, position] : bases
    const entries: [string, unknown][] = []
    for (const [key, value] of Object.entries(schema)) {
      const at = below(position, key)
      if (unreachable(schema, key) && !reached(at, within) && !declaresIdentifier(value)) continue
      if (SINGLE.has(key) && (isRecord(value) || typeof value === 'boolean')) entries.push([key, schemaAt(value, at, within)])
      else if (LIST.has(key) && Array.isArray(value)) entries.push([key, value.map((item, i) => schemaAt(item, below(at, String(i)), within))])
      else if (MAP.has(key) && isRecord(value)) {
        entries.push([key, Object.fromEntries(Object.entries(value).map(([name, member]) => [name, schemaAt(member, below(at, name), within)]))])
      } else entries.push([key, copy(value)])
    }
    return Object.fromEntries(entries)
  }

  return schemaAt(document, ['', ''], [['', '']])
}

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

function referenceFragments(value: unknown, found: string[]): string[] {
  if (Array.isArray(value)) for (const item of value) referenceFragments(item, found)
  else if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (REFERENCES.has(key) && typeof child === 'string' && child.includes('#')) {
        found.push(decode(child.slice(child.indexOf('#') + 1)))
      }
      referenceFragments(child, found)
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
  const fragments = referenceFragments(document, [])
  const reached = (pointer: string, bases: readonly string[]): boolean =>
    bases.some((base) => {
      const relative = pointer.slice(base.length)
      return fragments.some((fragment) => fragment === relative || fragment.startsWith(`${relative}/`))
    })

  const schemaAt = (schema: unknown, pointer: string, bases: readonly string[]): unknown => {
    if (!isRecord(schema)) return copy(schema)
    const within = typeof schema.$id === 'string' && pointer !== '' ? [...bases, pointer] : bases
    const entries: [string, unknown][] = []
    for (const [key, value] of Object.entries(schema)) {
      const at = `${pointer}/${escape(key)}`
      if (unreachable(schema, key) && !reached(at, within) && !declaresIdentifier(value)) continue
      if (SINGLE.has(key) && (isRecord(value) || typeof value === 'boolean')) entries.push([key, schemaAt(value, at, within)])
      else if (LIST.has(key) && Array.isArray(value)) entries.push([key, value.map((item, i) => schemaAt(item, `${at}/${i}`, within))])
      else if (MAP.has(key) && isRecord(value)) {
        entries.push([key, Object.fromEntries(Object.entries(value).map(([name, member]) => [name, schemaAt(member, `${at}/${escape(name)}`, within)]))])
      } else entries.push([key, copy(value)])
    }
    return Object.fromEntries(entries)
  }

  return schemaAt(document, '', [''])
}

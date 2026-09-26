import type { Dialect } from './dialect.js'

type Edge = { readonly to: string; readonly via: string; readonly inPlace: boolean }

export interface SchemaGraph {
  readonly edges: ReadonlyMap<string, readonly Edge[]>
  readonly reachable: ReadonlySet<string>
}

const ANONYMOUS_BASE = 'https://texaryn.invalid/root'

const IN_PLACE_LIST = ['allOf', 'anyOf', 'oneOf'] as const
const INSTANCE_SINGLE = [
  'additionalProperties',
  'additionalItems',
  'contains',
  'propertyNames',
  'unevaluatedItems',
  'unevaluatedProperties',
] as const
const INSTANCE_MAP = ['properties', 'patternProperties'] as const
const CONTAINERS = ['$defs', 'definitions'] as const

const REFERENCES: Record<Dialect, readonly string[]> = {
  'draft-07': ['$ref'],
  '2019-09': ['$ref', '$recursiveRef'],
  '2020-12': ['$ref', '$dynamicRef'],
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const escape = (segment: string): string => segment.replace(/~/g, '~0').replace(/\//g, '~1')

interface Documents {
  readonly local: unknown
  readonly remote: Map<string, unknown>
}

function documentsOf(document: unknown, remotes: readonly unknown[]): Documents {
  const documents: Documents = { local: document, remote: new Map() }
  for (const remote of remotes) {
    const id = isRecord(remote) && typeof remote.$id === 'string' ? withoutFragment(remote.$id) : undefined
    if (id) documents.remote.set(id, remote)
  }
  return documents
}

// A position is "#/pointer" in the schema itself and "uri#/pointer" in a remote document.
function split(position: string): { prefix: string; pointer: string } {
  const hash = position.indexOf('#')
  return { prefix: position.slice(0, hash), pointer: position.slice(hash) }
}

function at(documents: Documents, position: string): unknown {
  const { prefix, pointer } = split(position)
  let current = prefix === '' ? documents.local : documents.remote.get(prefix)
  if (pointer === '#') return current
  for (const raw of pointer.slice(2).split('/')) {
    const segment = raw.replace(/~1/g, '/').replace(/~0/g, '~')
    if (Array.isArray(current)) current = current[Number(segment)]
    else if (isRecord(current) && Object.hasOwn(current, segment)) current = current[segment]
    else return undefined
  }
  return current
}

function withoutFragment(uri: string): string {
  const index = uri.indexOf('#')
  return index === -1 ? uri : uri.slice(0, index)
}

function resolveUri(reference: string, base: string): string | undefined {
  try {
    return new URL(reference, base).href
  } catch {
    return undefined
  }
}

interface ResourceIndex {
  readonly resources: Map<string, string>
  readonly anchors: Map<string, string>
  readonly dynamicAnchors: Map<string, string[]>
  readonly recursiveRoots: string[]
  readonly baseAt: Map<string, string>
}

function childSchemas(schema: Record<string, unknown>, position: string, dialect: Dialect, includeContainers: boolean) {
  const found: { position: string; via: string; inPlace: boolean }[] = []
  const addMap = (keyword: string, inPlace: boolean): void => {
    const map = schema[keyword]
    if (!isRecord(map)) return
    for (const [key, value] of Object.entries(map)) {
      if (isRecord(value) || typeof value === 'boolean') {
        found.push({ position: `${position}/${keyword}/${escape(key)}`, via: `${keyword}/${key}`, inPlace })
      }
    }
  }
  if (dialect === 'draft-07' && typeof schema.$ref === 'string') {
    if (includeContainers) for (const key of CONTAINERS) addMap(key, false)
    return found
  }
  const hasIf = 'if' in schema
  if (isRecord(schema.not)) found.push({ position: `${position}/not`, via: 'not', inPlace: true })
  if (isRecord(schema.if)) found.push({ position: `${position}/if`, via: 'if', inPlace: true })
  if (isRecord(schema.then) && hasIf && schema.if !== false) found.push({ position: `${position}/then`, via: 'then', inPlace: true })
  if (isRecord(schema.else) && hasIf && schema.if !== true) found.push({ position: `${position}/else`, via: 'else', inPlace: true })
  for (const keyword of IN_PLACE_LIST) {
    const list = schema[keyword]
    if (Array.isArray(list)) list.forEach((_, index) => found.push({ position: `${position}/${keyword}/${index}`, via: `${keyword}/${index}`, inPlace: true }))
  }
  // json-schema-library keeps evaluating 'dependencies' past draft-07 for backward compatibility.
  addMap('dependencies', true)
  if (dialect !== 'draft-07') addMap('dependentSchemas', true)
  for (const keyword of INSTANCE_SINGLE) {
    if (isRecord(schema[keyword])) found.push({ position: `${position}/${keyword}`, via: keyword, inPlace: false })
  }
  for (const keyword of INSTANCE_MAP) addMap(keyword, false)
  for (const keyword of ['items', 'prefixItems'] as const) {
    const value = schema[keyword]
    if (isRecord(value)) found.push({ position: `${position}/${keyword}`, via: keyword, inPlace: false })
    else if (Array.isArray(value)) value.forEach((_, index) => found.push({ position: `${position}/${keyword}/${index}`, via: `${keyword}/${index}`, inPlace: false }))
  }
  if (includeContainers) for (const key of CONTAINERS) addMap(key, false)
  return found
}

function indexResources(documents: Documents, dialect: Dialect): ResourceIndex {
  const index: ResourceIndex = { resources: new Map(), anchors: new Map(), dynamicAnchors: new Map(), recursiveRoots: [], baseAt: new Map() }
  const visit = (position: string, parentBase: string, documentRoot: boolean): void => {
    const schema = at(documents, position)
    if (!isRecord(schema)) return
    let base = parentBase
    let resourceRoot = documentRoot
    const ignoresSiblings = dialect === 'draft-07' && typeof schema.$ref === 'string'
    if (!ignoresSiblings && typeof schema.$id === 'string') {
      if (dialect === 'draft-07' && schema.$id.startsWith('#')) {
        index.anchors.set(`${withoutFragment(base)}${schema.$id}`, position)
      } else {
        const resolved = resolveUri(schema.$id, parentBase)
        if (resolved) {
          base = withoutFragment(resolved)
          index.resources.set(base, position)
          resourceRoot = true
        }
      }
    }
    if (!ignoresSiblings) {
      if (dialect !== 'draft-07' && typeof schema.$anchor === 'string') index.anchors.set(`${base}#${schema.$anchor}`, position)
      if (dialect === '2020-12' && typeof schema.$dynamicAnchor === 'string') {
        index.anchors.set(`${base}#${schema.$dynamicAnchor}`, position)
        const list = index.dynamicAnchors.get(schema.$dynamicAnchor) ?? []
        list.push(position)
        index.dynamicAnchors.set(schema.$dynamicAnchor, list)
      }
      if (dialect === '2019-09' && resourceRoot && schema.$recursiveAnchor === true) index.recursiveRoots.push(position)
    }
    index.baseAt.set(position, base)
    for (const child of childSchemas(schema, position, dialect, true)) visit(child.position, base, false)
  }
  index.resources.set(ANONYMOUS_BASE, '#')
  visit('#', ANONYMOUS_BASE, true)
  for (const prefix of documents.remote.keys()) {
    index.resources.set(prefix, `${prefix}#`)
    visit(`${prefix}#`, prefix, true)
  }
  return index
}

function resolveReference(reference: string, base: string, index: ResourceIndex, documents: Documents): string | undefined {
  const uri = resolveUri(reference, base)
  if (!uri) return undefined
  const hash = uri.indexOf('#')
  const resource = index.resources.get(hash === -1 ? uri : uri.slice(0, hash))
  const fragment = hash === -1 ? '' : uri.slice(hash + 1)
  if (resource === undefined) return undefined
  if (fragment === '') return resource
  if (fragment.startsWith('/')) {
    const position = `${resource}${decodeURIComponent(fragment)}`
    return at(documents, position) === undefined ? undefined : position
  }
  return index.anchors.get(uri)
}

export function buildSchemaGraph(document: unknown, dialect: Dialect, remotes: readonly unknown[] = []): SchemaGraph {
  const documents = documentsOf(document, remotes)
  const index = indexResources(documents, dialect)
  const edges = new Map<string, Edge[]>()
  const reachable = new Set<string>()
  const visit = (position: string): void => {
    if (reachable.has(position)) return
    reachable.add(position)
    const schema = at(documents, position)
    const list: Edge[] = []
    edges.set(position, list)
    if (!isRecord(schema)) return
    const base = index.baseAt.get(position) ?? ANONYMOUS_BASE
    for (const keyword of REFERENCES[dialect]) {
      const reference = schema[keyword]
      if (typeof reference !== 'string') continue
      const target = resolveReference(reference, base, index, documents)
      if (target === undefined) continue
      const targetSchema = at(documents, target)
      const fragment = reference.includes('#') ? reference.slice(reference.indexOf('#') + 1) : ''
      if (keyword === '$dynamicRef' && isRecord(targetSchema) && fragment !== '' && targetSchema.$dynamicAnchor === fragment) {
        for (const anchor of index.dynamicAnchors.get(fragment) ?? []) list.push({ to: anchor, via: keyword, inPlace: true })
        continue
      }
      list.push({ to: target, via: keyword, inPlace: true })
      // json-schema-library resolves $recursiveRef dynamically whatever its static target declares.
      if (keyword === '$recursiveRef') {
        for (const root of index.recursiveRoots) if (root !== target) list.push({ to: root, via: keyword, inPlace: true })
      }
    }
    for (const child of childSchemas(schema, position, dialect, false)) list.push({ to: child.position, via: child.via, inPlace: child.inPlace })
    for (const edge of list) visit(edge.to)
  }
  visit('#')
  return { edges, reachable }
}

export const POSITION = 'x-texaryn-position'

const INSTANCE_DATA = ['const', 'default', 'enum', 'examples'] as const
const MAPS = ['properties', 'patternProperties', 'dependencies', 'dependentSchemas', ...CONTAINERS] as const

const copy = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(copy)
  if (!isRecord(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return value
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copy(child)]))
}

export interface MarkedDocuments {
  readonly document: unknown
  readonly remotes: readonly unknown[]
  readonly at: (position: string) => unknown
}

/** Copies of the documents in which every reachable schema object names its own graph position under `POSITION`. */
export function markPositions(graph: SchemaGraph, document: unknown, remotes: readonly unknown[] = []): MarkedDocuments {
  const copies = remotes.map(copy)
  const documents = documentsOf(copy(document), copies)
  const schemas = [...graph.reachable].flatMap((position) => {
    const schema = at(documents, position)
    return isRecord(schema) ? [[position, schema] as const] : []
  })
  // A reference can point into instance data or at a map of subschemas, which a marker would change.
  const held = new Set<unknown>()
  const hold = (value: unknown): void => {
    if (typeof value !== 'object' || value === null || held.has(value)) return
    held.add(value)
    for (const child of Object.values(value)) hold(child)
  }
  for (const [, schema] of schemas) {
    for (const keyword of INSTANCE_DATA) hold(schema[keyword])
    for (const keyword of MAPS) if (isRecord(schema[keyword])) held.add(schema[keyword])
  }
  for (const [position, schema] of schemas) if (!held.has(schema)) schema[POSITION] = position
  return { document: documents.local, remotes: copies, at: (position) => at(documents, position) }
}

function stronglyConnected(graph: SchemaGraph, follow: (edge: Edge) => boolean): string[][] {
  const indexOf = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const components: string[][] = []
  let counter = 0
  const connect = (start: string): void => {
    const frames: { node: string; next: number }[] = [{ node: start, next: 0 }]
    indexOf.set(start, counter)
    low.set(start, counter++)
    stack.push(start)
    onStack.add(start)
    while (frames.length > 0) {
      const frame = frames[frames.length - 1]!
      const out = (graph.edges.get(frame.node) ?? []).filter(follow)
      if (frame.next < out.length) {
        const to = out[frame.next++]!.to
        if (!indexOf.has(to)) {
          indexOf.set(to, counter)
          low.set(to, counter++)
          stack.push(to)
          onStack.add(to)
          frames.push({ node: to, next: 0 })
        } else if (onStack.has(to)) {
          low.set(frame.node, Math.min(low.get(frame.node)!, indexOf.get(to)!))
        }
        continue
      }
      frames.pop()
      const parent = frames[frames.length - 1]
      if (parent) low.set(parent.node, Math.min(low.get(parent.node)!, low.get(frame.node)!))
      if (low.get(frame.node) === indexOf.get(frame.node)) {
        const component: string[] = []
        let member: string
        do {
          member = stack.pop()!
          onStack.delete(member)
          component.push(member)
        } while (member !== frame.node)
        const selfLoop = out.some((edge) => edge.to === frame.node)
        if (component.length > 1 || selfLoop) components.push(component.sort())
      }
    }
  }
  for (const node of graph.reachable) if (!indexOf.has(node)) connect(node)
  return components
}

function describeCycle(graph: SchemaGraph, component: readonly string[]): string {
  const members = new Set(component)
  const start = component[0]!
  const path: string[] = [`"${start}"`]
  const seen = new Set<string>([start])
  let current = start
  for (;;) {
    const edges = (graph.edges.get(current) ?? []).filter((edge) => edge.inPlace && members.has(edge.to))
    const back = edges.find((edge) => edge.to === start)
    if (back) {
      path.push(`(${back.via}) "${start}"`)
      return path.join(' ')
    }
    const next = edges.find((edge) => !seen.has(edge.to)) ?? edges[0]!
    path.push(`(${next.via}) "${next.to}"`)
    seen.add(next.to)
    current = next.to
  }
}

/** Thrown when a schema position applies itself to the instance location it is evaluating. */
export class SameLocationCycleError extends Error {
  readonly positions: readonly (readonly string[])[]
  constructor(positions: readonly (readonly string[])[], cycles: readonly string[]) {
    super(
      `Schema position "${positions[0]![0]}" applies itself to the instance location it is ` +
        `evaluating, without crossing into a property or item: ${cycles[0]}. The evaluator ` +
        `recurses without end wherever this position is reached, so the schema is rejected.` +
        (positions.length > 1 ? ` ${positions.length - 1} further cycle(s): ${cycles.slice(1).join('; ')}.` : ''),
    )
    this.name = 'SameLocationCycleError'
    this.positions = positions
  }
}

export function rejectSameLocationCycles(graph: SchemaGraph): void {
  const components = stronglyConnected(graph, (edge) => edge.inPlace)
  if (components.length === 0) return
  throw new SameLocationCycleError(components, components.map((component) => describeCycle(graph, component)))
}

// Instance edges included: these are the positions that make a projection recursive.
export function cyclicPositions(graph: SchemaGraph): ReadonlySet<string> {
  return new Set(stronglyConnected(graph, () => true).flat())
}

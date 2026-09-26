import { isSchemaNode, settings, type SchemaNode } from 'json-schema-library'
import type { Dialect } from './dialect.js'

export interface LocationInfo {
  readonly key: string
  readonly cycle: boolean
  readonly cyclic: boolean
  readonly expanded: readonly SchemaNode[]
  readonly dead: ReadonlySet<SchemaNode>
  readonly children: Map<string, readonly SchemaNode[]>
  items?: readonly SchemaNode[]
}

export interface ProjectionCache {
  readonly dialect: Dialect
  readonly base: string
  readonly closure: Map<string, readonly string[]>
  readonly info: Map<string, LocationInfo>
  readonly cyclic: ReadonlySet<string>
}

export function newProjectionCache(dialect: Dialect, cyclic: ReadonlySet<string>, base: string): ProjectionCache {
  return { dialect, base, closure: new Map(), info: new Map(), cyclic }
}

const IN_PLACE_BRANCHES = ['if', 'then', 'else'] as const
const NON_APPLYING = new Set([
  '$ref',
  '$schema',
  '$id',
  '$anchor',
  '$dynamicAnchor',
  '$recursiveAnchor',
  '$vocabulary',
  '$comment',
  '$defs',
  'definitions',
])

function rootBaseOf(node: SchemaNode): string {
  const root = (node as { context?: { rootNode?: SchemaNode } }).context?.rootNode
  const rootId = root?.$id
  return typeof rootId === 'string' && rootId !== '#' && rootId !== '' ? rootId.replace(/#.*$/, '') : ''
}

const locations = new WeakMap<SchemaNode, string>()

// json-schema-library gives if, then and else inside a referenced definition one shared
// schemaLocation, so a branch and everything under it are placed from the parent instead.
function locationOf(node: SchemaNode): string {
  const known = locations.get(node)
  if (known !== undefined) return known
  const own = (node as { schemaLocation?: unknown }).schemaLocation
  let location = typeof own === 'string' ? own : '#?'
  const parent = node.parent
  if (parent && parent !== node && typeof own === 'string') {
    const branch = IN_PLACE_BRANCHES.find((keyword) => parent[keyword] === node)
    const parentOwn = parent.schemaLocation
    if (branch) location = `${locationOf(parent)}/${branch}`
    else if (typeof parentOwn === 'string' && (own === parentOwn || own.startsWith(`${parentOwn}/`))) {
      location = `${locationOf(parent)}${own.slice(parentOwn.length)}`
    }
  }
  locations.set(node, location)
  return location
}

export function positionOf(node: SchemaNode): string {
  return `${rootBaseOf(node)}${locationOf(node)}`
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

// json-schema-library percent-encodes a `definitions` name in the locations it builds, and no other segment.
function asGraphPosition(position: string): string {
  const hash = position.indexOf('#')
  if (hash < 0) return position
  const segments = position.slice(hash).split('/')
  return position.slice(0, hash) + segments.map((segment, i) => (segments[i - 1] === 'definitions' ? decodeSegment(segment) : segment)).join('/')
}

// resolveRef() compiles a fresh copy of the target on every call; one copy per
// static reference site and compiled document is enough.
const resolvedReferences = new WeakMap<object, Map<string, SchemaNode | undefined>>()

function resolveFresh(node: SchemaNode): SchemaNode | undefined {
  const next = node.resolveRef()
  return isSchemaNode(next) ? next : undefined
}

export function followRef(node: SchemaNode): SchemaNode | undefined {
  if (node.$ref === '') {
    const root = (node as { context?: { rootNode?: SchemaNode } }).context?.rootNode
    if (root) return root
  }
  const context = (node as { context?: object }).context
  const raw = node.schema as Record<string, unknown> | undefined
  const dynamic = typeof raw === 'object' && raw !== null && ('$dynamicRef' in raw || '$recursiveRef' in raw)
  if (!context || dynamic) return resolveFresh(node)
  let cache = resolvedReferences.get(context)
  if (!cache) {
    cache = new Map()
    resolvedReferences.set(context, cache)
  }
  // The target is compiled with these keywords of the referring node copied onto it.
  const copied = JSON.stringify(
    Object.fromEntries(
      settings.PROPERTIES_TO_MERGE.filter((keyword) => raw?.[keyword] !== undefined).map((keyword) => [
        keyword,
        raw![keyword],
      ]),
    ),
  )
  // A copy keeps the referring site's library location, which default sources read.
  const key = `${positionOf(node)}|${String(node.schemaLocation)}|${node.$ref}|${copied}`
  if (cache.has(key)) return cache.get(key)
  const resolved = resolveFresh(node)
  cache.set(key, resolved)
  return resolved
}

// Read from the document rather than the node: a node reached through `$ref`
// carries the referring site's merged annotations.
function authoredSchema(node: SchemaNode): unknown {
  const root = (node as { context?: { rootNode?: SchemaNode } }).context?.rootNode
  const location = (node as { schemaLocation?: unknown }).schemaLocation
  if (root && typeof location === 'string' && location.startsWith('#')) {
    let current: unknown = root.schema
    for (const raw of location === '#' ? [] : asGraphPosition(location).slice(2).split('/')) {
      const segment = raw.replace(/~1/g, '/').replace(/~0/g, '~')
      current = typeof current === 'object' && current !== null ? (current as Record<string, unknown>)[segment] : undefined
    }
    if (current !== undefined) return current
  }
  return node.schema
}

function closureOf(node: SchemaNode, cache: ProjectionCache, stack: Set<string>): readonly string[] {
  const position = positionOf(node)
  const cached = cache.closure.get(position)
  if (cached) return cached
  if (stack.has(position)) return []
  stack.add(position)
  const out = new Set<string>()
  const addAllOf = (): void => {
    for (const branch of node.allOf ?? []) for (const p of closureOf(branch, cache, stack)) out.add(p)
  }
  if (typeof node.$ref === 'string') {
    if (cache.dialect !== 'draft-07') {
      const raw = authoredSchema(node)
      if (typeof raw === 'object' && raw !== null && Object.keys(raw).some((keyword) => !NON_APPLYING.has(keyword))) {
        out.add(position)
      }
      addAllOf()
    }
    const target = followRef(node)
    if (target) for (const p of closureOf(target, cache, stack)) out.add(p)
  } else {
    out.add(position)
    addAllOf()
  }
  stack.delete(position)
  const result = [...out]
  cache.closure.set(position, result)
  return result
}

// A member of a branch that never applies declares its location, but its references do not extend live identity.
const deadMembers = new WeakMap<readonly SchemaNode[], ReadonlySet<SchemaNode>>()

export function locationInfo(declaring: readonly SchemaNode[], cache: ProjectionCache): LocationInfo {
  const members = deadMembers.get(declaring)
  const memoKey = declaring.map((node) => `${positionOf(node)}${members?.has(node) ? '|dead' : ''}`).sort().join('\n')
  const cached = cache.info.get(memoKey)
  if (cached) return cached

  const identity = new Set<string>()
  for (const node of declaring) {
    if (members?.has(node)) identity.add(positionOf(node))
    else for (const p of closureOf(node, cache, new Set())) identity.add(p)
  }

  let cycle = false
  const expanded: SchemaNode[] = []
  const deadNodes = new Set<SchemaNode>()
  const seen = new Map<string, SchemaNode>()
  const visitAll = (node: SchemaNode, stack: Set<string>, dead = false): void => {
    const position = positionOf(node)
    if (stack.has(position)) {
      if (!dead) cycle = true
      return
    }
    const first = seen.get(position)
    if (first && (dead || !deadNodes.has(first))) return
    if (first) deadNodes.delete(first)
    else {
      seen.set(position, node)
      expanded.push(node)
      if (dead) deadNodes.add(node)
    }
    stack.add(position)
    if (typeof node.$ref === 'string') {
      const target = followRef(node)
      if (target) visitAll(target, stack, dead)
    }
    const raw = authoredSchema(node) as Record<string, unknown> | undefined
    const condition = typeof raw === 'object' && raw !== null && 'if' in raw ? raw.if : undefined
    for (const keyword of IN_PLACE_BRANCHES) {
      const branch = node[keyword] as SchemaNode | undefined
      const never =
        (keyword === 'then' && (condition === undefined || condition === false)) ||
        (keyword === 'else' && (condition === undefined || condition === true))
      if (branch && isSchemaNode(branch)) visitAll(branch, stack, dead || never)
    }
    for (const branches of [node.allOf, node.anyOf, node.oneOf]) {
      for (const branch of branches ?? []) visitAll(branch, stack, dead)
    }
    for (const dependency of Object.values(node.dependentSchemas ?? {})) {
      if (dependency && isSchemaNode(dependency)) visitAll(dependency as SchemaNode, stack, dead)
    }
    stack.delete(position)
  }
  for (const node of declaring) visitAll(node, new Set())

  const documentPointer = (position: string): string =>
    asGraphPosition(position.startsWith(`${cache.base}#`) ? position.slice(cache.base.length) : position)
  const info: LocationInfo = {
    key: [...identity].sort().join('\n'),
    cycle,
    cyclic: [...identity].some((position) => cache.cyclic.has(documentPointer(position))),
    expanded,
    dead: deadNodes,
    children: new Map(),
  }
  cache.info.set(memoKey, info)
  return info
}

function declaredBelow(info: LocationInfo, member: (node: SchemaNode) => SchemaNode | undefined): readonly SchemaNode[] {
  const found: SchemaNode[] = []
  const dead = new Set<SchemaNode>()
  const seen = new Set<string>()
  for (const node of info.expanded) {
    const child = member(node)
    if (!child) continue
    const position = positionOf(child)
    if (seen.has(position)) continue
    seen.add(position)
    found.push(child)
    if (info.dead.has(node)) dead.add(child)
  }
  if (dead.size > 0) deadMembers.set(found, dead)
  return found
}

export function childDeclaring(info: LocationInfo, key: string): readonly SchemaNode[] {
  const cached = info.children.get(key)
  if (cached) return cached
  const found = declaredBelow(info, (node) => node.properties?.[key] as SchemaNode | undefined)
  info.children.set(key, found)
  return found
}

export function itemDeclaring(info: LocationInfo): readonly SchemaNode[] {
  info.items ??= declaredBelow(info, (node) => {
    const items = node.items as SchemaNode | undefined
    return items && isSchemaNode(items) ? items : undefined
  })
  return info.items
}

import { isSchemaNode, settings, type SchemaNode } from 'json-schema-library'
import type { Dialect } from './dialect.js'

export interface LocationInfo {
  readonly key: string
  readonly cycle: boolean
  readonly cyclic: boolean
  readonly expanded: readonly SchemaNode[]
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
  const location = locationOf(node)
  if (root && location.startsWith('#')) {
    let current: unknown = root.schema
    for (const raw of location === '#' ? [] : location.slice(2).split('/')) {
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

export function branchCanApply(node: SchemaNode, keyword: 'if' | 'then' | 'else'): boolean {
  if (keyword === 'if') return true
  const condition = node.if === undefined ? undefined : (node.if.schema as unknown)
  return condition !== undefined && condition !== (keyword === 'then' ? false : true)
}

export function locationInfo(declaring: readonly SchemaNode[], cache: ProjectionCache): LocationInfo {
  const memoKey = declaring.map(positionOf).sort().join('\n')
  const cached = cache.info.get(memoKey)
  if (cached) return cached

  const identity = new Set<string>()
  for (const node of declaring) for (const p of closureOf(node, cache, new Set())) identity.add(p)

  let cycle = false
  const expanded: SchemaNode[] = []
  const seen = new Set<string>()
  const visitAll = (node: SchemaNode, stack: Set<string>): void => {
    const position = positionOf(node)
    if (stack.has(position)) {
      cycle = true
      return
    }
    if (seen.has(position)) return
    seen.add(position)
    expanded.push(node)
    stack.add(position)
    if (typeof node.$ref === 'string') {
      const target = followRef(node)
      if (target) visitAll(target, stack)
    }
    for (const keyword of IN_PLACE_BRANCHES) {
      const branch = node[keyword] as SchemaNode | undefined
      if (branch && isSchemaNode(branch) && branchCanApply(node, keyword)) visitAll(branch, stack)
    }
    for (const branches of [node.allOf, node.anyOf, node.oneOf]) {
      for (const branch of branches ?? []) visitAll(branch, stack)
    }
    for (const dependency of Object.values(node.dependentSchemas ?? {})) {
      if (dependency && isSchemaNode(dependency)) visitAll(dependency as SchemaNode, stack)
    }
    stack.delete(position)
  }
  for (const node of declaring) visitAll(node, new Set())

  const documentPointer = (position: string): string =>
    position.startsWith(`${cache.base}#`) ? position.slice(cache.base.length) : position
  const info: LocationInfo = {
    key: [...identity].sort().join('\n'),
    cycle,
    cyclic: [...identity].some((position) => cache.cyclic.has(documentPointer(position))),
    expanded,
    children: new Map(),
  }
  cache.info.set(memoKey, info)
  return info
}

export function childDeclaring(info: LocationInfo, key: string): readonly SchemaNode[] {
  const cached = info.children.get(key)
  if (cached) return cached
  const found: SchemaNode[] = []
  const seen = new Set<string>()
  for (const node of info.expanded) {
    const child = node.properties?.[key] as SchemaNode | undefined
    if (!child) continue
    const position = positionOf(child)
    if (seen.has(position)) continue
    seen.add(position)
    found.push(child)
  }
  info.children.set(key, found)
  return found
}

export function itemDeclaring(info: LocationInfo): readonly SchemaNode[] {
  if (info.items) return info.items
  const found: SchemaNode[] = []
  const seen = new Set<string>()
  for (const node of info.expanded) {
    const items = node.items as SchemaNode | undefined
    if (!items || !isSchemaNode(items)) continue
    const position = positionOf(items)
    if (seen.has(position)) continue
    seen.add(position)
    found.push(items)
  }
  info.items = found
  return found
}

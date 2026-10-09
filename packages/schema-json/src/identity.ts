import { isSchemaNode, settings, type SchemaNode } from 'json-schema-library'
import type { Dialect } from './dialect.js'
import { POSITION, escape } from './schema-graph.js'

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
  readonly schemaAt: (position: string) => unknown
  readonly closure: Map<string, readonly string[]>
  readonly info: Map<string, LocationInfo>
  readonly cyclic: ReadonlySet<string>
}

export function newProjectionCache(
  dialect: Dialect,
  cyclic: ReadonlySet<string>,
  schemaAt: (position: string) => unknown,
): ProjectionCache {
  return { dialect, schemaAt, closure: new Map(), info: new Map(), cyclic }
}

const IN_PLACE_BRANCHES = ['if', 'then', 'else'] as const
const UNLOCATED_CHILDREN = [...IN_PLACE_BRANCHES, 'contains'] as const
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
  POSITION,
])

// Draft 7 ignores a $ref's siblings, and the library copies the annotations to merge onto the target.
export function onlyPoints(node: SchemaNode): boolean {
  if (node.getDraftVersion() === 'draft-07') return true
  return Object.keys(node.schema as object).every((keyword) => NON_APPLYING.has(keyword) || settings.PROPERTIES_TO_MERGE.includes(keyword))
}

function markerOf(node: SchemaNode): string | undefined {
  const schema = node.schema as unknown
  const marker =
    typeof schema === 'object' && schema !== null && Object.hasOwn(schema, POSITION) ? (schema as Record<string, unknown>)[POSITION] : undefined
  return typeof marker === 'string' ? marker : undefined
}

// A boolean carries no marker, nor does an if, then or else json-schema-library parses beside a draft-07 $ref.
// The library locates an if, then, else or contains by its parent's location plus the whole evaluation path, and reduceNode strips if, then and else.
function unmarkedPosition(node: SchemaNode): string {
  const own = typeof node.schemaLocation === 'string' ? node.schemaLocation : '#'
  const parent = node.parent
  if (!parent || parent === node) return own
  const branch = UNLOCATED_CHILDREN.find((keyword) => parent[keyword] === node || node.evaluationPath === `${parent.evaluationPath}/${keyword}`)
  if (branch) return `${positionOf(parent)}/${branch}`
  const parentOwn = parent.schemaLocation
  if (typeof parentOwn === 'string' && (own === parentOwn || own.startsWith(`${parentOwn}/`))) {
    const suffix = own.slice(parentOwn.length)
    const keyword = suffix.split('/')[1] ?? ''
    const key = memberKey(parent, keyword, node) ?? strippedMemberKey(parent, keyword, node, suffix)
    return key === undefined ? `${positionOf(parent)}${suffix}` : `${positionOf(parent)}/${keyword}/${escape(key)}`
  }
  return own
}

const memberKeys = new WeakMap<object, ReadonlyMap<SchemaNode, string>>()

function keyIn(map: object, entries: () => Iterable<readonly [string, unknown]>, node: SchemaNode): string | undefined {
  let keys = memberKeys.get(map)
  if (!keys) {
    const index = new Map<SchemaNode, string>()
    for (const [key, child] of entries()) if (isSchemaNode(child) && !index.has(child)) index.set(child, key)
    memberKeys.set(map, index)
    keys = index
  }
  return keys.get(node)
}

function memberKey(parent: SchemaNode, keyword: string, node: SchemaNode): string | undefined {
  const map =
    keyword === 'properties' ? parent.properties
    : keyword === '$defs' || keyword === 'definitions' ? parent.$defs
    : keyword === 'dependencies' || keyword === 'dependentSchemas' ? parent.dependentSchemas
    : undefined
  if (map) return keyIn(map, () => Object.entries(map), node)
  const patterns = parent.patternProperties
  if (keyword === 'patternProperties' && patterns) {
    return keyIn(patterns, () => patterns.map(({ name, node: child }) => [name, child] as const), node)
  }
  return undefined
}

const STRIPPED_MAPS = new Set(['$defs', 'definitions', 'dependencies', 'dependentSchemas', 'patternProperties'])

function strippedMemberKey(parent: SchemaNode, keyword: string, node: SchemaNode, suffix: string): string | undefined {
  if (!STRIPPED_MAPS.has(keyword) || !node.evaluationPath.startsWith(`${parent.evaluationPath}/${keyword}/`)) return undefined
  const spelled = suffix.slice(keyword.length + 2)
  return keyword === 'definitions' ? decodeURIComponent(spelled).replace(/~1/g, '/').replace(/~0/g, '~') : spelled
}

export function positionOf(node: SchemaNode): string {
  return markerOf(node) ?? unmarkedPosition(node)
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
export function authoredSchema(node: SchemaNode, cache: ProjectionCache): unknown {
  const marker = markerOf(node)
  return (marker === undefined ? undefined : cache.schemaAt(marker)) ?? node.schema
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
      const raw = authoredSchema(node, cache)
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
      if (cache.dialect === 'draft-07') {
        stack.delete(position)
        return
      }
    }
    const raw = authoredSchema(node, cache) as Record<string, unknown> | undefined
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

  const info: LocationInfo = {
    key: [...identity].sort().join('\n'),
    cycle,
    cyclic: [...identity].some((position) => cache.cyclic.has(position)),
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
  const found = declaredBelow(info, (node) => {
    if (Object.hasOwn(node.properties ?? {}, key)) return node.properties?.[key]
    if (node.patternProperties?.some(({ pattern }) => pattern.test(key))) return undefined
    return node.additionalProperties
  })
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

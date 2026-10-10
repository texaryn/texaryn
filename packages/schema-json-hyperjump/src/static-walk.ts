import type {
  NodeProjection,
  ChildProjection,
  AnnotationSet,
  JsonPointer,
  JsonSchemaType,
  FieldConstraints,
  EnumOption,
  ProjectionBoundary,
  ProjectionBoundaryTarget,
  ProjectionOptions,
  ProjectionDiagnostic,
} from '@texaryn/core'
import type { Dialect } from './dialect.js'
import { projectionTypeFamilies, shapeDiagnostic, shapeOfFamilies, type KeywordFamily } from './projection-shape.js'
import {
  schemaAtPosition,
  schemaFragment,
  schemaParentPosition,
  schemaReferenceTarget,
  schemaPositionSegments,
  escapeSegment,
} from './pointer-utils.js'
import { CONSTRAINT_KEYS, ANNOTATION_KEYS } from './constants.js'

const VALID_TYPES = new Set<JsonSchemaType>([
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
  'null',
])

const REFERENCE_METADATA_KEYS = new Set([
  '$ref', '$schema', '$id', '$anchor', '$comment', '$defs', 'definitions',
  ...ANNOTATION_KEYS,
])

/**
 * Working node used while a projection is under construction. `type` starts
 * unresolved and is filled in by either the data-driven pass or this module's
 * static walk; a pointer whose type never resolves (no keyword of any position
 * implies one) is dropped, with everything beneath it, when it is finalized,
 * since the port's NodeProjection.type is not optional.
 */
export interface DraftNode {
  type?: JsonSchemaType
  families?: Set<KeywordFamily>
  inactiveTypes?: Set<JsonSchemaType>
  hasIndependentActiveShape?: true
  composed?: boolean
  format?: string
  constraints: FieldConstraints
  children?: ChildProjection[]
  enumValues?: EnumOption[]
  active: boolean
  /** Set by a provisionally selected branch; never set alongside `active`. */
  provisional?: boolean
  annotations: AnnotationSet
  boundaries?: ProjectionBoundary[]
  boundaryTargets?: ProjectionBoundaryTarget[]
  recursiveExpansion?: true
  defaultSources?: readonly string[]
}

export interface ProjectionCache {
  readonly dialect: Dialect
  readonly closure: Map<string, readonly string[]>
  readonly info: Map<string, LocationInfo>
  readonly cyclic: ReadonlySet<string>
  readonly retainedPositions: ReadonlySet<string>
}

export function newProjectionCache(
  dialect: Dialect,
  cyclic: ReadonlySet<string>,
  retainedPositions: ReadonlySet<string> = new Set<string>(),
): ProjectionCache {
  return { dialect, closure: new Map(), info: new Map(), cyclic, retainedPositions }
}

export interface ProjectionLimits {
  readonly objects: number
  readonly nodes: number
}

export interface Lineage {
  readonly key: string
  readonly pointer: string
  readonly recursive: boolean
  readonly depth: number
  readonly parent: Lineage | undefined
}

export interface RecursionState {
  readonly cache: ProjectionCache
  readonly limits: ProjectionLimits
  readonly boundaries: Map<string, Set<ProjectionBoundary>>
  readonly boundaryTargets: Map<string, Map<string, ProjectionBoundaryTarget>>
  readonly expandedBoundaryTokens: ReadonlySet<string>
  readonly boundaryGeneration: number
  readonly pruned: Set<string>
  readonly cycles: Set<string>
  readonly decisions: Map<string, Decision>
  readonly queue: { path: readonly number[]; enter: () => void }[][]
  readonly reserved: Set<string>
  readonly flagged: Set<string>
  readonly onCycle: Set<string>
  objectsUsed: number
  nodesUsed: number
}

export type Decision = { kind: 'walk'; lineage: Lineage | undefined } | { kind: 'skip' }

export interface LocationInfo {
  readonly key: string
  readonly cycle: boolean
  readonly cyclic: boolean
  readonly expanded: readonly string[]
  readonly children: Map<string, readonly string[]>
  items?: readonly string[]
}

function positionContains(ancestor: string, candidate: string): boolean {
  return candidate === ancestor || candidate.startsWith(`${ancestor}/`)
}

function retainedConditionalBranch(position: string, cache: ProjectionCache): boolean {
  for (const target of cache.retainedPositions) if (positionContains(position, target)) return true
  return false
}

function isLeafSchema(schema: unknown, rootSchema: unknown, position?: string, dialect: Dialect = 'draft-07'): boolean {
  const seenPositions = new Set<string>()
  const seenSchemas = new WeakSet<object>()
  const pending: Array<{ schema: unknown; position?: string }> = []
  const enqueue = (schema: unknown, position?: string): void => {
    if (schema !== null && typeof schema === 'object') {
      if (position !== undefined) {
        if (seenPositions.has(position)) return
        seenPositions.add(position)
      } else {
        if (seenSchemas.has(schema)) return
        seenSchemas.add(schema)
      }
    }
    pending.push({ schema, position })
  }
  enqueue(schema, position)
  while (pending.length > 0) {
    const current = pending.pop()!
    if (!isRecord(current.schema)) continue
    const record = current.schema
    const targets = refTargets(record, rootSchema, current.position, dialect)
    if (targets.length > 0 && dialect === 'draft-07') {
      for (const target of targets) enqueue(schemaAtPosition(rootSchema, target), target)
      continue
    }
    if (dialect === 'draft-07') {
      // ADR-007 keeps typeless Draft 7 compositions conservative for budgeting.
      const type = Array.isArray(record.type)
        ? record.type.find((value) => VALID_TYPES.has(value as JsonSchemaType))
        : record.type
      if (typeof type === 'string') {
        if (type === 'object') return false
        continue
      }
      if (('enum' in record || 'const' in record) && !('properties' in record)) continue
      return false
    }
    const types = Array.isArray(record.type) ? record.type : [record.type]
    if (types.includes('object') || projectionTypeFamilies(record).has('object')) return false
    for (const target of targets) enqueue(schemaAtPosition(rootSchema, target), target)
    for (const keyword of ['allOf', 'oneOf', 'anyOf'] as const) {
      const branches = record[keyword]
      if (Array.isArray(branches)) {
        branches.forEach((branch: unknown, index: number) =>
          enqueue(
            branch,
            current.position === undefined ? undefined : `${current.position}/${keyword}/${index}`,
          ),
        )
      }
    }
    if (isRecord(record.if)) {
      for (const keyword of ['then', 'else'] as const) {
        enqueue(record[keyword], current.position === undefined ? undefined : `${current.position}/${keyword}`)
      }
    }
    for (const keyword of ['dependentSchemas', 'dependencies'] as const) {
      const map = record[keyword]
      if (!isRecord(map)) continue
      for (const [key, branch] of Object.entries(map)) {
        if (isRecord(branch)) {
          enqueue(
            branch,
            current.position === undefined
              ? undefined
              : `${current.position}/${keyword}/${escapeSegment(key)}`,
          )
        }
      }
    }
  }
  return true
}

export function newRecursionState(
  cache: ProjectionCache,
  limits: ProjectionLimits,
  expandedBoundaryTokens: ReadonlySet<string> = new Set(),
  boundaryGeneration = 0,
): RecursionState {
  return {
    cache,
    limits,
    boundaries: new Map(),
    boundaryTargets: new Map(),
    expandedBoundaryTokens,
    boundaryGeneration,
    pruned: new Set(),
    cycles: new Set(),
    decisions: new Map(),
    queue: [],
    reserved: new Set(),
    flagged: new Set(),
    onCycle: new Set(),
    objectsUsed: 0,
    nodesUsed: 0,
  }
}

function boundaryToken(pointer: string, schemaKey: string, generation: number): string {
  return JSON.stringify([pointer, schemaKey, generation])
}

function addBoundary(
  state: RecursionState,
  pointer: string,
  reason: ProjectionBoundary,
  targetPointer: string,
  schemaKey: string,
): void {
  const set = state.boundaries.get(pointer) ?? new Set<ProjectionBoundary>()
  set.add(reason)
  state.boundaries.set(pointer, set)
  const targets = state.boundaryTargets.get(pointer) ?? new Map<string, ProjectionBoundaryTarget>()
  if (![...targets.values()].some((target) => target.reason === reason)) {
    const token = boundaryToken(targetPointer, schemaKey, state.boundaryGeneration)
    targets.set(token, { pointer: targetPointer as JsonPointer, reason, token })
  }
  state.boundaryTargets.set(pointer, targets)
}

const IN_PLACE_BRANCHES = ['if', 'then', 'else'] as const
const NON_APPLYING = new Set([
  '$ref',
  '$dynamicRef',
  '$recursiveRef',
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

const refTargets = (
  schema: Record<string, unknown>,
  rootSchema: unknown,
  position?: string,
  dialect: Dialect = 'draft-07',
): string[] => {
  if (position !== undefined) {
    const keywords = dialect === '2020-12'
      ? ['$ref', '$dynamicRef'] as const
      : dialect === '2019-09'
        ? ['$ref', '$recursiveRef'] as const
        : ['$ref'] as const
    const targets: string[] = []
    for (const keyword of keywords) {
      const resolved = schemaReferenceTarget(rootSchema, position, keyword)
      if (resolved !== undefined && !targets.includes(resolved)) targets.push(resolved)
    }
    return targets
  }
  const ref = schema.$ref
  return typeof ref === 'string' && ref.startsWith('#') ? [`#${schemaFragment(ref)}`] : []
}

// Draft 7 ignores a `$ref` site's siblings, so the site adds nothing to an
// identity; from 2019-09 it adds itself when a sibling keyword applies.
function closureOf(position: string, rootSchema: unknown, cache: ProjectionCache, stack: Set<string>): readonly string[] {
  const cached = cache.closure.get(position)
  if (cached) return cached
  if (stack.has(position)) return []
  stack.add(position)
  const out = new Set<string>()
  const schema = schemaAtPosition(rootSchema, position)
  const addAllOf = (record: Record<string, unknown>): void => {
    if (!Array.isArray(record.allOf)) return
    record.allOf.forEach((_: unknown, index: number) => {
      for (const p of closureOf(`${position}/allOf/${index}`, rootSchema, cache, stack)) out.add(p)
    })
  }
  if (isRecord(schema)) {
    const targets = refTargets(schema, rootSchema, position, cache.dialect)
    if (targets.length === 0) {
      out.add(position)
      addAllOf(schema)
    } else {
      if (cache.dialect !== 'draft-07') {
        if (Object.keys(schema).some((keyword) => !NON_APPLYING.has(keyword))) out.add(position)
        addAllOf(schema)
      }
      for (const target of targets) {
        for (const p of closureOf(target, rootSchema, cache, stack)) out.add(p)
      }
    }
  } else if (typeof schema === 'boolean') out.add(position)
  stack.delete(position)
  const result = [...out]
  cache.closure.set(position, result)
  return result
}

export function locationInfo(
  declaring: readonly string[],
  rootSchema: unknown,
  state: RecursionState,
): LocationInfo {
  const cache = state.cache
  const memoKey = [...declaring].sort().join('\n')
  const cached = cache.info.get(memoKey)
  if (cached) return cached
  const at = (position: string): unknown => schemaAtPosition(rootSchema, position)
  const identity = new Set<string>()
  for (const position of declaring) for (const p of closureOf(position, rootSchema, cache, new Set())) identity.add(p)

  let cycle = false
  const expanded: string[] = []
  const seen = new Set<string>()
  const visitAll = (position: string, stack: Set<string>): void => {
    if (stack.has(position)) {
      cycle = true
      return
    }
    if (seen.has(position)) return
    seen.add(position)
    const schema = at(position)
    if (!isRecord(schema)) return
    expanded.push(position)
    stack.add(position)
    const targets = refTargets(schema, rootSchema, position, cache.dialect)
    for (const target of targets) visitAll(target, stack)
    if (targets.length > 0 && cache.dialect === 'draft-07' && isRecord(at(targets[0]!))) {
      stack.delete(position)
      return
    }
    for (const keyword of IN_PLACE_BRANCHES) {
      const trivial =
        (keyword === 'then' && (!('if' in schema) || schema.if === false)) ||
        (keyword === 'else' && (!('if' in schema) || schema.if === true))
      if (isRecord(schema[keyword]) && !trivial) visitAll(`${position}/${keyword}`, stack)
    }
    for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
      const branches = schema[keyword]
      if (Array.isArray(branches)) branches.forEach((_: unknown, index: number) => visitAll(`${position}/${keyword}/${index}`, stack))
    }
    for (const keyword of cache.dialect === 'draft-07' ? (['dependencies'] as const) : (['dependentSchemas', 'dependencies'] as const)) {
      const map = schema[keyword]
      if (!isRecord(map)) continue
      for (const [key, branch] of Object.entries(map)) {
        if (isRecord(branch)) visitAll(`${position}/${keyword}/${escapeSegment(key)}`, stack)
      }
    }
    stack.delete(position)
  }
  for (const position of declaring) visitAll(position, new Set())

  const info: LocationInfo = {
    key: [...identity].sort().join('\n'),
    cycle,
    cyclic: [...identity].some((position) => cache.cyclic.has(position)),
    expanded,
    children: new Map(),
  }
  cache.info.set(memoKey, info)
  return info
}

function childDeclaring(info: LocationInfo, key: string, rootSchema: unknown): readonly string[] {
  const cached = info.children.get(key)
  if (cached) return cached
  const found: string[] = []
  for (const position of info.expanded) {
    const schema = schemaAtPosition(rootSchema, position)
    if (!isRecord(schema)) continue
    if (isRecord(schema.properties) && Object.hasOwn(schema.properties, key)) {
      const child = `${position}/properties/${escapeSegment(key)}`
      if (!found.includes(child)) found.push(child)
      continue
    }
    if (matchesPatternProperty(schema, key) || !isRecord(schema.additionalProperties)) continue
    const child = `${position}/additionalProperties`
    if (!found.includes(child)) found.push(child)
  }
  info.children.set(key, found)
  return found
}

function itemDeclaring(info: LocationInfo, rootSchema: unknown): readonly string[] {
  if (info.items) return info.items
  const found: string[] = []
  for (const position of info.expanded) {
    const schema = schemaAtPosition(rootSchema, position)
    if (isRecord(schema) && schema.items !== undefined && !Array.isArray(schema.items)) {
      found.push(`${position}/items`)
    }
  }
  info.items = found
  return found
}

// A location holding data and every member of one are always projected. Below
// that, a location repeating a past-the-data ancestor's identity is cut, and
// the recursion-induced rest are admitted breadth first against the budget when dequeued.
function decideMember(
  state: RecursionState,
  parentPointer: string,
  childPointer: string,
  childData: unknown,
  declaring: readonly string[],
  rootSchema: unknown,
  parentLineage: Lineage | undefined,
  phase: 'enqueue' | 'dequeue',
  leaf = false,
): Decision | 'defer' {
  const cached = state.decisions.get(childPointer)
  if (cached) return cached
  const info = locationInfo(declaring, rootSchema, state)
  const token = boundaryToken(childPointer, info.key, state.boundaryGeneration)
  const settle = (decision: Decision): Decision => {
    state.decisions.set(childPointer, decision)
    return decision
  }
  if (info.cycle) {
    state.cycles.add(childPointer)
    return settle({ kind: 'skip' })
  }
  if (childData !== undefined && childData !== null) return settle({ kind: 'walk', lineage: undefined })
  // An unreadable identity is never a repeat, and is budgeted so it cannot expand without end.
  const recursive = (parentLineage?.recursive ?? false) || info.cyclic || info.key === ''
  const lineage: Lineage = { key: info.key, pointer: childPointer, recursive, depth: (parentLineage?.depth ?? 0) + 1, parent: parentLineage }
  if (parentLineage === undefined) return settle({ kind: 'walk', lineage })
  for (let ancestor: Lineage | undefined = parentLineage; ancestor; ancestor = ancestor.parent) {
    if (
      info.key !== '' &&
      ancestor.key === info.key &&
      !state.expandedBoundaryTokens.has(token)
    ) {
      addBoundary(state, ancestor.pointer, 'recursion', childPointer, info.key)
      state.pruned.add(childPointer)
      return settle({ kind: 'skip' })
    }
  }
  if (!recursive) return settle({ kind: 'walk', lineage })
  if (phase === 'enqueue') return 'defer'
  let admit: boolean
  if (leaf) {
    const covered = state.reserved.has(parentPointer)
    admit = state.expandedBoundaryTokens.has(token) || covered || state.nodesUsed < state.limits.nodes
    if (admit && !covered) state.nodesUsed += 1
  } else {
    const explicitlyExpanded = state.expandedBoundaryTokens.has(token)
    const leaves = leafMembers(info, rootSchema, state.cache.dialect)
    admit =
      explicitlyExpanded ||
      (state.objectsUsed < state.limits.objects && state.nodesUsed + 1 + leaves <= state.limits.nodes)
    if (admit) {
      state.objectsUsed += 1
      state.nodesUsed += explicitlyExpanded ? 1 : 1 + leaves
      if (!explicitlyExpanded) state.reserved.add(childPointer)
    }
  }
  if (!admit) {
    addBoundary(state, parentPointer, 'budget', childPointer, info.key)
    state.pruned.add(childPointer)
    return settle({ kind: 'skip' })
  }
  state.flagged.add(childPointer)
  return settle({ kind: 'walk', lineage })
}

function leafMembers(info: LocationInfo, rootSchema: unknown, dialect: Dialect): number {
  const keys = new Set<string>()
  const requiredKeys = requiredAtLocation(info, rootSchema)
  for (const position of info.expanded) {
    const schema = schemaAtPosition(rootSchema, position)
    if (!isRecord(schema)) continue
    if (isRecord(schema.properties)) for (const key of Object.keys(schema.properties)) keys.add(key)
    for (const key of additionalPropertyKeys(schema, undefined, requiredKeys)) keys.add(key)
  }
  let count = 0
  for (const key of keys) {
    const first = childDeclaring(info, key, rootSchema)[0]
    if (first !== undefined && isLeafSchema(schemaAtPosition(rootSchema, first), rootSchema, first, dialect)) count += 1
  }
  return count
}

function decideRow(state: RecursionState, rowPointer: string, declaring: readonly string[], rootSchema: unknown): Decision {
  const cached = state.decisions.get(rowPointer)
  if (cached) return cached
  const info = locationInfo(declaring, rootSchema, state)
  if (info.cycle) state.cycles.add(rowPointer)
  const decision: Decision = info.cycle ? { kind: 'skip' } : { kind: 'walk', lineage: undefined }
  state.decisions.set(rowPointer, decision)
  return decision
}

export function ensureNode(nodes: Map<string, DraftNode>, pointer: string): DraftNode {
  let node = nodes.get(pointer)
  if (!node) {
    node = { constraints: {}, active: false, annotations: {} }
    nodes.set(pointer, node)
  }
  return node
}

export function addChild(
  nodes: Map<string, DraftNode>,
  pointer: string,
  key: string,
  required: boolean,
  escaped?: string,
  modifyExisting = true,
  /**
   * The same requirement seen from a provisionally selected branch. Kept apart
   * from `required`, which means the validator is asking for the property now.
   */
  provisionalRequired = false,
): void {
  const node = ensureNode(nodes, pointer)
  node.children ??= []
  const existing = node.children.find((c) => c.key === key)
  if (!existing) {
    const seg = escaped ?? escapeSegment(key)
    node.children.push({
      pointer: `${pointer}/${seg}` as JsonPointer,
      key,
      required,
      provisionalRequired: provisionalRequired || undefined,
    })
  } else {
    if (required && modifyExisting) existing.required = true
    // A provisional requirement may be recorded on a child another branch
    // created, since that is the branch the user is being shown.
    if (provisionalRequired && !existing.required) existing.provisionalRequired = true
  }
}

export function resolveShapes(nodes: Map<string, DraftNode>): void {
  for (const node of nodes.values()) {
    if (node.type !== undefined) continue
    const shape = node.families && shapeOfFamilies(node.families)
    node.type = shape?.kind === 'resolved' ? shape.type : inactiveType(node)
  }
}

function inactiveType(node: DraftNode): JsonSchemaType | undefined {
  const candidates = [...(node.inactiveTypes ?? [])]
  if (candidates.length === 1) return candidates[0]
  if (!node.children?.length) return undefined
  if (candidates.includes('object')) return 'object'
  const containers = candidates.filter(isContainerType)
  return containers.length === 1 ? containers[0] : undefined
}

const isContainerType = (type: JsonSchemaType | undefined): boolean => type === 'object' || type === 'array'

const parentOf = (pointer: string): string => pointer.slice(0, pointer.lastIndexOf('/'))

export function finalizeNodes(
  nodes: Map<string, DraftNode>,
  cycles: ReadonlySet<string>,
): { projected: Map<JsonPointer, NodeProjection>; diagnostics: ProjectionDiagnostic[] } {
  const omitted = new Map<string, boolean>()
  const reachable = (pointer: string): boolean =>
    pointer === '' || (!isOmitted(parentOf(pointer)) && isContainerType(nodes.get(parentOf(pointer))?.type))
  const isOmitted = (pointer: string): boolean => {
    let result = omitted.get(pointer)
    if (result === undefined) {
      result = nodes.get(pointer)?.type === undefined || !reachable(pointer)
      omitted.set(pointer, result)
    }
    return result
  }
  const projected = new Map<JsonPointer, NodeProjection>()
  const diagnostics: ProjectionDiagnostic[] = []
  for (const [pointer, node] of nodes) {
    if (isOmitted(pointer)) {
      const shape = node.families && shapeOfFamilies(node.families)
      const unselectedComposition = node.composed && node.families?.size === 0
      if (reachable(pointer) && shape && shape.kind !== 'resolved' && !cycles.has(pointer) && !unselectedComposition) {
        diagnostics.push(shapeDiagnostic(pointer as JsonPointer, shape, node.enumValues !== undefined))
      }
      continue
    }
    projected.set(pointer as JsonPointer, {
      type: node.type!,
      format: node.format,
      constraints: node.constraints,
      children: node.type === 'object' ? node.children : undefined,
      enumValues: node.enumValues,
      active: node.active,
      // Belt and braces: `provisional` is only ever set on the branch that runs
      // when `active` is false, so no walk can reach here with both, and
      // dropping the guard changes no observable behaviour.
      provisional: node.active ? undefined : node.provisional,
      annotations: node.annotations,
      ...(node.boundaries && node.boundaries.length > 0 ? { boundaries: node.boundaries } : {}),
      ...(node.boundaryTargets && node.boundaryTargets.length > 0
        ? { boundaryTargets: node.boundaryTargets }
        : {}),
      ...(node.recursiveExpansion ? { recursiveExpansion: true as const } : {}),
      ...(node.defaultSources !== undefined ? { defaultSources: node.defaultSources } : {}),
    })
  }
  return { projected, diagnostics }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function matchesPatternProperty(schema: Record<string, unknown>, key: string): boolean {
  if (!isRecord(schema.patternProperties)) return false
  return Object.keys(schema.patternProperties).some((pattern) => new RegExp(pattern, 'u').test(key))
}

function additionalPropertyKeys(
  schema: Record<string, unknown>,
  data: unknown,
  requiredAtLocation: ReadonlySet<string> = new Set(),
): string[] {
  if (!isRecord(schema.additionalProperties)) return []
  const keys = new Set<string>(isRecord(data) ? Object.keys(data) : [])
  if (Array.isArray(schema.required)) {
    for (const key of schema.required) if (typeof key === 'string') keys.add(key)
  }
  for (const key of requiredAtLocation) keys.add(key)
  const properties = isRecord(schema.properties) ? schema.properties : {}
  return [...keys].filter(
    (key) => !Object.hasOwn(properties, key) && !matchesPatternProperty(schema, key),
  )
}

function requiredAtLocation(info: LocationInfo, rootSchema: unknown): Set<string> {
  const keys = new Set<string>()
  for (const position of info.expanded) {
    const schema = schemaAtPosition(rootSchema, position)
    if (!isRecord(schema) || !Array.isArray(schema.required)) continue
    for (const key of schema.required) if (typeof key === 'string') keys.add(key)
  }
  return keys
}

function applicableRequiredAtLocation(
  info: LocationInfo,
  rootSchema: unknown,
  data: unknown,
  instancePointer: string,
  isBranchActive: BranchChecker,
): Set<string> {
  const keys = new Set<string>()
  for (const position of info.expanded) {
    const segments = schemaPositionSegments(position)
    let applicable = true
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]!
      const previous = segments[index - 1]
      const parentSchemaPointer = (end: number): string => schemaParentPosition(position, end)
      if (segment === 'if') {
        applicable = false
        break
      }
      if (
        (segment === 'then' || segment === 'else') &&
        !isBranchActive(parentSchemaPointer(index), instancePointer, `/${segment}`)
      ) {
        applicable = false
        break
      }
      if (previous === 'oneOf' || previous === 'anyOf') {
        const parent = parentSchemaPointer(index - 1)
        if (!isBranchActive(parent, instancePointer, `/${previous}/${segment}`)) {
          applicable = false
          break
        }
      }
      if (previous === 'dependentSchemas' || previous === 'dependencies') {
        const dependency = segment.replace(/~1/g, '/').replace(/~0/g, '~')
        if (!isRecord(data) || !Object.hasOwn(data, dependency)) {
          applicable = false
          break
        }
      }
    }
    if (!applicable) continue
    const schema = schemaAtPosition(rootSchema, position)
    if (!isRecord(schema) || !Array.isArray(schema.required)) continue
    for (const key of schema.required) if (typeof key === 'string') keys.add(key)
  }
  return keys
}

/**
 * Resolves a raw `type` keyword value (string or array form) to the single
 * JsonSchemaType the projection surfaces. A type array's non-null entry wins over
 * `null` when both are present, since `["null", "string"]` describes an optional
 * field whose meaningful shape for rendering is the non-null branch; `null` is
 * only returned when it is the sole valid entry.
 */
export function resolveTypeValue(type: unknown): JsonSchemaType | undefined {
  if (Array.isArray(type)) {
    return (
      type.find((t): t is JsonSchemaType => VALID_TYPES.has(t as JsonSchemaType) && t !== 'null') ??
      type.find((t): t is JsonSchemaType => VALID_TYPES.has(t as JsonSchemaType))
    )
  }
  if (typeof type === 'string' && VALID_TYPES.has(type as JsonSchemaType)) {
    return type as JsonSchemaType
  }
  return undefined
}

function resolveType(schema: Record<string, unknown>): JsonSchemaType | undefined {
  return resolveTypeValue(schema.type)
}

/**
 * Fills structural gaps (type, format, constraints, enum) on `node` from `schema`'s
 * directly-declared keywords. Existing values are never overwritten: the data-driven
 * pass is authoritative, and within the static walk the active-first traversal order
 * guarantees the selected branch writes before any inactive sibling.
 */
function applyStaticStructure(
  node: DraftNode,
  schema: Record<string, unknown>,
  exposed: boolean,
  conditional: boolean,
  referenceHasNoShape: boolean,
): void {
  const type = resolveType(schema)
  if (type !== undefined && node.type === undefined) {
    if (exposed) node.type = type
    else (node.inactiveTypes ??= new Set()).add(type)
  }
  if (node.type === undefined && type === undefined && !conditional && !referenceHasNoShape) {
    const families = (node.families ??= new Set())
    for (const family of projectionTypeFamilies(schema)) families.add(family)
  }
  if (typeof schema.format === 'string' && node.format === undefined) node.format = schema.format
  for (const key of CONSTRAINT_KEYS) {
    const value = schema[key]
    if (value !== undefined && (node.constraints as Record<string, unknown>)[key] === undefined) {
      ;(node.constraints as Record<string, unknown>)[key] = value
    }
  }
  if (Array.isArray(schema.enum) && !node.enumValues) {
    node.enumValues = schema.enum.map((value) => ({ value }))
  }
}

/**
 * Fills annotation gaps (title, description, default, etc.) on `node` from `schema`.
 * Unlike applyStaticStructure, the caller only applies this for a currently-active
 * branch: annotations are exactly the keywords hyperjump's own data-driven pass
 * suppresses for a failed branch (via the plugin's beforeSchema/afterSchema valid
 * gating), so this static backfill preserves that same suppression for the branches
 * it visits that the data does not currently select.
 */
function applyStaticAnnotations(node: DraftNode, schema: Record<string, unknown>): void {
  for (const key of ANNOTATION_KEYS) {
    const value = schema[key]
    if (value !== undefined && (node.annotations as Record<string, unknown>)[key] === undefined) {
      ;(node.annotations as Record<string, unknown>)[key] = value
    }
  }
}

function resolveRef(
  schema: Record<string, unknown>,
  rootSchema: unknown,
  schemaPointer?: string,
  dialect: Dialect = 'draft-07',
): { pointer: string; schema: Record<string, unknown> } | undefined {
  const pointer = refTargets(schema, rootSchema, schemaPointer, dialect)[0]
  if (pointer === undefined) return undefined
  const target = schemaAtPosition(rootSchema, pointer)
  if (!isRecord(target)) return undefined
  return { pointer, schema: target }
}

function resolveRefs(
  schema: Record<string, unknown>,
  rootSchema: unknown,
  schemaPointer: string,
  dialect: Dialect,
): Array<{ pointer: string; schema: Record<string, unknown> }> {
  const result: Array<{ pointer: string; schema: Record<string, unknown> }> = []
  for (const pointer of refTargets(schema, rootSchema, schemaPointer, dialect)) {
    const target = schemaAtPosition(rootSchema, pointer)
    if (isRecord(target)) result.push({ pointer, schema: target })
  }
  return result
}

/**
 * Answers "is this if/then/else/oneOf/anyOf branch currently selected", given the
 * schema-document pointer and instance pointer the branch construct is evaluated
 * at. `then`/`else` resolve through the *if* scope's own local validity (if
 * matched -> then selected, if didn't match -> else selected) rather than the
 * branch's own validity, since a selected-but-incomplete "then" (e.g. missing one
 * of its own required fields, the normal state of a form mid-edit) must still
 * read as selected. oneOf/anyOf branches use their own scope's local validity
 * directly, since each branch is independently evaluated whether or not the
 * instance as a whole satisfies "exactly one" or "at least one". A `oneOf`
 * branch that no data selects may still be exposed provisionally, which
 * `staticWalk` decides rather than this.
 */
export type BranchChecker = (schemaPointer: string, instancePointer: string, suffix: string) => boolean

export function liveBranch(schema: Record<string, unknown>): 'then' | 'else' | undefined {
  if (typeof schema.if !== 'boolean') return undefined
  const keyword = schema.if ? 'then' : 'else'
  return isRecord(schema[keyword]) ? keyword : undefined
}

/**
 * Walks the raw schema document statically (no data evaluation) to backfill
 * declared-but-currently-unfilled fields: optional properties nobody has typed
 * into yet, and fields in an if/then/else/oneOf/anyOf/dependentSchemas branch
 * that is currently selected but fired no keyword of its own (an empty object
 * still needs to render its title/description before the user has entered
 * anything).
 *
 * Unlike the data-driven pass, this walk also follows local $ref (including
 * recursive $ref, which `decideMember` bounds past the data) and
 * recurses into items/prefixItems for array indices the instance data
 * actually has. `schemaPointer` tracks the position in the schema *document*
 * (reset to the $ref target on follow) separately from `pointer`, the instance
 * position, since the two diverge under $ref and are both needed: `pointer` for
 * the projection's node keys and array-index-driven recursion, `schemaPointer`
 * to look up a branch construct's own evaluated scope via `isBranchActive`.
 */
export function staticWalk(
  schema: unknown,
  data: unknown,
  pointer: string,
  schemaPointer: string,
  active: boolean,
  /**
   * Whether a provisionally selected branch exposes this node. Never true
   * together with `active`: the first is what the schema says applies, the
   * second is what the projection selected so the user can complete it.
   */
  provisional: boolean,
  isBranchActive: BranchChecker,
  nodes: Map<string, DraftNode>,
  visited: Set<string>,
  rootSchema: unknown,
  recursion: RecursionState,
  /** The schema positions that declare this location, which is what its identity is taken from. */
  declaring: readonly string[],
  /** This location and its past-the-data ancestors, nearest first; undefined unless it is past the data. */
  lineage: Lineage | undefined,
  path: readonly number[],
  conditional = false,
  /** Instance pointer where the nearest unselected conditional branch begins. */
  inactiveConditionalPointer: string | undefined = undefined,
  inactiveConditionalRetained = false,
): void {
  if (!isRecord(schema)) return
  const referencePosition = typeof schema.$ref === 'string'
    ? schemaReferenceTarget(rootSchema, schemaPointer)
    : undefined
  const referenceTarget = referencePosition === undefined
    ? undefined
    : schemaAtPosition(rootSchema, referencePosition)
  const referenceToBoolean = typeof referenceTarget === 'boolean'
  if (referenceTarget === false && recursion.cache.dialect === 'draft-07') return

  const referenceHasNoShape =
    referenceToBoolean && Object.keys(schema).every((key) => REFERENCE_METADATA_KEYS.has(key))
  inactiveConditionalRetained =
    inactiveConditionalRetained && retainedConditionalBranch(schemaPointer, recursion.cache)
  let step = 0
  const nextPath = (): readonly number[] => [...path, step++]

  for (const ref of resolveRefs(schema, rootSchema, schemaPointer, recursion.cache.dialect)) {
    const cycleKey = `${ref.pointer}@${pointer}`
    if (visited.has(cycleKey)) continue
    visited.add(cycleKey)
    staticWalk(
      ref.schema,
      data,
      pointer,
      ref.pointer,
      active,
      provisional,
      isBranchActive,
      nodes,
      visited,
      rootSchema,
      recursion,
      declaring,
      lineage,
      path,
      conditional,
      inactiveConditionalPointer,
      inactiveConditionalRetained,
    )
    visited.delete(cycleKey)
    if (recursion.cache.dialect === 'draft-07') return
  }

  // When an inactive branch encounters a node the base or active branch already
  // created, skip structure and annotation writes entirely so the inactive
  // sibling's metadata (constraints, format, required) cannot leak into the
  // active node. Child traversal still continues so inactive-only sub-nodes
  // (fields unique to the unselected branch) are created for skeleton rendering.
  const existed = nodes.has(pointer)
  const node = ensureNode(nodes, pointer)
  if (locationInfo(declaring, rootSchema, recursion).cyclic) recursion.onCycle.add(pointer)
  // A provisionally selected branch is shown, so it writes structure and
  // annotations like an active one. The branch order below puts it ahead of any
  // inactive sibling, so the fill-gaps-only policy keeps those from
  // contaminating what it wrote.
  const exposed = active || provisional
  if (exposed || !existed) {
    applyStaticStructure(node, schema, exposed, conditional, referenceHasNoShape)
    if (
      exposed &&
      !Array.isArray(schema.oneOf) &&
      shapeOfFamilies(projectionTypeFamilies(schema)).kind === 'resolved'
    ) {
      node.hasIndependentActiveShape = true
    }
  } else if (node.type === undefined) {
    const type = resolveType(schema)
    if (type !== undefined) (node.inactiveTypes ??= new Set()).add(type)
  }
  if (active) {
    node.active = true
    applyStaticAnnotations(node, schema)
  } else if (provisional) {
    node.provisional = true
    applyStaticAnnotations(node, schema)
  }
  // Preserve the inactive node itself. Its nested conditions stop at a child
  // location already supplied by an active declaration, while same-location
  // branch conditions remain available for skeleton projection.
  const suppressNestedInactiveBranches =
    inactiveConditionalPointer !== undefined &&
    pointer !== inactiveConditionalPointer &&
    !inactiveConditionalRetained &&
    !active &&
    !provisional &&
    existed &&
    node.active
  const properties = isRecord(schema.properties) ? schema.properties : {}
  const location = locationInfo(declaring, rootSchema, recursion)
  const required = new Set<string>(
    Array.isArray(schema.required) ? (schema.required as string[]) : [],
  )
  const applicableRequired = applicableRequiredAtLocation(
    location,
    rootSchema,
    data,
    pointer,
    isBranchActive,
  )
  const propertyKeys = new Set(Object.keys(properties))
  for (const key of additionalPropertyKeys(schema, data, requiredAtLocation(location, rootSchema))) propertyKeys.add(key)
  for (const key of propertyKeys) {
    const declared = Object.hasOwn(properties, key)
    const sub = declared ? properties[key] : schema.additionalProperties
    const keyPresent = isRecord(data) && Object.hasOwn(data, key)
    const childActive = active && (declared || keyPresent || applicableRequired.has(key))
    const escaped = escapeSegment(key)
    const childData = isRecord(data) ? data[key] : undefined
    const childPointer = `${pointer}/${escaped}`
    const childSchemaPointer = declared
      ? `${schemaPointer}/properties/${escaped}`
      : `${schemaPointer}/additionalProperties`
    const memberDeclaring = childDeclaring(location, key, rootSchema)
    const decision = decideMember(recursion, pointer, childPointer, childData, memberDeclaring, rootSchema, lineage, 'enqueue')
    if (decision !== 'defer' && decision.kind === 'skip') continue
    // Gated on the branch applying. A branch that does not apply demands
    // nothing, so a provisionally selected one demands it of the user
    // without the validator asking yet.
    addChild(
      nodes,
      pointer,
      key,
      active && applicableRequired.has(key),
      escaped,
      active,
      provisional && required.has(key),
    )
    const childPath = nextPath()
    const enter = (settled: Decision): void => {
      if (settled.kind === 'skip') return
      staticWalk(
        sub,
        childData,
        childPointer,
        childSchemaPointer,
        childActive,
        provisional,
        isBranchActive,
        nodes,
        decision === 'defer' ? new Set() : visited,
        rootSchema,
        recursion,
        memberDeclaring,
        settled.lineage,
        childPath,
        false,
        inactiveConditionalPointer,
        inactiveConditionalRetained,
      )
    }
    if (decision === 'defer') {
      ;(recursion.queue[lineage!.depth] ??= []).push({
        path: childPath,
        enter: () => {
          const settled = decideMember(recursion, pointer, childPointer, childData, memberDeclaring, rootSchema, lineage, 'dequeue', isLeafSchema(sub, rootSchema, memberDeclaring[0], recursion.cache.dialect))
          if (settled !== 'defer') enter(settled)
        },
      })
    } else enter(decision)
  }

  // allOf branches always inherit the parent's active flag (they are
  // unconditional applicators, not dynamic selection), so they are walked
  // inline before the conditional constructs.
  if (Array.isArray(schema.allOf)) {
    schema.allOf.forEach((branch: unknown, i: number) => {
      staticWalk(
        branch,
        data,
        pointer,
        `${schemaPointer}/allOf/${i}`,
        active,
        provisional,
        isBranchActive,
        nodes,
        visited,
        rootSchema,
        recursion,
        declaring,
        lineage,
        nextPath(),
        conditional,
        inactiveConditionalPointer,
        inactiveConditionalRetained,
      )
    })
  }
  const live = liveBranch(schema)
  if (live !== undefined && !suppressNestedInactiveBranches) {
    staticWalk(
      schema[live],
      data,
      pointer,
      `${schemaPointer}/${live}`,
      active,
      provisional,
      isBranchActive,
      nodes,
      visited,
      rootSchema,
      recursion,
      declaring,
      lineage,
      nextPath(),
      true,
      inactiveConditionalPointer,
      inactiveConditionalRetained,
    )
  }

  // `items` is a single subschema in 2019-09+ (paired with `prefixItems` for the tuple
  // positions) but a positional tuple array in its own right in draft-07; both forms are
  // supported so a filled array's existing elements get the same optional-field backfill
  // an object's properties get.
  const prefixItems = Array.isArray(schema.prefixItems) ? schema.prefixItems : undefined
  const tupleItems = Array.isArray(schema.items) ? schema.items : undefined
  const singleItems = !tupleItems && schema.items !== undefined ? schema.items : undefined
  const walkRows = (createOnly: boolean): void => {
    if (!((singleItems !== undefined || prefixItems || tupleItems) && Array.isArray(data))) return
    data.forEach((item: unknown, index: number) => {
      const tuple = prefixItems?.[index] != null ? 'prefixItems' : tupleItems?.[index] != null ? 'items' : undefined
      const itemSchema = tuple === undefined ? singleItems : (schema[tuple] as unknown[])[index]
      const itemSchemaPointer = tuple === undefined ? `${schemaPointer}/items` : `${schemaPointer}/${tuple}/${index}`
      if (itemSchema !== undefined) {
        const rowDeclaring = tuple !== undefined
          ? [`#${itemSchemaPointer}`]
          : itemDeclaring(locationInfo(declaring, rootSchema, recursion), rootSchema)
        const decision = decideRow(recursion, `${pointer}/${index}`, rowDeclaring, rootSchema)
        if (decision.kind === 'skip') return
        if (createOnly) {
          if (isRecord(itemSchema)) ensureNode(nodes, `${pointer}/${index}`)
          return
        }
        staticWalk(
          itemSchema,
          item,
          `${pointer}/${index}`,
          itemSchemaPointer,
          active,
          provisional,
          isBranchActive,
          nodes,
          visited,
          rootSchema,
          recursion,
          rowDeclaring,
          undefined,
          nextPath(),
          false,
          inactiveConditionalPointer,
          inactiveConditionalRetained,
        )
      }
    })
  }
  if (exposed) walkRows(true)
  // Complete declared rows before dynamic siblings so an inactive branch cannot
  // supply the first shape family for a typeless property already in that row.
  walkRows(false)

  // Dynamic branches (if/then/else, oneOf, anyOf, dependentSchemas, dependencies)
  // are collected across all constructs at this schema level and sorted active
  // first, then provisional, then inactive. That order guarantees a branch that
  // is shown writes its structure before any branch that is not, and the
  // fill-gaps-only policy in applyStaticStructure keeps the rest from
  // contaminating it, even across different constructs at the same level.
  const dynamicBranches: Array<{
    schema: unknown
    schemaPointer: string
    active: boolean
    provisional: boolean
    composition?: boolean
    conditional: boolean
  }> = []

  if (isRecord(schema.if) && (isRecord(schema.then) || isRecord(schema.else))) {
    // The local fact is which branch the *if* scope selects, which is
    // independent of whether this node is active. Reading it separately is what
    // keeps an exposed ancestor from exposing both branches: inheriting
    // `provisional` wholesale would show `then` and `else` at once.
    const thenLocal = isBranchActive(schemaPointer, pointer, '/then')
    const elseLocal = isBranchActive(schemaPointer, pointer, '/else')
    if (isRecord(schema.then)) {
      dynamicBranches.push({
        schema: schema.then,
        schemaPointer: `${schemaPointer}/then`,
        active: active && thenLocal,
        provisional: !active && provisional && thenLocal,
        conditional: true,
      })
    }
    if (isRecord(schema.else)) {
      dynamicBranches.push({
        schema: schema.else,
        schemaPointer: `${schemaPointer}/else`,
        active: active && elseLocal,
        provisional: !active && provisional && elseLocal,
        conditional: true,
      })
    }
  }

  if (Array.isArray(schema.oneOf)) {
    const branches = schema.oneOf as unknown[]
    const branchLocal = branches.map((_, i) =>
      isBranchActive(schemaPointer, pointer, `/oneOf/${i}`),
    )
    // Provisional selection runs only where the evaluator selected nothing,
    // which is the state issue #120 is about. A resolved branch is fully valid,
    // so it accepts every present discriminator and the selector would return
    // that same branch anyway.
    const selected =
      (active || provisional) && !branchLocal.some(Boolean)
        ? selectProvisionalBranch(branches, data, rootSchema)
        : undefined
    branches.forEach((branch, i) => {
      const branchActive = active && branchLocal[i]!
      dynamicBranches.push({
        schema: branch,
        schemaPointer: `${schemaPointer}/oneOf/${i}`,
        composition: true,
        conditional,
        active: branchActive,
        // Selection is local. An exposed ancestor lets a branch be shown; it
        // does not choose it, or every nested branch would be exposed at once,
        // which is the guessing the narrow rule exists to avoid.
        provisional: !branchActive && (i === selected || (provisional && branchLocal[i]!)),
      })
    })
  }

  if (Array.isArray(schema.anyOf)) {
    // `anyOf` gets no provisional selection: several of its branches may
    // legitimately apply at once, so "which one does the user mean" is a
    // different question with a different answer. A branch of it is therefore
    // active when it is valid and nothing otherwise.
    ;(schema.anyOf as unknown[]).forEach((branch, i) => {
      const branchLocal = isBranchActive(schemaPointer, pointer, `/anyOf/${i}`)
      dynamicBranches.push({
        schema: branch,
        schemaPointer: `${schemaPointer}/anyOf/${i}`,
        composition: true,
        conditional,
        active: active && branchLocal,
        provisional: !active && provisional && branchLocal,
      })
    })
  }

  if (recursion.cache.dialect !== 'draft-07' && isRecord(schema.dependentSchemas)) {
    for (const [key, branch] of Object.entries(schema.dependentSchemas)) {
      const keyPresent = isRecord(data) && key in data
      dynamicBranches.push({
        schema: branch,
        schemaPointer: `${schemaPointer}/dependentSchemas/${escapeSegment(key)}`,
        active: active && keyPresent,
        provisional: !(active && keyPresent) && provisional && keyPresent,
        conditional: true,
      })
    }
  }

  // draft-07 schema-form `dependencies`: hyperjump keeps the raw document as authored,
  // so draft-07 fixtures carry the keyword under its original name. The property-list
  // form only affects `required` and has no sub-schema to walk.
  if (isRecord(schema.dependencies)) {
    for (const [key, branch] of Object.entries(schema.dependencies)) {
      if (!isRecord(branch)) continue
      const keyPresent = isRecord(data) && key in data
      dynamicBranches.push({
        schema: branch,
        schemaPointer: `${schemaPointer}/dependencies/${escapeSegment(key)}`,
        active: active && keyPresent,
        provisional: !(active && keyPresent) && provisional && keyPresent,
        conditional: true,
      })
    }
  }

  if (
    (exposed || !existed) &&
    !node.composed &&
    !dynamicBranches.some((db) => db.composition && (db.active || db.provisional))
  ) {
    const hasRenderableComposition = hasRenderableAlternative(schema, rootSchema)
    if (hasRenderableComposition) {
      node.composed = true
    } else if (!dynamicBranches.some((db) => db.active || db.provisional) && node.type === undefined) {
      const ambiguousFamilies = ambiguousAlternativeFamilies(schema, rootSchema)
      if (ambiguousFamilies.size > 0) {
        const families = (node.families ??= new Set())
        for (const family of ambiguousFamilies) families.add(family)
      }
    }
  }

  dynamicBranches.sort(
    (a, b) =>
      Number(b.active) - Number(a.active) || Number(b.provisional) - Number(a.provisional),
  )
  if (!suppressNestedInactiveBranches) {
    for (const db of dynamicBranches) {
      const inactiveConditional = db.conditional && !db.active && !db.provisional
      const retained = inactiveConditional && retainedConditionalBranch(db.schemaPointer, recursion.cache)
      staticWalk(
        db.schema,
        data,
        pointer,
        db.schemaPointer,
        db.active,
        db.provisional,
        isBranchActive,
        nodes,
        visited,
        rootSchema,
        recursion,
        declaring,
        lineage,
        nextPath(),
        db.conditional,
        inactiveConditional ? pointer : inactiveConditionalPointer,
        inactiveConditional ? retained : inactiveConditionalRetained,
      )
    }
  }

  // A resolved shape from another applicable declaration keeps a container active
  // when an unselected oneOf wrapper appears at the same instance location.
  const derivedShape = node.hasIndependentActiveShape === true
  if (
    node.type === undefined &&
    resolveType(schema) === undefined &&
    !derivedShape &&
    dynamicBranches.length > 0 &&
    !dynamicBranches.some((db) => db.active || db.provisional)
  ) {
    node.active = false
  }

}

/**
 * The index of the `oneOf` branch the current data uniquely identifies, when
 * the evaluator selected none.
 *
 * The same rule `@texaryn/schema-json` implements, over the raw document rather
 * than a compiled node. Two copies of a rule is a drift risk, and what keeps
 * them honest is that the shared port conformance suite asserts it against both
 * adapters rather than each adapter asserting its own behaviour.
 *
 * - only an explicit `const` or `enum` on a property discriminates, and both
 *   together are conjunctive
 * - the key has to be constrained by every branch, so one branch cannot
 *   nominate itself by being the only one to mention it
 * - the discriminator has to be present in the data by own-property presence,
 *   never read from a `default` annotation
 * - every present discriminator has to agree, and zero or several surviving
 *   branches select nothing
 *
 * Nothing else about a branch participates: it stays identified when another
 * constraint of its own fails, or selection would quietly become validity again
 * and the field that completes the branch would stay hidden for a second
 * reason.
 */
export function selectProvisionalBranch(
  branches: readonly unknown[],
  data: unknown,
  rootSchema: unknown,
): number | undefined {
  if (!isRecord(data)) return undefined

  const resolved = branches.map((branch) => resolveBranch(branch, rootSchema))
  const discriminators = discriminatorKeys(resolved, rootSchema).filter((key) =>
    Object.prototype.hasOwnProperty.call(data, key),
  )
  if (discriminators.length === 0) return undefined

  const accepted: number[] = []
  resolved.forEach((branch, index) => {
    if (discriminators.every((key) => branchAccepts(branch, key, rootSchema, data[key]))) {
      accepted.push(index)
    }
  })
  return accepted.length === 1 ? accepted[0] : undefined
}

function hasRenderableAlternative(schema: Record<string, unknown>, rootSchema: unknown): boolean {
  return branchesOf(schema).some((branch) => canRender(branch, rootSchema, new Set()))
}

function ambiguousAlternativeFamilies(
  schema: Record<string, unknown>,
  rootSchema: unknown,
): Set<KeywordFamily> {
  const ambiguous = new Set<KeywordFamily>()
  for (const branch of branchesOf(schema)) {
    const members = allOfClosure(branch, rootSchema, new Set())
    if (members.some((member) => resolveType(member) !== undefined)) continue
    const families = new Set(members.flatMap((member) => [...projectionTypeFamilies(member)]))
    if (shapeOfFamilies(families).kind === 'ambiguous') {
      for (const family of families) ambiguous.add(family)
    }
  }
  return ambiguous
}

const branchesOf = (schema: Record<string, unknown>): unknown[] =>
  [schema.oneOf, schema.anyOf].flatMap((list) => (Array.isArray(list) ? list : []))

function canRender(branch: unknown, rootSchema: unknown, path: ReadonlySet<Record<string, unknown>>): boolean {
  const members = allOfClosure(branch, rootSchema, path)
  if (members.some((member) => resolveType(member) !== undefined)) return true
  const families = new Set(members.flatMap((member) => [...projectionTypeFamilies(member)]))
  if (shapeOfFamilies(families).kind === 'resolved') return true
  const inPath = new Set([...path, ...members])
  return (
    families.size === 0 &&
    members.some((member) => branchesOf(member).some((inner) => canRender(inner, rootSchema, inPath)))
  )
}

function allOfClosure(
  branch: unknown,
  rootSchema: unknown,
  path: ReadonlySet<Record<string, unknown>>,
): Record<string, unknown>[] {
  const target = resolveBranch(branch, rootSchema)
  if (target === undefined || path.has(target)) return []
  const inPath = new Set(path).add(target)
  const members = Array.isArray(target.allOf) ? target.allOf : []
  return [target, ...members.flatMap((member) => allOfClosure(member, rootSchema, inPath))]
}

function resolveBranch(branch: unknown, rootSchema: unknown): Record<string, unknown> | undefined {
  if (!isRecord(branch)) return undefined
  const ref = resolveRef(branch, rootSchema)
  const target = ref ? ref.schema : branch
  return isRecord(target) ? target : undefined
}

/** Keys every branch constrains with `const` or `enum`. */
function discriminatorKeys(
  branches: readonly (Record<string, unknown> | undefined)[],
  rootSchema: unknown,
): string[] {
  const first = branches[0]
  if (!first || !isRecord(first.properties)) return []
  const shared = Object.keys(first.properties).filter((key) =>
    isDiscriminator(first, key, rootSchema),
  )
  return shared.filter((key) =>
    branches.every((branch) => isDiscriminator(branch, key, rootSchema)),
  )
}

function discriminatorSchema(
  branch: Record<string, unknown> | undefined,
  key: string,
  rootSchema: unknown,
): Record<string, unknown> | undefined {
  if (!branch || !isRecord(branch.properties)) return undefined
  const property = branch.properties[key]
  if (!isRecord(property)) return undefined
  const ref = resolveRef(property, rootSchema)
  const target = ref ? ref.schema : property
  return isRecord(target) ? target : undefined
}

/**
 * Discovery has to resolve a local `$ref` the same way acceptance does, or a
 * discriminator declared through one is never recognised as a candidate and the
 * rule would depend on how the author factored the document.
 */
function isDiscriminator(
  branch: Record<string, unknown> | undefined,
  key: string,
  rootSchema: unknown,
): boolean {
  const schema = discriminatorSchema(branch, key, rootSchema)
  if (!schema) return false
  return 'const' in schema || Array.isArray(schema.enum)
}

/** `const` and `enum` are separate constraints, so a value has to satisfy both. */
function branchAccepts(
  branch: Record<string, unknown> | undefined,
  key: string,
  rootSchema: unknown,
  value: unknown,
): boolean {
  const schema = discriminatorSchema(branch, key, rootSchema)
  if (!schema) return false
  if ('const' in schema && !deepEqual(schema.const, value)) return false
  if (Array.isArray(schema.enum) && !schema.enum.some((member) => deepEqual(member, value))) {
    return false
  }
  return true
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]))
  }
  if (isRecord(a) && isRecord(b)) {
    const left = Object.keys(a)
    const right = Object.keys(b)
    return (
      left.length === right.length &&
      left.every(
        (key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]),
      )
    )
  }
  return false
}

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
  ProjectionDiagnostic,
} from '@texaryn/core'
import { compareCodeUnits } from './string-order.js'
import { isPre2019Dialect, type Dialect } from './dialect.js'
import {
  projectionTypeFamilies,
  shapeDiagnostic,
  shapeOfFamilies,
  type KeywordFamily,
  type ProjectionShape,
} from './projection-shape.js'
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

interface LeafWalkState {
  rootSchema: unknown
  dialect: Dialect
  pending: Array<{ schema: unknown; position?: string }>
  seenPositions: Set<string>
  seenSchemas: WeakSet<object>
}

function isLeafSchema(schema: unknown, rootSchema: unknown, position?: string, dialect: Dialect = 'draft-07'): boolean {
  const state: LeafWalkState = {
    rootSchema,
    dialect,
    pending: [],
    seenPositions: new Set(),
    seenSchemas: new WeakSet(),
  }
  enqueueLeafSchema(state, schema, position)
  while (state.pending.length > 0) {
    const current = state.pending.pop()!
    if (!isRecord(current.schema)) continue
    const record = current.schema
    const targets = refTargets(record, state.rootSchema, current.position, state.dialect)
    if (followLeafReferencesFirst(targets, state)) {
      enqueueLeafReferences(state, targets)
      continue
    }
    if (state.dialect === 'draft-07') {
      if (!isDraft07Leaf(record)) return false
      continue
    }
    if (hasObjectProjectionShape(record)) return false
    enqueueLeafReferences(state, targets)
    enqueueLeafApplicators(state, record, current.position)
    enqueueLeafConditionals(state, record, current.position)
    enqueueLeafDependencies(state, record, current.position)
  }
  return true
}

function enqueueLeafSchema(state: LeafWalkState, schema: unknown, position?: string): void {
  if (schema !== null && typeof schema === 'object') {
    if (position !== undefined) {
      if (state.seenPositions.has(position)) return
      state.seenPositions.add(position)
    } else {
      if (state.seenSchemas.has(schema)) return
      state.seenSchemas.add(schema)
    }
  }
  state.pending.push({ schema, position })
}

function followLeafReferencesFirst(targets: readonly string[], state: LeafWalkState): boolean {
  return targets.length > 0 && isPre2019Dialect(state.dialect)
}

function enqueueLeafReferences(state: LeafWalkState, targets: readonly string[]): void {
  for (const target of targets) enqueueLeafSchema(state, schemaAtPosition(state.rootSchema, target), target)
}

function isDraft07Leaf(record: Record<string, unknown>): boolean {
  // ADR-007 keeps typeless Draft 7 compositions conservative for budgeting.
  const type = Array.isArray(record.type)
    ? record.type.find((value) => VALID_TYPES.has(value as JsonSchemaType))
    : record.type
  if (typeof type === 'string') return type !== 'object'
  if (('enum' in record || 'const' in record) && !('properties' in record)) return true
  return false
}

function hasObjectProjectionShape(record: Record<string, unknown>): boolean {
  const types = Array.isArray(record.type) ? record.type : [record.type]
  return types.includes('object') || projectionTypeFamilies(record).has('object')
}

function enqueueLeafApplicators(
  state: LeafWalkState,
  record: Record<string, unknown>,
  position: string | undefined,
): void {
  for (const keyword of ['allOf', 'oneOf', 'anyOf'] as const) {
    const branches = record[keyword]
    if (!Array.isArray(branches)) continue
    branches.forEach((branch: unknown, index: number) =>
      enqueueLeafSchema(
        state,
        branch,
        position === undefined ? undefined : `${position}/${keyword}/${index}`,
      ),
    )
  }
}

function enqueueLeafConditionals(
  state: LeafWalkState,
  record: Record<string, unknown>,
  position: string | undefined,
): void {
  if (state.dialect === 'draft-04' || !isRecord(record.if)) return
  for (const keyword of ['then', 'else'] as const) {
    enqueueLeafSchema(
      state,
      record[keyword],
      position === undefined ? undefined : `${position}/${keyword}`,
    )
  }
}

function enqueueLeafDependencies(
  state: LeafWalkState,
  record: Record<string, unknown>,
  position: string | undefined,
): void {
  const keywords = isPre2019Dialect(state.dialect)
    ? ['dependencies'] as const
    : ['dependentSchemas', 'dependencies'] as const
  for (const keyword of keywords) {
    const map = record[keyword]
    if (!isRecord(map)) continue
    for (const [key, branch] of Object.entries(map)) {
      if (!isRecord(branch)) continue
      enqueueLeafSchema(
        state,
        branch,
        position === undefined ? undefined : `${position}/${keyword}/${escapeSegment(key)}`,
      )
    }
  }
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
    let keywords: readonly ('$ref' | '$dynamicRef' | '$recursiveRef')[]
    if (dialect === '2020-12') keywords = ['$ref', '$dynamicRef']
    else if (dialect === '2019-09') keywords = ['$ref', '$recursiveRef']
    else keywords = ['$ref']
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

// Draft 4 and Draft 7 ignore a `$ref` site's siblings, so the site adds nothing
// to an identity; from 2019-09 it adds itself when a sibling keyword applies.
function closureOf(position: string, rootSchema: unknown, cache: ProjectionCache, stack: Set<string>): readonly string[] {
  const cached = cache.closure.get(position)
  if (cached) return cached
  if (stack.has(position)) return []
  stack.add(position)
  const out = new Set<string>()
  collectPositionClosure(position, rootSchema, cache, stack, out)
  stack.delete(position)
  const result = [...out]
  cache.closure.set(position, result)
  return result
}

function collectPositionClosure(
  position: string,
  rootSchema: unknown,
  cache: ProjectionCache,
  stack: Set<string>,
  out: Set<string>,
): void {
  const schema = schemaAtPosition(rootSchema, position)
  if (typeof schema === 'boolean') {
    out.add(position)
    return
  }
  if (!isRecord(schema)) return
  collectRecordClosure(position, schema, rootSchema, cache, stack, out)
}

function collectRecordClosure(
  position: string,
  schema: Record<string, unknown>,
  rootSchema: unknown,
  cache: ProjectionCache,
  stack: Set<string>,
  out: Set<string>,
): void {
  const targets = refTargets(schema, rootSchema, position, cache.dialect)
  if (targets.length === 0) {
    out.add(position)
    appendAllOfClosure(position, schema, rootSchema, cache, stack, out)
    return
  }
  if (!isPre2019Dialect(cache.dialect)) {
    if (Object.keys(schema).some((keyword) => !NON_APPLYING.has(keyword))) out.add(position)
    appendAllOfClosure(position, schema, rootSchema, cache, stack, out)
  }
  appendReferenceClosure(targets, rootSchema, cache, stack, out)
}

function appendAllOfClosure(
  position: string,
  schema: Record<string, unknown>,
  rootSchema: unknown,
  cache: ProjectionCache,
  stack: Set<string>,
  out: Set<string>,
): void {
  if (!Array.isArray(schema.allOf)) return
  schema.allOf.forEach((_: unknown, index: number) => {
    for (const child of closureOf(`${position}/allOf/${index}`, rootSchema, cache, stack)) out.add(child)
  })
}

function appendReferenceClosure(
  targets: readonly string[],
  rootSchema: unknown,
  cache: ProjectionCache,
  stack: Set<string>,
  out: Set<string>,
): void {
  for (const target of targets) {
    for (const position of closureOf(target, rootSchema, cache, stack)) out.add(position)
  }
}

export function locationInfo(
  declaring: readonly string[],
  rootSchema: unknown,
  state: RecursionState,
): LocationInfo {
  const cache = state.cache
  const memoKey = [...declaring].sort(compareCodeUnits).join('\n')
  const cached = cache.info.get(memoKey)
  if (cached) return cached
  const identity = new Set<string>()
  for (const position of declaring) for (const p of closureOf(position, rootSchema, cache, new Set())) identity.add(p)

  const traversal: LocationTraversal = { rootSchema, cache, expanded: [], seen: new Set(), cycle: false }
  for (const position of declaring) visitLocationPosition(position, traversal, new Set())

  const info: LocationInfo = {
    key: [...identity].sort(compareCodeUnits).join('\n'),
    cycle: traversal.cycle,
    cyclic: [...identity].some((position) => cache.cyclic.has(position)),
    expanded: traversal.expanded,
    children: new Map(),
  }
  cache.info.set(memoKey, info)
  return info
}

interface LocationTraversal {
  rootSchema: unknown
  cache: ProjectionCache
  expanded: string[]
  seen: Set<string>
  cycle: boolean
}

function visitLocationPosition(
  position: string,
  traversal: LocationTraversal,
  stack: Set<string>,
): void {
  if (stack.has(position)) {
    traversal.cycle = true
    return
  }
  if (traversal.seen.has(position)) return
  traversal.seen.add(position)
  const schema = schemaAtPosition(traversal.rootSchema, position)
  if (!isRecord(schema)) return
  traversal.expanded.push(position)
  stack.add(position)
  const targets = refTargets(schema, traversal.rootSchema, position, traversal.cache.dialect)
  for (const target of targets) visitLocationPosition(target, traversal, stack)
  if (stopAtLegacyReference(targets, traversal)) {
    stack.delete(position)
    return
  }
  visitLocationConditionals(position, schema, traversal, stack)
  visitLocationApplicators(position, schema, traversal, stack)
  visitLocationDependencies(position, schema, traversal, stack)
  stack.delete(position)
}

function stopAtLegacyReference(targets: readonly string[], traversal: LocationTraversal): boolean {
  return targets.length > 0 &&
    isPre2019Dialect(traversal.cache.dialect) &&
    isRecord(schemaAtPosition(traversal.rootSchema, targets[0]!))
}

function visitLocationConditionals(
  position: string,
  schema: Record<string, unknown>,
  traversal: LocationTraversal,
  stack: Set<string>,
): void {
  const branches = traversal.cache.dialect === 'draft-04' ? [] : IN_PLACE_BRANCHES
  for (const keyword of branches) {
    if (isRecord(schema[keyword]) && !isTrivialConditional(schema, keyword)) {
      visitLocationPosition(`${position}/${keyword}`, traversal, stack)
    }
  }
}

function isTrivialConditional(
  schema: Record<string, unknown>,
  keyword: typeof IN_PLACE_BRANCHES[number],
): boolean {
  return (keyword === 'then' && (!('if' in schema) || schema.if === false)) ||
    (keyword === 'else' && (!('if' in schema) || schema.if === true))
}

function visitLocationApplicators(
  position: string,
  schema: Record<string, unknown>,
  traversal: LocationTraversal,
  stack: Set<string>,
): void {
  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const branches = schema[keyword]
    if (!Array.isArray(branches)) continue
    branches.forEach((_: unknown, index: number) =>
      visitLocationPosition(`${position}/${keyword}/${index}`, traversal, stack),
    )
  }
}

function visitLocationDependencies(
  position: string,
  schema: Record<string, unknown>,
  traversal: LocationTraversal,
  stack: Set<string>,
): void {
  const keywords = isPre2019Dialect(traversal.cache.dialect)
    ? ['dependencies'] as const
    : ['dependentSchemas', 'dependencies'] as const
  for (const keyword of keywords) {
    const map = schema[keyword]
    if (!isRecord(map)) continue
    for (const [key, branch] of Object.entries(map)) {
      if (isRecord(branch)) {
        visitLocationPosition(`${position}/${keyword}/${escapeSegment(key)}`, traversal, stack)
      }
    }
  }
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
interface MemberDecisionInput {
  state: RecursionState
  parentPointer: string
  childPointer: string
  childData: unknown
  declaring: readonly string[]
  rootSchema: unknown
  parentLineage: Lineage | undefined
  phase: 'enqueue' | 'dequeue'
  leaf?: boolean
}

function decideMember(input: MemberDecisionInput): Decision | 'defer' {
  const {
    state,
    parentPointer,
    childPointer,
    childData,
    declaring,
    rootSchema,
    parentLineage,
    phase,
    leaf = false,
  } = input
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
  const repeatedAncestor = findRepeatedAncestor(parentLineage, info.key, state, token)
  if (repeatedAncestor !== undefined) {
    addBoundary(state, repeatedAncestor, 'recursion', childPointer, info.key)
    state.pruned.add(childPointer)
    return settle({ kind: 'skip' })
  }
  if (!recursive) return settle({ kind: 'walk', lineage })
  if (phase === 'enqueue') return 'defer'
  const admit = admitRecursiveMember(input, info, token)
  if (!admit) {
    addBoundary(state, parentPointer, 'budget', childPointer, info.key)
    state.pruned.add(childPointer)
    return settle({ kind: 'skip' })
  }
  state.flagged.add(childPointer)
  return settle({ kind: 'walk', lineage })
}

function findRepeatedAncestor(
  parentLineage: Lineage,
  identity: string,
  state: RecursionState,
  token: string,
): string | undefined {
  if (identity === '' || state.expandedBoundaryTokens.has(token)) return undefined
  for (let ancestor: Lineage | undefined = parentLineage; ancestor; ancestor = ancestor.parent) {
    if (ancestor.key === identity) return ancestor.pointer
  }
  return undefined
}

function admitRecursiveMember(
  input: MemberDecisionInput,
  info: LocationInfo,
  token: string,
): boolean {
  const { state, parentPointer, childPointer, rootSchema, leaf = false } = input
  if (leaf) {
    const covered = state.reserved.has(parentPointer)
    const admit = state.expandedBoundaryTokens.has(token) || covered || state.nodesUsed < state.limits.nodes
    if (admit && !covered) state.nodesUsed += 1
    return admit
  }
  const explicitlyExpanded = state.expandedBoundaryTokens.has(token)
  const leaves = leafMembers(info, rootSchema, state.cache.dialect)
  const admit = explicitlyExpanded ||
    (state.objectsUsed < state.limits.objects && state.nodesUsed + 1 + leaves <= state.limits.nodes)
  if (!admit) return false
  state.objectsUsed += 1
  state.nodesUsed += explicitlyExpanded ? 1 : 1 + leaves
  if (!explicitlyExpanded) state.reserved.add(childPointer)
  return true
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
  const projected = new Map<JsonPointer, NodeProjection>()
  const diagnostics: ProjectionDiagnostic[] = []
  for (const [pointer, node] of nodes) {
    appendFinalizedNode(pointer, node, nodes, cycles, omitted, projected, diagnostics)
  }
  return { projected, diagnostics }
}

function appendFinalizedNode(
  pointer: string,
  node: DraftNode,
  nodes: Map<string, DraftNode>,
  cycles: ReadonlySet<string>,
  omitted: Map<string, boolean>,
  projected: Map<JsonPointer, NodeProjection>,
  diagnostics: ProjectionDiagnostic[],
): void {
  if (isNodeOmitted(pointer, nodes, omitted)) {
    appendOmittedNodeDiagnostic(pointer, node, nodes, cycles, omitted, diagnostics)
    return
  }
  projected.set(pointer as JsonPointer, projectNode(node))
}

function isNodeReachable(
  pointer: string,
  nodes: Map<string, DraftNode>,
  omitted: Map<string, boolean>,
): boolean {
  const parent = parentOf(pointer)
  return pointer === '' || (!isNodeOmitted(parent, nodes, omitted) && isContainerType(nodes.get(parent)?.type))
}

function isNodeOmitted(
  pointer: string,
  nodes: Map<string, DraftNode>,
  omitted: Map<string, boolean>,
): boolean {
  const cached = omitted.get(pointer)
  if (cached !== undefined) return cached
  const result = nodes.get(pointer)?.type === undefined || !isNodeReachable(pointer, nodes, omitted)
  omitted.set(pointer, result)
  return result
}

function appendOmittedNodeDiagnostic(
  pointer: string,
  node: DraftNode,
  nodes: Map<string, DraftNode>,
  cycles: ReadonlySet<string>,
  omitted: Map<string, boolean>,
  diagnostics: ProjectionDiagnostic[],
): void {
  const shape = node.families && shapeOfFamilies(node.families)
  const unselectedComposition = node.composed && node.families?.size === 0
  if (!isNodeReachable(pointer, nodes, omitted) || !shape || shape.kind === 'resolved') return
  if (cycles.has(pointer) || unselectedComposition) return
  diagnostics.push(shapeDiagnostic(pointer as JsonPointer, shape, node.enumValues !== undefined))
}

function projectNode(node: DraftNode): NodeProjection {
  return {
    type: node.type!,
    format: node.format,
    constraints: node.constraints,
    children: node.type === 'object' ? node.children : undefined,
    enumValues: node.enumValues,
    active: node.active,
    // A node cannot be active and provisional at the same time.
    provisional: node.active ? undefined : node.provisional,
    annotations: node.annotations,
    ...(node.boundaries && node.boundaries.length > 0 ? { boundaries: node.boundaries } : {}),
    ...(node.boundaryTargets && node.boundaryTargets.length > 0
      ? { boundaryTargets: node.boundaryTargets }
      : {}),
    ...(node.recursiveExpansion ? { recursiveExpansion: true as const } : {}),
    ...(node.defaultSources !== undefined ? { defaultSources: node.defaultSources } : {}),
  }
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
    if (!isRequiredPositionApplicable(position, data, instancePointer, isBranchActive)) continue
    addRequiredKeysAtPosition(position, rootSchema, keys)
  }
  return keys
}

function isRequiredPositionApplicable(
  position: string,
  data: unknown,
  instancePointer: string,
  isBranchActive: BranchChecker,
): boolean {
  const segments = schemaPositionSegments(position)
  for (let index = 0; index < segments.length; index += 1) {
    if (!isRequiredPathSegmentApplicable(position, segments, index, data, instancePointer, isBranchActive)) {
      return false
    }
  }
  return true
}

function isRequiredPathSegmentApplicable(
  position: string,
  segments: readonly string[],
  index: number,
  data: unknown,
  instancePointer: string,
  isBranchActive: BranchChecker,
): boolean {
  const segment = segments[index]!
  const previous = segments[index - 1]
  if (segment === 'if') return false
  if (!isConditionalPathSegmentActive(position, segment, index, instancePointer, isBranchActive)) return false
  if (!isComposedPathSegmentActive(position, previous, segment, index, instancePointer, isBranchActive)) return false
  return isDependencyPathSegmentActive(previous, segment, data)
}

function isConditionalPathSegmentActive(
  position: string,
  segment: string,
  index: number,
  instancePointer: string,
  isBranchActive: BranchChecker,
): boolean {
  if (segment !== 'then' && segment !== 'else') return true
  return isBranchActive(schemaParentPosition(position, index), instancePointer, `/${segment}`)
}

function isComposedPathSegmentActive(
  position: string,
  previous: string | undefined,
  segment: string,
  index: number,
  instancePointer: string,
  isBranchActive: BranchChecker,
): boolean {
  if (previous !== 'oneOf' && previous !== 'anyOf') return true
  const parent = schemaParentPosition(position, index - 1)
  return isBranchActive(parent, instancePointer, `/${previous}/${segment}`)
}

function isDependencyPathSegmentActive(
  previous: string | undefined,
  segment: string,
  data: unknown,
): boolean {
  if (previous !== 'dependentSchemas' && previous !== 'dependencies') return true
  const dependency = segment.replaceAll('~1', '/').replaceAll('~0', '~')
  return isRecord(data) && Object.hasOwn(data, dependency)
}

function addRequiredKeysAtPosition(
  position: string,
  rootSchema: unknown,
  keys: Set<string>,
): void {
  const schema = schemaAtPosition(rootSchema, position)
  if (!isRecord(schema) || !Array.isArray(schema.required)) return
  for (const key of schema.required) if (typeof key === 'string') keys.add(key)
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
  dialect: Dialect,
): void {
  const type = resolveType(schema)
  applyStaticType(node, type, exposed)
  applyStaticTypeFamilies(node, schema, type, conditional, referenceHasNoShape)
  applyStaticFormat(node, schema)
  applyStaticConstraints(node, schema, dialect)
  applyStaticEnumValues(node, schema)
}

function applyStaticType(node: DraftNode, type: JsonSchemaType | undefined, exposed: boolean): void {
  if (type === undefined || node.type !== undefined) return
  if (exposed) {
    node.type = type
    return
  }
  node.inactiveTypes ??= new Set()
  node.inactiveTypes.add(type)
}

function applyStaticTypeFamilies(
  node: DraftNode,
  schema: Record<string, unknown>,
  type: JsonSchemaType | undefined,
  conditional: boolean,
  referenceHasNoShape: boolean,
): void {
  if (node.type !== undefined || type !== undefined || conditional || referenceHasNoShape) return
  const families = (node.families ??= new Set())
  for (const family of projectionTypeFamilies(schema)) families.add(family)
}

function applyStaticFormat(node: DraftNode, schema: Record<string, unknown>): void {
  if (typeof schema.format === 'string' && node.format === undefined) node.format = schema.format
}

function applyStaticConstraints(node: DraftNode, schema: Record<string, unknown>, dialect: Dialect): void {
  for (const key of CONSTRAINT_KEYS) applyStaticConstraint(node, schema, key, dialect)
}

function applyStaticConstraint(
  node: DraftNode,
  schema: Record<string, unknown>,
  key: typeof CONSTRAINT_KEYS[number],
  dialect: Dialect,
): void {
  const constraints = node.constraints as Record<string, unknown>
  const value = schema[key]
  if (dialect === 'draft-04' && shouldSkipDraft04Bound(key, schema)) return
  if (dialect === 'draft-04' && isDraft04ExclusiveKey(key)) {
    applyDraft04ExclusiveConstraint(constraints, schema, key, value)
    return
  }
  if (value !== undefined && constraints[key] === undefined) constraints[key] = value
}

function shouldSkipDraft04Bound(key: string, schema: Record<string, unknown>): boolean {
  return (key === 'minimum' && schema.exclusiveMinimum === true) ||
    (key === 'maximum' && schema.exclusiveMaximum === true)
}

function isDraft04ExclusiveKey(key: string): key is 'exclusiveMinimum' | 'exclusiveMaximum' {
  return key === 'exclusiveMinimum' || key === 'exclusiveMaximum'
}

function applyDraft04ExclusiveConstraint(
  constraints: Record<string, unknown>,
  schema: Record<string, unknown>,
  key: 'exclusiveMinimum' | 'exclusiveMaximum',
  value: unknown,
): void {
  const bound = key === 'exclusiveMinimum' ? schema.minimum : schema.maximum
  if (value === true && typeof bound === 'number' && constraints[key] === undefined) {
    constraints[key] = bound
  }
}

function applyStaticEnumValues(node: DraftNode, schema: Record<string, unknown>): void {
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
export interface StaticWalkFrame {
  readonly schema: unknown
  readonly data: unknown
  readonly pointer: string
  readonly schemaPointer: string
  readonly active: boolean
  /** Whether an incompletely valid branch exposes this node for editing. */
  readonly provisional: boolean
  readonly isBranchActive: BranchChecker
  readonly nodes: Map<string, DraftNode>
  readonly visited: Set<string>
  readonly rootSchema: unknown
  readonly recursion: RecursionState
  /** Schema positions that declare this location, which defines its identity. */
  readonly declaring: readonly string[]
  /** This location and its past-the-data ancestors, nearest first. */
  readonly lineage: Lineage | undefined
  readonly path: readonly number[]
  readonly conditional?: boolean
  /** Instance pointer where the nearest unselected conditional branch begins. */
  readonly inactiveConditionalPointer?: string
  readonly inactiveConditionalRetained?: boolean
}

interface StaticWalkNodeState {
  node: DraftNode
  existed: boolean
  exposed: boolean
  suppressNestedInactiveBranches: boolean
  properties: Record<string, unknown>
  location: LocationInfo
  required: Set<string>
  applicableRequired: Set<string>
}

type PathCursor = () => readonly number[]

interface DynamicBranch {
  schema: unknown
  schemaPointer: string
  active: boolean
  provisional: boolean
  composition?: boolean
  conditional: boolean
}

export function staticWalk(frame: StaticWalkFrame): void {
  walkStaticNode(frame)
}

function referenceShape(
  schema: Record<string, unknown>,
  rootSchema: unknown,
  schemaPointer: string,
  dialect: Dialect,
): { skip: boolean; hasNoShape: boolean } {
  const referencePosition = typeof schema.$ref === 'string'
    ? schemaReferenceTarget(rootSchema, schemaPointer)
    : undefined
  const referenceTarget = referencePosition === undefined
    ? undefined
    : schemaAtPosition(rootSchema, referencePosition)
  const referenceToBoolean = typeof referenceTarget === 'boolean'
  return {
    skip: referenceTarget === false && isPre2019Dialect(dialect),
    hasNoShape: referenceToBoolean &&
      Object.keys(schema).every((key) => REFERENCE_METADATA_KEYS.has(key)),
  }
}

function walkResolvedReferences(
  frame: StaticWalkFrame,
  schema: Record<string, unknown>,
): boolean {
  for (const ref of resolveRefs(schema, frame.rootSchema, frame.schemaPointer, frame.recursion.cache.dialect)) {
    const cycleKey = `${ref.pointer}@${frame.pointer}`
    if (frame.visited.has(cycleKey)) continue
    frame.visited.add(cycleKey)
    staticWalk({ ...frame, schema: ref.schema, schemaPointer: ref.pointer })
    frame.visited.delete(cycleKey)
    if (isPre2019Dialect(frame.recursion.cache.dialect)) return false
  }
  return true
}

function prepareStaticWalkNode(
  frame: StaticWalkFrame,
  schema: Record<string, unknown>,
  referenceHasNoShape: boolean,
  inactiveConditionalRetained: boolean,
): StaticWalkNodeState {
  const { active, provisional, pointer, schemaPointer, rootSchema, recursion, declaring } = frame
  // An inactive branch must not write metadata into a node the active branch created.
  const existed = frame.nodes.has(pointer)
  const node = ensureNode(frame.nodes, pointer)
  if (locationInfo(declaring, rootSchema, recursion).cyclic) recursion.onCycle.add(pointer)
  const exposed = active || provisional
  if (exposed || !existed) {
    applyStaticStructure(node, schema, exposed, frame.conditional ?? false, referenceHasNoShape, recursion.cache.dialect)
    if (
      exposed &&
      !Array.isArray(schema.oneOf) &&
      shapeOfFamilies(projectionTypeFamilies(schema)).kind === 'resolved'
    ) {
      node.hasIndependentActiveShape = true
    }
  } else if (node.type === undefined) {
    const type = resolveType(schema)
    if (type !== undefined) {
      node.inactiveTypes ??= new Set()
      node.inactiveTypes.add(type)
    }
  }
  if (active || provisional) {
    if (active) node.active = true
    else node.provisional = true
    applyStaticAnnotations(node, schema)
  }
  // Preserve inactive nodes for skeleton rendering, while stopping their nested
  // conditions where an active declaration already supplies the child location.
  const suppressNestedInactiveBranches =
    frame.inactiveConditionalPointer !== undefined &&
    pointer !== frame.inactiveConditionalPointer &&
    !inactiveConditionalRetained &&
    !active &&
    !provisional &&
    existed &&
    node.active
  const properties = isRecord(schema.properties) ? schema.properties : {}
  const location = locationInfo(declaring, rootSchema, recursion)
  const required = new Set<string>(Array.isArray(schema.required) ? schema.required as string[] : [])
  const applicableRequired = applicableRequiredAtLocation(
    location,
    rootSchema,
    frame.data,
    pointer,
    frame.isBranchActive,
  )
  return {
    node,
    existed,
    exposed,
    suppressNestedInactiveBranches,
    properties,
    location,
    required,
    applicableRequired,
  }
}

function walkStaticNode(frame: StaticWalkFrame): void {
  const { schema, rootSchema, recursion } = frame
  if (!isRecord(schema)) return
  const reference = referenceShape(schema, rootSchema, frame.schemaPointer, recursion.cache.dialect)
  if (reference.skip) return
  const inactiveConditionalRetained =
    (frame.inactiveConditionalRetained ?? false) &&
    retainedConditionalBranch(frame.schemaPointer, recursion.cache)
  const walkFrame = { ...frame, inactiveConditionalRetained }
  const nextPath = createPathCursor(frame.path)
  if (!walkResolvedReferences(walkFrame, schema)) return

  const nodeState = prepareStaticWalkNode(walkFrame, schema, reference.hasNoShape, inactiveConditionalRetained)
  walkPreparedStaticNode(walkFrame, schema, nodeState, nextPath)
}

function createPathCursor(path: readonly number[]): PathCursor {
  let step = 0
  return () => [...path, step++]
}

function walkPreparedStaticNode(
  frame: StaticWalkFrame,
  schema: Record<string, unknown>,
  nodeState: StaticWalkNodeState,
  nextPath: PathCursor,
): void {
  const { exposed, suppressNestedInactiveBranches } = nodeState
  walkPropertyChildren(frame, schema, nodeState, nextPath)
  walkAllOfBranches(frame, schema, nextPath)
  walkLiveConditionalBranch(frame, schema, suppressNestedInactiveBranches, nextPath)

  if (exposed) walkArrayRows(frame, schema, nodeState, nextPath, true)
  // Complete declared rows before dynamic siblings so an inactive branch cannot
  // supply the first shape family for a typeless property already in that row.
  walkArrayRows(frame, schema, nodeState, nextPath, false)

  const dynamicBranches = collectDynamicBranches(frame, schema)
  updateCompositionState(frame, schema, nodeState, dynamicBranches)
  walkDynamicBranches(frame, dynamicBranches, suppressNestedInactiveBranches, nextPath)
  finalizeNodeActivity(schema, nodeState.node, dynamicBranches)

}

function walkPropertyChildren(
  frame: StaticWalkFrame,
  schema: Record<string, unknown>,
  nodeState: StaticWalkNodeState,
  nextPath: PathCursor,
): void {
  const {
    active,
    provisional,
    pointer,
    schemaPointer,
    rootSchema,
    lineage,
    recursion,
  } = frame
  const { properties, location, required, applicableRequired } = nodeState
  const propertyKeys = new Set(Object.keys(properties))
  for (const key of additionalPropertyKeys(schema, frame.data, requiredAtLocation(location, rootSchema))) {
    propertyKeys.add(key)
  }
  for (const key of propertyKeys) {
    const declared = Object.hasOwn(properties, key)
    const sub = declared ? properties[key] : schema.additionalProperties
    const keyPresent = isRecord(frame.data) && Object.hasOwn(frame.data, key)
    const childActive = active && (declared || keyPresent || applicableRequired.has(key))
    const escaped = escapeSegment(key)
    const childData = isRecord(frame.data) ? frame.data[key] : undefined
    const childPointer = `${pointer}/${escaped}`
    const childSchemaPointer = declared
      ? `${schemaPointer}/properties/${escaped}`
      : `${schemaPointer}/additionalProperties`
    const memberDeclaring = childDeclaring(location, key, rootSchema)
    const decision = decideMember({
      state: recursion,
      parentPointer: pointer,
      childPointer,
      childData,
      declaring: memberDeclaring,
      rootSchema,
      parentLineage: lineage,
      phase: 'enqueue',
    })
    if (decision !== 'defer' && decision.kind === 'skip') continue
    // Required demand follows the branch that applies, or the provisional branch shown to the user.
    addChild(
      frame.nodes,
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
      staticWalk({
        ...frame,
        schema: sub,
        data: childData,
        pointer: childPointer,
        schemaPointer: childSchemaPointer,
        active: childActive,
        visited: decision === 'defer' ? new Set() : frame.visited,
        declaring: memberDeclaring,
        lineage: settled.lineage,
        path: childPath,
        conditional: false,
      })
    }
    if (decision === 'defer') {
      recursion.queue[lineage!.depth] ??= []
      recursion.queue[lineage!.depth].push({
        path: childPath,
        enter: () => {
          const settled = decideMember({
            state: recursion,
            parentPointer: pointer,
            childPointer,
            childData,
            declaring: memberDeclaring,
            rootSchema,
            parentLineage: lineage,
            phase: 'dequeue',
            leaf: isLeafSchema(sub, rootSchema, memberDeclaring[0], recursion.cache.dialect),
          })
          if (settled !== 'defer') enter(settled)
        },
      })
    } else enter(decision)
  }
}

function walkAllOfBranches(
  frame: StaticWalkFrame,
  schema: Record<string, unknown>,
  nextPath: PathCursor,
): void {
  if (!Array.isArray(schema.allOf)) return
  // allOf is unconditional, so each branch inherits the parent's activity.
  schema.allOf.forEach((branch: unknown, index: number) => {
    staticWalk({
      ...frame,
      schema: branch,
      schemaPointer: `${frame.schemaPointer}/allOf/${index}`,
      path: nextPath(),
    })
  })
}

function walkLiveConditionalBranch(
  frame: StaticWalkFrame,
  schema: Record<string, unknown>,
  suppressNestedInactiveBranches: boolean,
  nextPath: PathCursor,
): void {
  const live = frame.recursion.cache.dialect === 'draft-04' ? undefined : liveBranch(schema)
  if (live === undefined || suppressNestedInactiveBranches) return
  staticWalk({
    ...frame,
    schema: schema[live],
    schemaPointer: `${frame.schemaPointer}/${live}`,
    path: nextPath(),
    conditional: true,
  })
}

function walkArrayRows(
  frame: StaticWalkFrame,
  schema: Record<string, unknown>,
  nodeState: StaticWalkNodeState,
  nextPath: PathCursor,
  createOnly: boolean,
): void {
  // Later drafts use items for one schema and prefixItems for tuple positions.
  // Draft 07 uses items itself as a positional tuple.
  const prefixItems = Array.isArray(schema.prefixItems) ? schema.prefixItems : undefined
  const tupleItems = Array.isArray(schema.items) ? schema.items : undefined
  const singleItems = !tupleItems && schema.items !== undefined ? schema.items : undefined
  if (!((singleItems !== undefined || prefixItems || tupleItems) && Array.isArray(frame.data))) return
  frame.data.forEach((item: unknown, index: number) => {
    let tuple: 'prefixItems' | 'items' | undefined
    if (prefixItems?.[index] != null) tuple = 'prefixItems'
    else if (tupleItems?.[index] != null) tuple = 'items'
    const itemSchema = tuple === undefined ? singleItems : (schema[tuple] as unknown[])[index]
    if (itemSchema === undefined) return
    const itemSchemaPointer = tuple === undefined
      ? `${frame.schemaPointer}/items`
      : `${frame.schemaPointer}/${tuple}/${index}`
    const rowDeclaring = tuple !== undefined
      ? [`#${itemSchemaPointer}`]
      : itemDeclaring(nodeState.location, frame.rootSchema)
    const rowPointer = `${frame.pointer}/${index}`
    const decision = decideRow(frame.recursion, rowPointer, rowDeclaring, frame.rootSchema)
    if (decision.kind === 'skip') return
    if (createOnly) {
      if (isRecord(itemSchema)) ensureNode(frame.nodes, rowPointer)
      return
    }
    staticWalk({
      ...frame,
      schema: itemSchema,
      data: item,
      pointer: rowPointer,
      schemaPointer: itemSchemaPointer,
      declaring: rowDeclaring,
      lineage: undefined,
      path: nextPath(),
      conditional: false,
    })
  })
}

function collectDynamicBranches(
  frame: StaticWalkFrame,
  schema: Record<string, unknown>,
): DynamicBranch[] {
  const branches: DynamicBranch[] = []
  appendConditionalBranches(frame, schema, branches)
  appendOneOfBranches(frame, schema, branches)
  appendAnyOfBranches(frame, schema, branches)
  appendDependentSchemaBranches(frame, schema, branches)
  appendDependencyBranches(frame, schema, branches)
  return branches
}

function appendConditionalBranches(
  frame: StaticWalkFrame,
  schema: Record<string, unknown>,
  branches: DynamicBranch[],
): void {
  if (
    frame.recursion.cache.dialect === 'draft-04' ||
    !isRecord(schema.if) ||
    (!isRecord(schema.then) && !isRecord(schema.else))
  ) return
  // Resolve the local if result independently of the parent's activity. This
  // prevents an exposed ancestor from exposing both then and else branches.
  const thenLocal = frame.isBranchActive(frame.schemaPointer, frame.pointer, '/then')
  const elseLocal = frame.isBranchActive(frame.schemaPointer, frame.pointer, '/else')
  if (isRecord(schema.then)) {
    branches.push({
      schema: schema.then,
      schemaPointer: `${frame.schemaPointer}/then`,
      active: frame.active && thenLocal,
      provisional: !frame.active && frame.provisional && thenLocal,
      conditional: true,
    })
  }
  if (isRecord(schema.else)) {
    branches.push({
      schema: schema.else,
      schemaPointer: `${frame.schemaPointer}/else`,
      active: frame.active && elseLocal,
      provisional: !frame.active && frame.provisional && elseLocal,
      conditional: true,
    })
  }
}

function appendOneOfBranches(
  frame: StaticWalkFrame,
  schema: Record<string, unknown>,
  dynamicBranches: DynamicBranch[],
): void {
  if (!Array.isArray(schema.oneOf)) return
  const branches = schema.oneOf as unknown[]
  const branchLocal = branches.map((_, index) =>
    frame.isBranchActive(frame.schemaPointer, frame.pointer, `/oneOf/${index}`),
  )
  // Provisional selection runs only when evaluation selected no branch.
  const selected = (frame.active || frame.provisional) && !branchLocal.some(Boolean)
    ? selectProvisionalBranch(branches, frame.data, frame.rootSchema)
    : undefined
  branches.forEach((branch, index) => {
    const branchActive = frame.active && branchLocal[index]!
    dynamicBranches.push({
      schema: branch,
      schemaPointer: `${frame.schemaPointer}/oneOf/${index}`,
      composition: true,
      conditional: frame.conditional ?? false,
      active: branchActive,
      // Parent exposure does not select each nested oneOf branch.
      provisional: !branchActive && (index === selected || (frame.provisional && branchLocal[index]!)),
    })
  })
}

function appendAnyOfBranches(
  frame: StaticWalkFrame,
  schema: Record<string, unknown>,
  branches: DynamicBranch[],
): void {
  if (!Array.isArray(schema.anyOf)) return
  // Several anyOf branches may apply, so there is no provisional single choice.
  schema.anyOf.forEach((branch, index) => {
    const branchLocal = frame.isBranchActive(frame.schemaPointer, frame.pointer, `/anyOf/${index}`)
    branches.push({
      schema: branch,
      schemaPointer: `${frame.schemaPointer}/anyOf/${index}`,
      composition: true,
      conditional: frame.conditional ?? false,
      active: frame.active && branchLocal,
      provisional: !frame.active && frame.provisional && branchLocal,
    })
  })
}

function appendDependentSchemaBranches(
  frame: StaticWalkFrame,
  schema: Record<string, unknown>,
  branches: DynamicBranch[],
): void {
  if (isPre2019Dialect(frame.recursion.cache.dialect) || !isRecord(schema.dependentSchemas)) return
  // dependentSchemas is available only in the 2019-09 and later dialects.
  appendTriggeredBranches(frame, 'dependentSchemas', schema.dependentSchemas, branches, false)
}

function appendDependencyBranches(
  frame: StaticWalkFrame,
  schema: Record<string, unknown>,
  branches: DynamicBranch[],
): void {
  if (!isRecord(schema.dependencies)) return
  // The property-list form only affects requiredness; schema-form dependencies are traversed.
  appendTriggeredBranches(frame, 'dependencies', schema.dependencies, branches, true)
}

function appendTriggeredBranches(
  frame: StaticWalkFrame,
  keyword: 'dependentSchemas' | 'dependencies',
  dependencies: Record<string, unknown>,
  branches: DynamicBranch[],
  schemasOnly: boolean,
): void {
  for (const [key, branch] of Object.entries(dependencies)) {
    if (schemasOnly && !isRecord(branch)) continue
    const keyPresent = isRecord(frame.data) && key in frame.data
    branches.push({
      schema: branch,
      schemaPointer: `${frame.schemaPointer}/${keyword}/${escapeSegment(key)}`,
      active: frame.active && keyPresent,
      provisional: !(frame.active && keyPresent) && frame.provisional && keyPresent,
      conditional: true,
    })
  }
}

function updateCompositionState(
  frame: StaticWalkFrame,
  schema: Record<string, unknown>,
  nodeState: StaticWalkNodeState,
  branches: DynamicBranch[],
): void {
  const { node, existed, exposed } = nodeState
  // An active composition supplies the shape; otherwise retain renderable
  // alternatives so an unselected union can still provide its skeleton.
  if (!(exposed || !existed) || node.composed || hasActiveComposition(branches)) return
  if (hasRenderableAlternative(schema, frame.rootSchema)) node.composed = true
  if (!hasActiveBranch(branches) && node.type === undefined) {
    const inferredFamilies = unselectedAlternativeFamilies(schema, frame.rootSchema)
    if (inferredFamilies.size > 0) {
      const families = (node.families ??= new Set())
      for (const family of inferredFamilies) families.add(family)
    }
  }
}

function hasActiveComposition(branches: readonly DynamicBranch[]): boolean {
  return branches.some((branch) => branch.composition && (branch.active || branch.provisional))
}

function hasActiveBranch(branches: readonly DynamicBranch[]): boolean {
  return branches.some((branch) => branch.active || branch.provisional)
}

function walkDynamicBranches(
  frame: StaticWalkFrame,
  branches: DynamicBranch[],
  suppressNestedInactiveBranches: boolean,
  nextPath: PathCursor,
): void {
  // Process active, then provisional, then inactive branches so inactive
  // metadata cannot replace structure from a branch shown to the user.
  branches.sort(
    (a, b) => Number(b.active) - Number(a.active) || Number(b.provisional) - Number(a.provisional),
  )
  if (suppressNestedInactiveBranches) return
  for (const branch of branches) {
    const inactiveConditional = branch.conditional && !branch.active && !branch.provisional
    const retained = inactiveConditional &&
      retainedConditionalBranch(branch.schemaPointer, frame.recursion.cache)
    staticWalk({
      ...frame,
      schema: branch.schema,
      schemaPointer: branch.schemaPointer,
      active: branch.active,
      provisional: branch.provisional,
      path: nextPath(),
      conditional: branch.conditional,
      inactiveConditionalPointer: inactiveConditional
        ? frame.pointer
        : frame.inactiveConditionalPointer,
      inactiveConditionalRetained: inactiveConditional
        ? retained
        : frame.inactiveConditionalRetained ?? false,
    })
  }
}

function finalizeNodeActivity(
  schema: Record<string, unknown>,
  node: DraftNode,
  branches: readonly DynamicBranch[],
): void {
  const derivedShape = node.hasIndependentActiveShape === true
  // An unselected union alone cannot make an otherwise typeless node active.
  if (
    node.type === undefined &&
    resolveType(schema) === undefined &&
    !derivedShape &&
    branches.length > 0 &&
    !hasActiveBranch(branches)
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
    Object.hasOwn(data, key),
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

export function unselectedAlternativeFamilies(
  schema: Record<string, unknown>,
  rootSchema: unknown,
  keyword?: 'oneOf' | 'anyOf',
): Set<KeywordFamily> {
  let branches: unknown[]
  if (keyword) branches = Array.isArray(schema[keyword]) ? schema[keyword] as unknown[] : []
  else branches = branchesOf(schema)
  if (branches.length === 0) return new Set()
  const shapes: ProjectionShape[] = []
  const branchFamilies: Set<KeywordFamily>[] = []
  for (const branch of branches) {
    const members = allOfClosure(branch, rootSchema, new Set())
    if (members.some((member) => resolveType(member) !== undefined)) continue
    const families = new Set(members.flatMap((member) => [...projectionTypeFamilies(member)]))
    const shape = shapeOfFamilies(families)
    if (shape.kind === 'none') return new Set()
    shapes.push(shape)
    branchFamilies.push(families)
  }
  if (shapes.length !== branches.length) return new Set()
  if (shapes.every((shape) => shape.kind === 'ambiguous')) {
    return new Set(branchFamilies.flatMap((families) => [...families]))
  }
  if (shapes.every((shape) => shape.kind === 'resolved' && shape.type === 'object')) {
    return new Set<KeywordFamily>(['object'])
  }
  return new Set()
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
        (key) => Object.hasOwn(b, key) && deepEqual(a[key], b[key]),
      )
    )
  }
  return false
}

import type { MaybePromise } from '@texaryn/core'
import { detectDialect, identifierKeyword, isPre2019Dialect, schemaIdentifier, type Dialect } from './dialect.js'
import { DEFINITION_KEYS, LIST, MAP, SINGLE } from './schema-keywords.js'
import { compareCodeUnits } from './string-order.js'

/** Resolves one absolute resource URI without its fragment. The adapter never fetches it itself. */
export type SchemaResourceResolver = (uri: string) => MaybePromise<unknown>

export interface SchemaResourceOptions {
  /** Supplies external schemas on the host's terms. Return undefined when the resource is unavailable. */
  readonly resolveResource?: SchemaResourceResolver
  /** Maximum number of unique external resource retrieval URIs. The default is 128. */
  readonly maxExternalResources?: number
}

export const DEFAULT_MAX_EXTERNAL_RESOURCES = 128

const META_URIS = new Set([
  'http://json-schema.org/draft-04/schema',
  'https://json-schema.org/draft-04/schema',
  'http://json-schema.org/draft-07/schema',
  'https://json-schema.org/draft-07/schema',
  'http://json-schema.org/draft/2019-09/schema',
  'https://json-schema.org/draft/2019-09/schema',
  'http://json-schema.org/draft/2019-09/meta/core',
  'https://json-schema.org/draft/2019-09/meta/core',
  'http://json-schema.org/draft/2019-09/meta/applicator',
  'https://json-schema.org/draft/2019-09/meta/applicator',
  'http://json-schema.org/draft/2019-09/meta/validation',
  'https://json-schema.org/draft/2019-09/meta/validation',
  'http://json-schema.org/draft/2019-09/meta/meta-data',
  'https://json-schema.org/draft/2019-09/meta/meta-data',
  'http://json-schema.org/draft/2019-09/meta/format',
  'https://json-schema.org/draft/2019-09/meta/format',
  'http://json-schema.org/draft/2019-09/meta/content',
  'https://json-schema.org/draft/2019-09/meta/content',
  'http://json-schema.org/draft/2020-12/schema',
  'https://json-schema.org/draft/2020-12/schema',
  'http://json-schema.org/draft/2020-12/meta/core',
  'https://json-schema.org/draft/2020-12/meta/core',
  'http://json-schema.org/draft/2020-12/meta/applicator',
  'https://json-schema.org/draft/2020-12/meta/applicator',
  'http://json-schema.org/draft/2020-12/meta/unevaluated',
  'https://json-schema.org/draft/2020-12/meta/unevaluated',
  'http://json-schema.org/draft/2020-12/meta/validation',
  'https://json-schema.org/draft/2020-12/meta/validation',
  'http://json-schema.org/draft/2020-12/meta/meta-data',
  'https://json-schema.org/draft/2020-12/meta/meta-data',
  'http://json-schema.org/draft/2020-12/meta/format-annotation',
  'https://json-schema.org/draft/2020-12/meta/format-annotation',
  'http://json-schema.org/draft/2020-12/meta/content',
  'https://json-schema.org/draft/2020-12/meta/content',
])

function referenceKeywords(dialect: Dialect): readonly string[] {
  if (isPre2019Dialect(dialect)) return ['$ref']
  if (dialect === '2019-09') return ['$ref', '$recursiveRef']
  return ['$ref', '$dynamicRef']
}

function metaSchemaUri(dialect: Dialect): string {
  if (dialect === 'draft-04') return 'http://json-schema.org/draft-04/schema#'
  if (dialect === 'draft-07') return 'http://json-schema.org/draft-07/schema#'
  return `https://json-schema.org/draft/${dialect}/schema`
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export class SchemaResourceResolutionError extends Error {
  readonly uri: string | undefined
  readonly referringPosition: string | undefined

  constructor(message: string, uri?: string, referringPosition?: string) {
    super(message)
    this.name = 'SchemaResourceResolutionError'
    this.uri = uri
    this.referringPosition = referringPosition
  }
}

function withoutFragment(uri: string): string {
  const hash = uri.indexOf('#')
  return hash === -1 ? uri : uri.slice(0, hash)
}

function decodeUriFragment(fragment: string): string {
  try {
    return decodeURIComponent(fragment)
  } catch {
    return fragment
  }
}

function absoluteUri(reference: string, base: string | undefined): string | undefined {
  try {
    return base === undefined ? new URL(reference).href : new URL(reference, base).href
  } catch {
    return undefined
  }
}

function resourceBase(identifier: unknown, parent: string | undefined, dialect: Dialect): string | undefined {
  if (typeof identifier !== 'string') return parent
  if (isPre2019Dialect(dialect) && identifier.startsWith('#')) return parent
  const resolved = absoluteUri(identifier, parent)
  return resolved === undefined ? parent : withoutFragment(resolved)
}

interface LocatedReference {
  readonly base: string | undefined
  readonly reference: string
  readonly position: string
}

interface LocalReference {
  readonly uri: string
  readonly base: string | undefined
  readonly resourceRoot: unknown
  readonly resourceRootPosition: string
}

const escape = (segment: string): string => segment.replaceAll('~', '~0').replaceAll('/', '~1')

interface LocatedPointerTarget {
  readonly schema: unknown
  readonly parentBase: string | undefined
  readonly base: string | undefined
  readonly resourceRoot: unknown
  readonly resourceRootPosition: string
  readonly position: string
}

interface PointerTraversalState {
  current: unknown
  base: string | undefined
  parentBase: string | undefined
  resourceRoot: unknown
  resourceRootPosition: string
  position: string
}

function pointerChildAt(current: unknown, segment: string): { value: unknown } | undefined {
  if (Array.isArray(current)) {
    const index = Number(segment)
    if (!Number.isInteger(index) || index < 0 || index >= current.length || !Object.hasOwn(current, index)) {
      return undefined
    }
    return { value: current[index] }
  }
  if (isRecord(current) && Object.hasOwn(current, segment)) return { value: current[segment] }
  return undefined
}

function updatePointerResourceContext(
  child: unknown,
  state: PointerTraversalState,
  dialect: Dialect,
  knownResources: Set<string> | undefined,
): void {
  if (!isRecord(child) || (isPre2019Dialect(dialect) && typeof child.$ref === 'string')) return
  const childId = schemaIdentifier(child, dialect)
  if (typeof childId !== 'string') return
  const childBase = resourceBase(childId, state.base, dialect)
  if (childBase === undefined) return

  knownResources?.add(childBase)
  const embeddedDialect = detectDialect(child, { defaultDialect: dialect })
  if (embeddedDialect !== dialect) {
    throw new SchemaResourceResolutionError(
      `The resource at "${childBase}" uses ${embeddedDialect}, but this adapter uses ${dialect}.`,
      childBase,
      state.position,
    )
  }
  if (isPre2019Dialect(dialect) && childId.startsWith('#')) return
  state.base = childBase
  state.resourceRoot = child
  state.resourceRootPosition = state.position
}

function pointerTargetWithContext(
  document: unknown,
  fragment: string,
  initialBase: string | undefined,
  initialPosition: string,
  dialect: Dialect,
  knownResources?: Set<string>,
): LocatedPointerTarget | undefined {
  const pointer = decodeUriFragment(fragment)
  if (pointer === '') {
    return {
      schema: document,
      parentBase: initialBase,
      base: initialBase,
      resourceRoot: document,
      resourceRootPosition: initialPosition,
      position: initialPosition,
    }
  }
  if (!pointer.startsWith('/')) return undefined

  const state: PointerTraversalState = {
    current: document,
    base: initialBase,
    parentBase: initialBase,
    resourceRoot: document,
    resourceRootPosition: initialPosition,
    position: initialPosition,
  }
  for (const rawSegment of pointer.slice(1).split('/')) {
    const segment = rawSegment.replaceAll('~1', '/').replaceAll('~0', '~')
    const child = pointerChildAt(state.current, segment)
    if (child === undefined) return undefined
    state.parentBase = state.base
    state.position = `${state.position}/${escape(segment)}`
    state.current = child.value
    updatePointerResourceContext(child.value, state, dialect, knownResources)
  }
  return {
    schema: state.current,
    parentBase: state.parentBase,
    base: state.base,
    resourceRoot: state.resourceRoot,
    resourceRootPosition: state.resourceRootPosition,
    position: state.position,
  }
}

function seenAtBase(seen: WeakMap<object, Set<string | undefined>>, schema: object, base: string | undefined): boolean {
  const bases = seen.get(schema) ?? new Set<string | undefined>()
  if (bases.has(base)) return true
  bases.add(base)
  seen.set(schema, bases)
  return false
}

type AnchorTarget = { schema: unknown; base: string | undefined; position: string }
type ResourcePosition = { base: string | undefined; resourceRoot: unknown; resourceRootPosition: string }
type ReferenceSchemaVisitor = (
  schema: unknown,
  parentBase: string | undefined,
  position: string,
  resourceRoot: unknown,
  resourceRootPosition: string,
) => void

interface ReferenceTraversalState {
  readonly dialect: Dialect
  readonly knownResources: Set<string> | undefined
  readonly references: Map<string, LocatedReference>
  readonly seen: WeakMap<object, Set<string | undefined>>
  readonly localReferences: LocalReference[]
  readonly anchorTargets: Map<string, AnchorTarget>
  readonly contextsByPosition: Map<string, ResourcePosition>
  readonly visitedLocalReferences: Set<number>
  readonly referenceKeywords: Set<string>
}

interface ReferenceSchemaContext {
  readonly identifier: string | undefined
  readonly ignoresSiblings: boolean
  readonly base: string | undefined
  readonly resourceRoot: unknown
  readonly resourceRootPosition: string
}

function referencesIn(
  document: unknown,
  initialBase: string | undefined,
  dialect: Dialect,
  knownResources?: Set<string>,
): LocatedReference[] {
  const state: ReferenceTraversalState = {
    dialect,
    knownResources,
    references: new Map(),
    seen: new WeakMap(),
    localReferences: [],
    anchorTargets: new Map(),
    contextsByPosition: new Map(),
    visitedLocalReferences: new Set(),
    referenceKeywords: new Set(referenceKeywords(dialect)),
  }
  const visit: ReferenceSchemaVisitor = (schema, parentBase, position, resourceRoot, resourceRootPosition) => {
    visitReferenceSchema(schema, parentBase, position, resourceRoot, resourceRootPosition, state)
  }
  visit(document, initialBase, '#', document, '#')
  visitPendingLocalReferences(state, visit)
  return [...state.references.values()]
}

function visitReferenceSchema(
  schema: unknown,
  parentBase: string | undefined,
  position: string,
  resourceRoot: unknown,
  resourceRootPosition: string,
  state: ReferenceTraversalState,
): void {
  if (typeof schema !== 'object' || schema === null) return
  if (Array.isArray(schema)) {
    if (seenAtBase(state.seen, schema, parentBase)) return
    schema.forEach((child, index) => {
      visitReferenceSchema(child, parentBase, `${position}/${index}`, resourceRoot, resourceRootPosition, state)
    })
    return
  }

  const record = schema as Record<string, unknown>
  const context = referenceSchemaContext(record, parentBase, position, resourceRoot, resourceRootPosition, state)
  if (seenAtBase(state.seen, schema, parentBase)) return
  recordReferenceAnchors(record, parentBase, position, context, state)
  recordSchemaReferences(record, position, context, state)
  visitReferenceSchemaChildren(record, position, context, state)
}

function referenceSchemaContext(
  record: Record<string, unknown>,
  parentBase: string | undefined,
  position: string,
  resourceRoot: unknown,
  resourceRootPosition: string,
  state: ReferenceTraversalState,
): ReferenceSchemaContext {
  const identifierValue = schemaIdentifier(record, state.dialect)
  const identifier = typeof identifierValue === 'string' ? identifierValue : undefined
  const ignoresSiblings = isPre2019Dialect(state.dialect) && typeof record.$ref === 'string'
  const base = ignoresSiblings ? parentBase : resourceBase(identifier, parentBase, state.dialect)
  if (!ignoresSiblings && identifier !== undefined && base !== undefined) {
    state.knownResources?.add(base)
    const embeddedDialect = detectDialect(record, { defaultDialect: state.dialect })
    if (embeddedDialect !== state.dialect) {
      throw new SchemaResourceResolutionError(
        `The resource at "${base}" uses ${embeddedDialect}, but this adapter uses ${state.dialect}.`,
        base,
        position,
      )
    }
  }
  const startsResource = !ignoresSiblings &&
    identifier !== undefined &&
    !(isPre2019Dialect(state.dialect) && identifier.startsWith('#'))
  const currentRoot = startsResource ? record : resourceRoot
  const currentRootPosition = startsResource ? position : resourceRootPosition
  state.contextsByPosition.set(position, { base, resourceRoot: currentRoot, resourceRootPosition: currentRootPosition })
  return { identifier, ignoresSiblings, base, resourceRoot: currentRoot, resourceRootPosition: currentRootPosition }
}

function recordReferenceAnchors(
  record: Record<string, unknown>,
  parentBase: string | undefined,
  position: string,
  context: ReferenceSchemaContext,
  state: ReferenceTraversalState,
): void {
  const { identifier, ignoresSiblings, base } = context
  if (!ignoresSiblings && isPre2019Dialect(state.dialect) && identifier?.startsWith('#')) {
    const anchorUri = absoluteUri(identifier, parentBase) ?? (parentBase === undefined ? identifier : undefined)
    if (anchorUri !== undefined) state.anchorTargets.set(anchorUri, { schema: record, base, position })
  }
  if (!isPre2019Dialect(state.dialect) && typeof record.$anchor === 'string') {
    state.anchorTargets.set(`${base ?? ''}#${record.$anchor}`, { schema: record, base, position })
  }
  if (state.dialect === '2020-12' && typeof record.$dynamicAnchor === 'string') {
    state.anchorTargets.set(`${base ?? ''}#${record.$dynamicAnchor}`, { schema: record, base, position })
  }
}

function recordSchemaReferences(
  record: Record<string, unknown>,
  position: string,
  context: ReferenceSchemaContext,
  state: ReferenceTraversalState,
): void {
  const { base, resourceRoot, resourceRootPosition } = context
  for (const keyword of state.referenceKeywords) {
    const reference = record[keyword]
    if (typeof reference !== 'string') continue
    state.references.set(JSON.stringify([base, reference]), { base, reference, position: `${position}/${keyword}` })
    const resolved = absoluteUri(reference, base)
    const localUri = resolved ?? (base === undefined && reference.startsWith('#') ? reference : undefined)
    if (localUri !== undefined && (base === undefined || withoutFragment(localUri) === base)) {
      state.localReferences.push({ uri: localUri, base, resourceRoot, resourceRootPosition })
    }
  }
}

function visitReferenceSchemaChildren(
  record: Record<string, unknown>,
  position: string,
  context: ReferenceSchemaContext,
  state: ReferenceTraversalState,
): void {
  if (visitLegacyReferenceDefinitions(record, position, context, state)) return
  visitSingleReferenceSchemas(record, position, context, state)
  visitListReferenceSchemas(record, position, context, state)
  visitMapReferenceSchemas(record, position, context, state)
  visitTupleReferenceSchemas(record, position, context, state)
}

function visitLegacyReferenceDefinitions(
  record: Record<string, unknown>,
  position: string,
  context: ReferenceSchemaContext,
  state: ReferenceTraversalState,
): boolean {
  if (!context.ignoresSiblings) return false
  for (const keyword of ['definitions', '$defs']) {
    const children = record[keyword]
    if (!isRecord(children)) continue
    for (const [key, child] of Object.entries(children)) {
      if (!isRecord(child) && typeof child !== 'boolean') continue
      visitReferenceSchema(
        child,
        context.base,
        `${position}/${keyword}/${escape(key)}`,
        context.resourceRoot,
        context.resourceRootPosition,
        state,
      )
    }
  }
  return true
}

function visitSingleReferenceSchemas(
  record: Record<string, unknown>,
  position: string,
  context: ReferenceSchemaContext,
  state: ReferenceTraversalState,
): void {
  for (const keyword of SINGLE[state.dialect]) {
    const child = record[keyword]
    if (!isRecord(child) && typeof child !== 'boolean') continue
    visitReferenceSchema(child, context.base, `${position}/${keyword}`, context.resourceRoot, context.resourceRootPosition, state)
  }
}

function visitListReferenceSchemas(
  record: Record<string, unknown>,
  position: string,
  context: ReferenceSchemaContext,
  state: ReferenceTraversalState,
): void {
  for (const keyword of LIST[state.dialect]) {
    const children = record[keyword]
    if (!Array.isArray(children)) continue
    children.forEach((child, index) => {
      visitReferenceSchema(child, context.base, `${position}/${keyword}/${index}`, context.resourceRoot, context.resourceRootPosition, state)
    })
  }
}

function visitMapReferenceSchemas(
  record: Record<string, unknown>,
  position: string,
  context: ReferenceSchemaContext,
  state: ReferenceTraversalState,
): void {
  for (const keyword of MAP[state.dialect]) {
    const children = record[keyword]
    if (!isRecord(children)) continue
    for (const [key, child] of Object.entries(children)) {
      if (!isRecord(child) && typeof child !== 'boolean') continue
      visitReferenceSchema(child, context.base, `${position}/${keyword}/${escape(key)}`, context.resourceRoot, context.resourceRootPosition, state)
    }
  }
}

function visitTupleReferenceSchemas(
  record: Record<string, unknown>,
  position: string,
  context: ReferenceSchemaContext,
  state: ReferenceTraversalState,
): void {
  if (state.dialect === '2020-12' || !Array.isArray(record.items)) return
  record.items.forEach((child, index) => {
    visitReferenceSchema(child, context.base, `${position}/items/${index}`, context.resourceRoot, context.resourceRootPosition, state)
  })
}

function visitPendingLocalReferences(
  state: ReferenceTraversalState,
  visit: ReferenceSchemaVisitor,
): void {
  let progressed = true
  while (progressed) {
    progressed = false
    for (let index = 0; index < state.localReferences.length; index += 1) {
      if (visitPendingLocalReference(index, state, visit)) progressed = true
    }
  }
}

function visitPendingLocalReference(
  index: number,
  state: ReferenceTraversalState,
  visit: ReferenceSchemaVisitor,
): boolean {
  if (state.visitedLocalReferences.has(index)) return false
  const local = state.localReferences[index]!
  const hash = local.uri.indexOf('#')
  const fragment = hash === -1 ? '' : local.uri.slice(hash + 1)
  let target: unknown
  let targetBase: string | undefined
  let targetPosition: string
  let targetResourceRoot = local.resourceRoot
  let targetResourceRootPosition = local.resourceRootPosition
  if (fragment === '' || fragment.startsWith('/')) {
    const located = pointerTargetWithContext(
      local.resourceRoot,
      fragment,
      local.base,
      local.resourceRootPosition,
      state.dialect,
      state.knownResources,
    )
    target = located?.schema
    targetBase = fragment === '' ? local.base : located?.parentBase ?? local.base
    targetPosition = located?.position ?? local.resourceRootPosition
    targetResourceRoot = located?.resourceRoot ?? local.resourceRoot
    targetResourceRootPosition = located?.resourceRootPosition ?? local.resourceRootPosition
  } else {
    const anchor = state.anchorTargets.get(local.uri)
    if (anchor === undefined) {
      state.visitedLocalReferences.delete(index)
      return false
    }
    target = anchor.schema
    targetBase = anchor.base ?? local.base
    targetPosition = anchor.position
  }
  state.visitedLocalReferences.add(index)
  if ((isRecord(target) || typeof target === 'boolean') && !state.contextsByPosition.has(targetPosition)) {
    visit(target, targetBase, targetPosition, targetResourceRoot, targetResourceRootPosition)
  }
  return true
}

type DeclaredResourceVisitor = (schema: unknown, parentBase: string | undefined, position: string) => void

interface DeclaredResourceState {
  readonly dialect: Dialect
  readonly ids: Set<string>
  readonly seen: WeakMap<object, Set<string | undefined>>
}

function declaredResourceIds(document: unknown, initialBase: string | undefined, dialect: Dialect): Set<string> {
  const state: DeclaredResourceState = {
    dialect,
    ids: new Set(),
    seen: new WeakMap(),
  }
  const visit: DeclaredResourceVisitor = (schema, parentBase, position) => {
    visitDeclaredResource(schema, parentBase, position, state)
  }
  visit(document, initialBase, '#')
  return state.ids
}

function visitDeclaredResource(
  schema: unknown,
  parentBase: string | undefined,
  position: string,
  state: DeclaredResourceState,
): void {
  if (typeof schema !== 'object' || schema === null || seenAtBase(state.seen, schema, parentBase)) return
  if (Array.isArray(schema)) {
    schema.forEach((child, index) => {
      visitDeclaredResource(child, parentBase, `${position}/${index}`, state)
    })
    return
  }

  const record = schema as Record<string, unknown>
  const identifier = schemaIdentifier(record, state.dialect)
  const ignoresSiblings = isPre2019Dialect(state.dialect) && typeof record.$ref === 'string'
  const base = ignoresSiblings ? parentBase : resourceBase(identifier, parentBase, state.dialect)
  recordDeclaredResourceId(record, identifier, ignoresSiblings, base, position, state)
  if (ignoresSiblings) {
    visitLegacyDeclaredDefinitions(record, base, position, state)
    return
  }
  visitDeclaredResourceChildren(record, base, position, state)
}

function recordDeclaredResourceId(
  record: Record<string, unknown>,
  identifier: unknown,
  ignoresSiblings: boolean,
  base: string | undefined,
  position: string,
  state: DeclaredResourceState,
): void {
  if (ignoresSiblings || typeof identifier !== 'string' || base === undefined) return
  state.ids.add(base)
  const embeddedDialect = detectDialect(record, { defaultDialect: state.dialect })
  if (embeddedDialect !== state.dialect) {
    throw new SchemaResourceResolutionError(
      `The resource at "${base}" uses ${embeddedDialect}, but this adapter uses ${state.dialect}.`,
      base,
      position,
    )
  }
}

function visitLegacyDeclaredDefinitions(
  record: Record<string, unknown>,
  base: string | undefined,
  position: string,
  state: DeclaredResourceState,
): void {
  for (const keyword of ['definitions', '$defs']) {
    const children = record[keyword]
    if (!isRecord(children)) continue
    for (const [key, child] of Object.entries(children)) {
      if (!isRecord(child) && typeof child !== 'boolean') continue
      visitDeclaredResource(child, base, `${position}/${keyword}/${escape(key)}`, state)
    }
  }
}

function visitDeclaredResourceChildren(
  record: Record<string, unknown>,
  base: string | undefined,
  position: string,
  state: DeclaredResourceState,
): void {
  visitSingleDeclaredResources(record, base, position, state)
  visitListDeclaredResources(record, base, position, state)
  visitMapDeclaredResources(record, base, position, state)
  visitTupleDeclaredResources(record, base, position, state)
}

function visitSingleDeclaredResources(
  record: Record<string, unknown>,
  base: string | undefined,
  position: string,
  state: DeclaredResourceState,
): void {
  for (const keyword of SINGLE[state.dialect]) {
    const child = record[keyword]
    if (!isRecord(child) && typeof child !== 'boolean') continue
    visitDeclaredResource(child, base, `${position}/${keyword}`, state)
  }
}

function visitListDeclaredResources(
  record: Record<string, unknown>,
  base: string | undefined,
  position: string,
  state: DeclaredResourceState,
): void {
  for (const keyword of LIST[state.dialect]) {
    const children = record[keyword]
    if (!Array.isArray(children)) continue
    children.forEach((child, index) => {
      visitDeclaredResource(child, base, `${position}/${keyword}/${index}`, state)
    })
  }
}

function visitMapDeclaredResources(
  record: Record<string, unknown>,
  base: string | undefined,
  position: string,
  state: DeclaredResourceState,
): void {
  for (const keyword of MAP[state.dialect]) {
    const children = record[keyword]
    if (!isRecord(children)) continue
    for (const [key, child] of Object.entries(children)) {
      if (!isRecord(child) && typeof child !== 'boolean') continue
      visitDeclaredResource(child, base, `${position}/${keyword}/${escape(key)}`, state)
    }
  }
}

function visitTupleDeclaredResources(
  record: Record<string, unknown>,
  base: string | undefined,
  position: string,
  state: DeclaredResourceState,
): void {
  if (state.dialect === '2020-12' || !Array.isArray(record.items)) return
  record.items.forEach((child, index) => {
    visitDeclaredResource(child, base, `${position}/items/${index}`, state)
  })
}

interface NormalizedResource {
  readonly primary: unknown
  readonly aliases: readonly unknown[]
  readonly canonicalBase: string
}

function cloneValue(value: unknown, seen = new Map<object, unknown>()): unknown {
  if (typeof value !== 'object' || value === null) return value
  const previous = seen.get(value)
  if (previous !== undefined) return previous
  if (Array.isArray(value)) {
    const copy: unknown[] = []
    seen.set(value, copy)
    for (const child of value) copy.push(cloneValue(child, seen))
    return copy
  }
  const copy: Record<string, unknown> = {}
  seen.set(value, copy)
  for (const [key, child] of Object.entries(value)) {
    Object.defineProperty(copy, key, {
      value: cloneValue(child, seen),
      enumerable: true,
      configurable: true,
      writable: true,
    })
  }
  return copy
}

function structurallyEqual(left: unknown, right: unknown, seen = new WeakMap<object, WeakSet<object>>()): boolean {
  if (Object.is(left, right)) return true
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length && left.every((value, index) => structurallyEqual(value, right[index], seen))
  }
  if (!isRecord(left) || !isRecord(right)) return false
  const compared = seen.get(left) ?? new WeakSet<object>()
  if (compared.has(right)) return true
  compared.add(right)
  seen.set(left, compared)
  const leftKeys = Object.keys(left).sort(compareCodeUnits)
  const rightKeys = Object.keys(right).sort(compareCodeUnits)
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) =>
    key === rightKeys[index] && structurallyEqual(left[key], right[key], seen))
}

interface LegacyAnchorScanState {
  readonly dialect: Dialect
  readonly targets: Map<string, { base: string; pointer: string }>
  readonly seen: WeakMap<object, Set<string>>
}

interface LegacyAnchorNodeContext {
  readonly base: string
  readonly anchorBase: string
  readonly anchorPosition: string
  readonly ignoresSiblings: boolean
}

type LegacyAnchorVisitor = (
  schema: unknown,
  parentBase: string,
  position: string,
  anchorBase: string,
  anchorPosition: string,
) => void

function legacyAnchorTargets(
  source: unknown,
  retrievalUri: string,
  dialect: Dialect,
): Map<string, { base: string; pointer: string }> {
  const state: LegacyAnchorScanState = {
    dialect,
    targets: new Map(),
    seen: new WeakMap(),
  }
  const visit: LegacyAnchorVisitor = (schema, parentBase, position, anchorBase, anchorPosition) => {
    visitLegacyAnchorNode(schema, parentBase, position, anchorBase, anchorPosition, state)
  }
  visit(source, retrievalUri, '#', retrievalUri, '#')
  return state.targets
}

function visitLegacyAnchorNode(
  schema: unknown,
  parentBase: string,
  position: string,
  anchorBase: string,
  anchorPosition: string,
  state: LegacyAnchorScanState,
): void {
  if (!isRecord(schema) || hasVisitedLegacyAnchorContext(schema, parentBase, anchorPosition, state)) return
  const context = legacyAnchorNodeContext(schema, parentBase, position, anchorBase, anchorPosition, state)
  const visit: LegacyAnchorVisitor = (child, childBase, childPosition, childAnchorBase, childAnchorPosition) => {
    visitLegacyAnchorNode(child, childBase, childPosition, childAnchorBase, childAnchorPosition, state)
  }
  if (context.ignoresSiblings) {
    visitLegacyAnchorDefinitions(schema, position, context, state, visit)
    return
  }
  visitLegacyAnchorChildren(schema, position, context, state.dialect, visit)
}

function hasVisitedLegacyAnchorContext(
  schema: Record<string, unknown>,
  parentBase: string,
  anchorPosition: string,
  state: LegacyAnchorScanState,
): boolean {
  const contexts = state.seen.get(schema) ?? new Set<string>()
  const context = `${parentBase}\u0000${anchorPosition}`
  if (contexts.has(context)) return true
  contexts.add(context)
  state.seen.set(schema, contexts)
  return false
}

function legacyAnchorNodeContext(
  schema: Record<string, unknown>,
  parentBase: string,
  position: string,
  anchorBase: string,
  anchorPosition: string,
  state: LegacyAnchorScanState,
): LegacyAnchorNodeContext {
  const identifier = schemaIdentifier(schema, state.dialect)
  const ignoresSiblings = typeof schema.$ref === 'string'
  let base = parentBase
  let nextAnchorBase = anchorBase
  let nextAnchorPosition = anchorPosition
  if (!ignoresSiblings && typeof identifier === 'string') {
    const resolved = absoluteUri(identifier, parentBase)
    if (resolved !== undefined && identifier.startsWith('#')) {
      const pointer = position.startsWith(anchorPosition)
        ? position.slice(anchorPosition.length)
        : position.slice(1)
      state.targets.set(resolved, { base: anchorBase, pointer })
    } else if (resolved !== undefined) {
      base = withoutFragment(resolved)
      nextAnchorBase = base
      nextAnchorPosition = position
    }
  }
  return {
    base,
    anchorBase: nextAnchorBase,
    anchorPosition: nextAnchorPosition,
    ignoresSiblings,
  }
}

function visitLegacyAnchorChild(
  child: unknown,
  childPosition: string,
  context: LegacyAnchorNodeContext,
  visit: LegacyAnchorVisitor,
): void {
  if (isRecord(child) || typeof child === 'boolean') {
    visit(child, context.base, childPosition, context.anchorBase, context.anchorPosition)
  }
}

function visitLegacyAnchorDefinitions(
  schema: Record<string, unknown>,
  position: string,
  context: LegacyAnchorNodeContext,
  state: LegacyAnchorScanState,
  visit: LegacyAnchorVisitor,
): void {
  for (const keyword of DEFINITION_KEYS[state.dialect]) {
    const map = schema[keyword]
    if (!isRecord(map)) continue
    for (const [key, child] of Object.entries(map)) {
      visitLegacyAnchorChild(child, `${position}/${keyword}/${escape(key)}`, context, visit)
    }
  }
}

function visitLegacyAnchorChildren(
  schema: Record<string, unknown>,
  position: string,
  context: LegacyAnchorNodeContext,
  dialect: Dialect,
  visit: LegacyAnchorVisitor,
): void {
  for (const keyword of SINGLE[dialect]) {
    visitLegacyAnchorChild(schema[keyword], `${position}/${keyword}`, context, visit)
  }
  for (const keyword of LIST[dialect]) {
    visitLegacyAnchorList(schema[keyword], `${position}/${keyword}`, context, visit)
  }
  for (const keyword of MAP[dialect]) {
    visitLegacyAnchorMap(schema[keyword], `${position}/${keyword}`, context, visit)
  }
  if (Array.isArray(schema.items)) visitLegacyAnchorList(schema.items, `${position}/items`, context, visit)
}

function visitLegacyAnchorList(
  list: unknown,
  position: string,
  context: LegacyAnchorNodeContext,
  visit: LegacyAnchorVisitor,
): void {
  if (!Array.isArray(list)) return
  list.forEach((child, index) => visitLegacyAnchorChild(child, `${position}/${index}`, context, visit))
}

function visitLegacyAnchorMap(
  map: unknown,
  position: string,
  context: LegacyAnchorNodeContext,
  visit: LegacyAnchorVisitor,
): void {
  if (!isRecord(map)) return
  for (const [key, child] of Object.entries(map)) {
    visitLegacyAnchorChild(child, `${position}/${escape(key)}`, context, visit)
  }
}

interface RemoteSchemaNormalizationContext {
  readonly retrievalUri: string
  readonly dialect: Dialect
  readonly canonicalBase: string
  readonly rootIdentifier: string
  readonly idKeyword: string
  readonly referenceKeywords: ReadonlySet<string>
  readonly legacyAnchors: Map<string, { base: string; pointer: string }>
  readonly memo: WeakMap<object, Map<string | undefined, unknown>>
}

interface RemoteSchemaNodeState {
  readonly keyBase: string | undefined
  readonly originalId: unknown
  readonly ignoresSiblings: boolean
  readonly base: string | undefined
  readonly resolvedId: string | undefined
}

function remoteSchema(
  source: unknown,
  retrievalUri: string,
  dialect: Dialect,
  canonicalBase: string,
  rootIdentifier: string,
): unknown {
  const sourceDocument = typeof source === 'boolean' ? { allOf: [source] } : source as Record<string, unknown>
  const context: RemoteSchemaNormalizationContext = {
    retrievalUri,
    dialect,
    canonicalBase,
    rootIdentifier,
    idKeyword: identifierKeyword(dialect),
    referenceKeywords: new Set(referenceKeywords(dialect)),
    legacyAnchors: isPre2019Dialect(dialect)
      ? legacyAnchorTargets(source, retrievalUri, dialect)
      : new Map(),
    memo: new WeakMap(),
  }
  return normalizeRemoteSchemaValue(sourceDocument, retrievalUri, '#', true, context)
}

function normalizeRemoteSchemaValue(
  value: unknown,
  parentBase: string | undefined,
  position: string,
  root: boolean,
  context: RemoteSchemaNormalizationContext,
): unknown {
  if (!isRecord(value)) {
    if (Array.isArray(value)) {
      return value.map((child, index) =>
        normalizeRemoteSchemaValue(child, parentBase, `${position}/${index}`, false, context),
      )
    }
    return cloneValue(value)
  }

  const keyBase = parentBase
  const cached = context.memo.get(value)?.get(keyBase)
  if (cached !== undefined) return cached
  const nodeState = remoteSchemaNodeState(value, parentBase, position, root, context)
  const output: Record<string, unknown> = {}
  rememberRemoteSchemaNode(value, nodeState.keyBase, output, context.memo)
  for (const [keyword, child] of Object.entries(value)) {
    normalizeRemoteSchemaProperty(output, keyword, child, position, nodeState, context)
  }
  if (root) addRemoteSchemaRootMetadata(output, context)
  return output
}

function remoteSchemaNodeState(
  value: Record<string, unknown>,
  parentBase: string | undefined,
  position: string,
  root: boolean,
  context: RemoteSchemaNormalizationContext,
): RemoteSchemaNodeState {
  const originalId = value[context.idKeyword]
  const ignoresSiblings = isPre2019Dialect(context.dialect) && typeof value.$ref === 'string'
  let base = parentBase
  let resolvedId: string | undefined
  if (root) {
    base = context.canonicalBase
    resolvedId = context.rootIdentifier
  } else if (!ignoresSiblings && typeof originalId === 'string') {
    resolvedId = absoluteUri(originalId, parentBase)
    if (resolvedId === undefined) {
      throw new SchemaResourceResolutionError(
        `Cannot resolve $id "${originalId}" at "${position}" in the resource retrieved from "${context.retrievalUri}".`,
        context.retrievalUri,
        position,
      )
    }
    base = isPre2019Dialect(context.dialect) && originalId.startsWith('#')
      ? parentBase
      : withoutFragment(resolvedId)
  }
  rejectFileRemoteSchemaId(resolvedId, position)
  return { keyBase: parentBase, originalId, ignoresSiblings, base, resolvedId }
}

function rejectFileRemoteSchemaId(resolvedId: string | undefined, position: string): void {
  if (resolvedId === undefined) return
  const resource = withoutFragment(resolvedId)
  if (!resource.startsWith('file:')) return
  throw new SchemaResourceResolutionError(
    `File schema resources are not supported: "${resource}" at "${position}".`,
    resource,
    position,
  )
}

function rememberRemoteSchemaNode(
  value: object,
  base: string | undefined,
  output: Record<string, unknown>,
  memo: WeakMap<object, Map<string | undefined, unknown>>,
): void {
  const values = memo.get(value) ?? new Map<string | undefined, unknown>()
  values.set(base, output)
  memo.set(value, values)
}

function normalizeRemoteSchemaProperty(
  output: Record<string, unknown>,
  keyword: string,
  child: unknown,
  position: string,
  nodeState: RemoteSchemaNodeState,
  context: RemoteSchemaNormalizationContext,
): void {
  if (normalizeRemoteSchemaId(output, keyword, nodeState, context)) return
  if (normalizeRemoteSchemaReference(output, keyword, child, position, nodeState, context)) return
  if (normalizeLegacyRemoteSchemaProperty(output, keyword, child, position, nodeState, context)) return
  if (normalizeRemoteSchemaSingle(output, keyword, child, position, nodeState, context)) return
  if (normalizeRemoteSchemaList(output, keyword, child, position, nodeState, context)) return
  if (normalizeRemoteSchemaMap(output, keyword, child, position, nodeState, context)) return
  if (normalizeRemoteSchemaTupleItems(output, keyword, child, position, nodeState, context)) return
  defineRemoteSchemaProperty(output, keyword, cloneValue(child))
}

function defineRemoteSchemaProperty(target: Record<string, unknown>, keyword: string, value: unknown): void {
  Object.defineProperty(target, keyword, { value, enumerable: true, configurable: true, writable: true })
}

function normalizeRemoteSchemaId(
  output: Record<string, unknown>,
  keyword: string,
  nodeState: RemoteSchemaNodeState,
  context: RemoteSchemaNormalizationContext,
): boolean {
  if (keyword !== context.idKeyword || nodeState.resolvedId === undefined) return false
  const normalizedId = isPre2019Dialect(context.dialect) &&
    typeof nodeState.originalId === 'string' &&
    nodeState.originalId.startsWith('#')
    ? nodeState.originalId
    : nodeState.resolvedId
  defineRemoteSchemaProperty(output, keyword, normalizedId)
  return true
}

function normalizeRemoteSchemaReference(
  output: Record<string, unknown>,
  keyword: string,
  child: unknown,
  position: string,
  nodeState: RemoteSchemaNodeState,
  context: RemoteSchemaNormalizationContext,
): boolean {
  if (!context.referenceKeywords.has(keyword) || typeof child !== 'string') return false
  const resolved = absoluteUri(child, nodeState.base)
  if (resolved === undefined) {
    throw new SchemaResourceResolutionError(
      `Cannot resolve schema reference "${child}" at "${position}/${keyword}" in the resource retrieved from "${context.retrievalUri}".`,
      context.retrievalUri,
      `${position}/${keyword}`,
    )
  }
  const anchor = context.legacyAnchors.get(resolved)
  defineRemoteSchemaProperty(output, keyword, anchor === undefined ? resolved : `${anchor.base}#${anchor.pointer}`)
  return true
}

function normalizeLegacyRemoteSchemaProperty(
  output: Record<string, unknown>,
  keyword: string,
  child: unknown,
  position: string,
  nodeState: RemoteSchemaNodeState,
  context: RemoteSchemaNormalizationContext,
): boolean {
  if (!nodeState.ignoresSiblings) return false
  if (DEFINITION_KEYS[context.dialect].includes(keyword) && isRecord(child)) {
    const members = Object.fromEntries(Object.entries(child).map(([name, member]) => [
      name,
      isRecord(member) || typeof member === 'boolean'
        ? normalizeRemoteSchemaValue(member, nodeState.base, `${position}/${keyword}/${escape(name)}`, false, context)
        : cloneValue(member),
    ]))
    defineRemoteSchemaProperty(output, keyword, members)
  } else {
    defineRemoteSchemaProperty(output, keyword, cloneValue(child))
  }
  return true
}

function normalizeRemoteSchemaSingle(
  output: Record<string, unknown>,
  keyword: string,
  child: unknown,
  position: string,
  nodeState: RemoteSchemaNodeState,
  context: RemoteSchemaNormalizationContext,
): boolean {
  if (!SINGLE[context.dialect].has(keyword) || (!isRecord(child) && typeof child !== 'boolean')) return false
  defineRemoteSchemaProperty(
    output,
    keyword,
    normalizeRemoteSchemaValue(child, nodeState.base, `${position}/${keyword}`, false, context),
  )
  return true
}

function normalizeRemoteSchemaList(
  output: Record<string, unknown>,
  keyword: string,
  child: unknown,
  position: string,
  nodeState: RemoteSchemaNodeState,
  context: RemoteSchemaNormalizationContext,
): boolean {
  if (!LIST[context.dialect].has(keyword) || !Array.isArray(child)) return false
  const normalized = child.map((member, index) =>
    normalizeRemoteSchemaValue(member, nodeState.base, `${position}/${keyword}/${index}`, false, context),
  )
  defineRemoteSchemaProperty(output, keyword, normalized)
  return true
}

function normalizeRemoteSchemaMap(
  output: Record<string, unknown>,
  keyword: string,
  child: unknown,
  position: string,
  nodeState: RemoteSchemaNodeState,
  context: RemoteSchemaNormalizationContext,
): boolean {
  if (!MAP[context.dialect].has(keyword) || !isRecord(child)) return false
  const normalized = Object.fromEntries(Object.entries(child).map(([name, member]) => [
    name,
    normalizeRemoteSchemaMapMember(member, keyword, name, position, nodeState, context),
  ]))
  defineRemoteSchemaProperty(output, keyword, normalized)
  return true
}

function normalizeRemoteSchemaMapMember(
  member: unknown,
  keyword: string,
  name: string,
  position: string,
  nodeState: RemoteSchemaNodeState,
  context: RemoteSchemaNormalizationContext,
): unknown {
  if (Array.isArray(member) && keyword === 'dependencies') return cloneValue(member)
  if (isRecord(member) || typeof member === 'boolean') {
    return normalizeRemoteSchemaValue(
      member,
      nodeState.base,
      `${position}/${keyword}/${escape(name)}`,
      false,
      context,
    )
  }
  return cloneValue(member)
}

function normalizeRemoteSchemaTupleItems(
  output: Record<string, unknown>,
  keyword: string,
  child: unknown,
  position: string,
  nodeState: RemoteSchemaNodeState,
  context: RemoteSchemaNormalizationContext,
): boolean {
  if (keyword !== 'items' || context.dialect === '2020-12' || !Array.isArray(child)) return false
  const normalized = child.map((member, index) =>
    normalizeRemoteSchemaValue(member, nodeState.base, `${position}/items/${index}`, false, context),
  )
  defineRemoteSchemaProperty(output, keyword, normalized)
  return true
}

function addRemoteSchemaRootMetadata(
  output: Record<string, unknown>,
  context: RemoteSchemaNormalizationContext,
): void {
  output.$id = context.rootIdentifier
  if (context.dialect === 'draft-04') output.id = context.rootIdentifier
  if (!Object.hasOwn(output, '$schema')) output.$schema = metaSchemaUri(context.dialect)
}

function canonicalRemote(uri: string, schema: unknown, dialect: Dialect): NormalizedResource {
  if (!isRecord(schema) && typeof schema !== 'boolean') {
    throw new SchemaResourceResolutionError(`The resource resolver returned a non-schema value for "${uri}".`, uri)
  }
  const idKeyword = identifierKeyword(dialect)
  const declaredId = isRecord(schema) ? schema[idKeyword] : undefined
  if (declaredId !== undefined && typeof declaredId !== 'string') {
    throw new SchemaResourceResolutionError(`The resource at "${uri}" has a non-string ${idKeyword}.`, uri)
  }
  const id = typeof declaredId === 'string' ? declaredId : uri
  const resolvedId = absoluteUri(id, uri)
  if (resolvedId === undefined) {
    throw new SchemaResourceResolutionError(`The resource at "${uri}" declares an unresolvable $id.`, uri)
  }
  const canonicalBase = withoutFragment(resolvedId)
  if (canonicalBase.startsWith('file:')) {
    throw new SchemaResourceResolutionError(`File schema resources are not supported: "${canonicalBase}".`, canonicalBase)
  }
  const primary = remoteSchema(schema, uri, dialect, canonicalBase, resolvedId)
  const aliases = withoutFragment(resolvedId) === uri
    ? []
    : [remoteSchema(
        schema,
        uri,
        dialect,
        canonicalBase,
        isPre2019Dialect(dialect) && resolvedId.includes('#') ? `${uri}${resolvedId.slice(resolvedId.indexOf('#'))}` : uri,
      )]
  return { primary, aliases, canonicalBase }
}

function isMetaSchema(uri: string): boolean {
  return META_URIS.has(uri)
}

interface ExternalResourceQueueItem {
  readonly document: unknown
  readonly base: string | undefined
}

interface ExternalResourceScanState {
  readonly dialect: Dialect
  readonly resolver: SchemaResourceResolver
  readonly maximum: number
  readonly known: Set<string>
  readonly resources: Map<string, unknown>
  readonly documents: Map<string, unknown>
  readonly scanned: Set<string>
  readonly queue: ExternalResourceQueueItem[]
  readonly loading: Map<string, Promise<NormalizedResource>>
}

export async function loadExternalResources(
  schema: unknown,
  dialect: Dialect,
  options: SchemaResourceOptions | undefined,
): Promise<unknown[]> {
  const resolver = options?.resolveResource
  const identifier = isRecord(schema) ? schemaIdentifier(schema, dialect) : undefined
  const rootId = typeof identifier === 'string'
    ? resourceBase(identifier, undefined, dialect)
    : undefined
  const known = declaredResourceIds(schema, rootId, dialect)
  if (rootId) known.add(rootId)
  if (!resolver) {
    referencesIn(schema, rootId, dialect, known)
    return []
  }
  const maximum = options?.maxExternalResources ?? DEFAULT_MAX_EXTERNAL_RESOURCES
  if (!Number.isInteger(maximum) || maximum < 1) throw new RangeError('maxExternalResources must be a positive integer.')
  const state: ExternalResourceScanState = {
    dialect,
    resolver,
    maximum,
    known,
    resources: new Map(),
    documents: new Map(),
    scanned: new Set(),
    queue: [{ document: schema, base: rootId }],
    loading: new Map(),
  }
  await scanExternalResourceQueue(state)
  return [...state.documents.values()]
}

async function scanExternalResourceQueue(state: ExternalResourceScanState): Promise<void> {
  while (state.queue.length > 0) {
    const current = state.queue.shift()!
    const key = current.base ?? `anonymous:${state.scanned.size}`
    if (state.scanned.has(key)) continue
    state.scanned.add(key)
    const references = referencesIn(current.document, current.base, state.dialect, state.known)
    for (const reference of references) {
      // Sequential loading keeps mutations to the resource graph in traversal order.
      await processExternalReference(reference, state) // NOSONAR
    }
  }
}

async function processExternalReference(
  reference: LocatedReference,
  state: ExternalResourceScanState,
): Promise<void> {
  if (reference.reference.startsWith('#')) return
  const resolved = absoluteUri(reference.reference, reference.base)
  if (resolved === undefined) {
    throw new SchemaResourceResolutionError(
      `Cannot resolve relative schema reference "${reference.reference}" at "${reference.position}" without an absolute base URI.`,
      undefined,
      reference.position,
    )
  }
  const uri = withoutFragment(resolved)
  rejectFileExternalResource(uri, reference.position)
  if (!uri || isMetaSchema(uri) || state.known.has(uri) || state.resources.has(uri)) return

  const loaded = await loadNormalizedExternalResource(uri, reference.position, state)
  validateLoadedExternalDialect(uri, reference.position, loaded, state.dialect)
  registerLoadedExternalResource(uri, reference.position, loaded, state)
}

function rejectFileExternalResource(uri: string, position: string): void {
  if (!uri.startsWith('file:')) return
  throw new SchemaResourceResolutionError(`File schema resources are not supported: "${uri}" at "${position}".`, uri, position)
}

async function loadNormalizedExternalResource(
  uri: string,
  position: string,
  state: ExternalResourceScanState,
): Promise<NormalizedResource> {
  const existing = state.loading.get(uri)
  if (existing) return existing
  if (state.loading.size >= state.maximum) {
    throw new SchemaResourceResolutionError(
      `The external schema resource limit of ${state.maximum} was exceeded at "${position}".`,
      uri,
      position,
    )
  }
  const promise = Promise.resolve(state.resolver(uri)).then((resolved) => {
    if (resolved === undefined) {
      throw new SchemaResourceResolutionError(
        `No schema resource was returned for "${uri}" referenced at "${position}".`,
        uri,
        position,
      )
    }
    return canonicalRemote(uri, resolved, state.dialect)
  })
  state.loading.set(uri, promise)
  return promise
}

function validateLoadedExternalDialect(
  uri: string,
  position: string,
  loaded: NormalizedResource,
  dialect: Dialect,
): void {
  const remoteDialect = detectDialect(loaded.primary, { defaultDialect: dialect })
  if (remoteDialect !== dialect) {
    throw new SchemaResourceResolutionError(
      `The resource at "${uri}" uses ${remoteDialect}, but this adapter uses ${dialect}.`,
      uri,
      position,
    )
  }
}

function registerLoadedExternalResource(
  uri: string,
  position: string,
  loaded: NormalizedResource,
  state: ExternalResourceScanState,
): void {
  state.resources.set(uri, loaded.primary)
  state.known.add(uri)
  registerNestedExternalResourceIds(loaded, state)
  registerExternalResourceDocuments(uri, position, loaded, state)
  state.queue.push({ document: loaded.primary, base: loaded.canonicalBase })
}

function registerNestedExternalResourceIds(
  loaded: NormalizedResource,
  state: ExternalResourceScanState,
): void {
  const nested = declaredResourceIds(loaded.primary, loaded.canonicalBase, state.dialect)
  for (const id of nested) state.known.add(id)
}

function registerExternalResourceDocuments(
  uri: string,
  position: string,
  loaded: NormalizedResource,
  state: ExternalResourceScanState,
): void {
  for (const document of [loaded.primary, ...loaded.aliases]) {
    const id = isRecord(document) && typeof document.$id === 'string' ? document.$id : undefined
    if (id === undefined) {
      throw new SchemaResourceResolutionError(`A normalized resource for "${uri}" has no $id.`, uri, position)
    }
    const previous = state.documents.get(id)
    if (previous !== undefined && !structurallyEqual(previous, document)) {
      throw new SchemaResourceResolutionError(
        `Two retrieved resources declare conflicting schemas for "$id ${id}".`,
        uri,
        position,
      )
    }
    state.documents.set(id, document)
    state.known.add(withoutFragment(id))
  }
}

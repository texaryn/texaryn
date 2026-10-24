import type { MaybePromise } from '@texaryn/core'
import { detectDialect, identifierKeyword, isPre2019Dialect, schemaIdentifier, type Dialect } from './dialect.js'
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

const SINGLE: Record<Dialect, ReadonlySet<string>> = {
  'draft-04': new Set(['additionalItems', 'additionalProperties', 'items', 'not']),
  'draft-07': new Set([
    'additionalItems',
    'additionalProperties',
    'contains',
    'else',
    'if',
    'items',
    'not',
    'propertyNames',
    'then',
  ]),
  '2019-09': new Set([
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
  ]),
  '2020-12': new Set([
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
  ]),
}
const LIST: Record<Dialect, ReadonlySet<string>> = {
  'draft-04': new Set(['allOf', 'anyOf', 'items', 'oneOf']),
  'draft-07': new Set(['allOf', 'anyOf', 'oneOf']),
  '2019-09': new Set(['allOf', 'anyOf', 'oneOf']),
  '2020-12': new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']),
}
const MAP: Record<Dialect, ReadonlySet<string>> = {
  'draft-04': new Set(['definitions', 'dependencies', 'patternProperties', 'properties']),
  'draft-07': new Set(['$defs', 'definitions', 'dependencies', 'patternProperties', 'properties']),
  '2019-09': new Set(['$defs', 'definitions', 'dependencies', 'dependentSchemas', 'patternProperties', 'properties']),
  '2020-12': new Set(['$defs', 'definitions', 'dependencies', 'dependentSchemas', 'patternProperties', 'properties']),
}
const DEFINITION_KEYS: Record<Dialect, readonly string[]> = {
  'draft-04': ['definitions'],
  'draft-07': ['$defs', 'definitions'],
  '2019-09': ['definitions', '$defs'],
  '2020-12': ['definitions', '$defs'],
}
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

function absoluteUri(reference: string, base: string | undefined): string | undefined {
  try {
    return base === undefined ? new URL(reference).href : new URL(reference, base).href
  } catch {
    return undefined
  }
}

function decodeUriFragment(fragment: string): string {
  try {
    return decodeURIComponent(fragment)
  } catch {
    return fragment
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

interface LocalReferenceTarget {
  readonly schema: unknown
  readonly base: string | undefined
  readonly position: string
  readonly resourceRoot: unknown
  readonly resourceRootPosition: string
}

type SchemaNodeVisitor = (schema: unknown, parentBase: string | undefined, position: string) => void

function visitTupleSchemaItems(
  record: Record<string, unknown>,
  position: string,
  base: string | undefined,
  dialect: Dialect,
  visit: SchemaNodeVisitor,
): void {
  if (dialect === '2020-12' || !Array.isArray(record.items)) return
  record.items.forEach((child, index) => visit(child, base, `${position}/items/${index}`))
}

interface ResourcePositionContext {
  readonly base: string | undefined
  readonly startsResource: boolean
}

function resourcePositionContext(
  record: Record<string, unknown>,
  parentBase: string | undefined,
  dialect: Dialect,
): ResourcePositionContext {
  const identifier = schemaIdentifier(record, dialect)
  const ignoresSiblings = isPre2019Dialect(dialect) && typeof record.$ref === 'string'
  const base = ignoresSiblings ? parentBase : resourceBase(identifier, parentBase, dialect)
  const startsResource = !ignoresSiblings && typeof identifier === 'string' && !(isPre2019Dialect(dialect) && identifier.startsWith('#'))
  return { base, startsResource }
}

function recordResourcePosition(
  schema: unknown,
  position: string,
  context: ResourcePositionContext,
  documentBase: string | undefined,
  documentKey: string,
  resourcePositions: Map<string, { document: string; position: string; schema: unknown }>,
): void {
  if (!context.startsResource || context.base === undefined) return
  if (context.base === documentBase && position !== '#' && resourcePositions.has(context.base)) return
  resourcePositions.set(context.base, { document: documentKey, position, schema })
}

function visitResourceChildren(
  record: Record<string, unknown>,
  position: string,
  base: string | undefined,
  dialect: Dialect,
  visit: SchemaNodeVisitor,
): void {
  if (visitLegacyResourceDefinitions(record, position, base, dialect, visit)) return
  for (const keyword of SINGLE[dialect]) visit(record[keyword], base, `${position}/${keyword}`)
  for (const keyword of LIST[dialect]) {
    const children = record[keyword]
    if (Array.isArray(children)) children.forEach((child, index) => visit(child, base, `${position}/${keyword}/${index}`))
  }
  for (const keyword of MAP[dialect]) {
    const children = record[keyword]
    if (!isRecord(children)) continue
    for (const [key, child] of Object.entries(children)) visit(child, base, `${position}/${keyword}/${escape(key)}`)
  }
  visitTupleSchemaItems(record, position, base, dialect, visit)
}

function visitLegacyResourceDefinitions(
  record: Record<string, unknown>,
  position: string,
  base: string | undefined,
  dialect: Dialect,
  visit: SchemaNodeVisitor,
): boolean {
  if (!isPre2019Dialect(dialect) || typeof record.$ref !== 'string') return false
  for (const keyword of DEFINITION_KEYS[dialect]) {
    const children = record[keyword]
    if (!isRecord(children)) continue
    for (const [key, child] of Object.entries(children)) visit(child, base, `${position}/${keyword}/${escape(key)}`)
  }
  return true
}

interface PendingLocalReferenceOptions {
  readonly localReferences: readonly LocalReference[]
  readonly visitedLocalReferences: Set<number>
  readonly anchorTargets: Map<string, { schema: unknown; base: string | undefined; position: string }>
  readonly contextsByPosition: Map<string, { base: string | undefined; resourceRoot: unknown; resourceRootPosition: string }>
  readonly dialect: Dialect
  readonly knownResources: Set<string> | undefined
  readonly visit: (schema: unknown, parentBase: string | undefined, position: string, resourceRoot: unknown, resourceRootPosition: string) => void
}

function localReferenceTarget(
  local: LocalReference,
  options: Pick<PendingLocalReferenceOptions, 'anchorTargets' | 'dialect' | 'knownResources'>,
): LocalReferenceTarget | undefined {
  const hash = local.uri.indexOf('#')
  const fragment = hash === -1 ? '' : local.uri.slice(hash + 1)
  if (fragment !== '' && !fragment.startsWith('/')) {
    const anchor = options.anchorTargets.get(local.uri)
    if (anchor === undefined) return undefined
    return {
      schema: anchor.schema,
      base: anchor.base ?? local.base,
      position: anchor.position,
      resourceRoot: local.resourceRoot,
      resourceRootPosition: local.resourceRootPosition,
    }
  }

  const located = pointerTargetWithContext(
    local.resourceRoot,
    fragment,
    local.base,
    local.resourceRootPosition,
    options.dialect,
    options.knownResources,
  )
  return {
    schema: located?.schema,
    base: fragment === '' ? local.base : located?.parentBase ?? local.base,
    position: located?.position ?? local.resourceRootPosition,
    resourceRoot: located?.resourceRoot ?? local.resourceRoot,
    resourceRootPosition: located?.resourceRootPosition ?? local.resourceRootPosition,
  }
}

function visitPendingLocalReference(index: number, options: PendingLocalReferenceOptions): boolean {
  if (options.visitedLocalReferences.has(index)) return false
  const local = options.localReferences[index]!
  const target = localReferenceTarget(local, options)
  if (target === undefined) {
    options.visitedLocalReferences.delete(index)
    return false
  }
  options.visitedLocalReferences.add(index)
  if (isRecord(target.schema) || typeof target.schema === 'boolean') {
    if (!options.contextsByPosition.has(target.position)) {
      options.visit(target.schema, target.base, target.position, target.resourceRoot, target.resourceRootPosition)
    }
  }
  return true
}

function scanPendingLocalReferences(options: PendingLocalReferenceOptions): boolean {
  let progressed = false
  for (let index = 0; index < options.localReferences.length; index += 1) {
    if (visitPendingLocalReference(index, options)) progressed = true
  }
  return progressed
}

function visitPendingLocalReferences(options: PendingLocalReferenceOptions): void {
  let progressed = true
  while (progressed) progressed = scanPendingLocalReferences(options)
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

interface PointerChild {
  readonly schema: unknown
}

interface PointerResourceContext {
  readonly base: string | undefined
  readonly resourceRoot: unknown
  readonly resourceRootPosition: string
}

function pointerChildAt(current: unknown, segment: string): PointerChild | undefined {
  if (Array.isArray(current)) {
    const index = Number(segment)
    if (!Number.isInteger(index) || index < 0 || index >= current.length || !Object.hasOwn(current, index)) return undefined
    return { schema: current[index] }
  }
  if (isRecord(current) && Object.hasOwn(current, segment)) return { schema: current[segment] }
  return undefined
}

function pointerResourceContext(
  schema: unknown,
  context: PointerResourceContext,
  position: string,
  dialect: Dialect,
  knownResources?: Set<string>,
): PointerResourceContext {
  if (!isRecord(schema) || (isPre2019Dialect(dialect) && typeof schema.$ref === 'string')) return context
  const identifier = schemaIdentifier(schema, dialect)
  if (typeof identifier !== 'string') return context
  const base = resourceBase(identifier, context.base, dialect)
  if (base === undefined) return context
  knownResources?.add(base)
  const embeddedDialect = detectDialect(schema, { defaultDialect: dialect })
  if (embeddedDialect !== dialect) {
    throw new SchemaResourceResolutionError(
      `The resource at "${base}" uses ${embeddedDialect}, but this adapter uses ${dialect}.`,
      base,
      position,
    )
  }
  if (isPre2019Dialect(dialect) && identifier.startsWith('#')) return context
  return { base, resourceRoot: schema, resourceRootPosition: position }
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
  if (pointer === '') return {
    schema: document,
    parentBase: initialBase,
    base: initialBase,
    resourceRoot: document,
    resourceRootPosition: initialPosition,
    position: initialPosition,
  }
  if (!pointer.startsWith('/')) return undefined

  let current = document
  let base = initialBase
  let resourceRoot = document
  let resourceRootPosition = initialPosition
  let position = initialPosition
  let parentBase = base
  const segments = pointer.slice(1).split('/')
  for (const rawSegment of segments) {
    const segment = rawSegment.replaceAll('~1', '/').replaceAll('~0', '~')
    const pointerChild = pointerChildAt(current, segment)
    if (pointerChild === undefined) return undefined

    parentBase = base
    position = `${position}/${escape(segment)}`
    const context = pointerResourceContext(pointerChild.schema, { base, resourceRoot, resourceRootPosition }, position, dialect, knownResources)
    base = context.base
    resourceRoot = context.resourceRoot
    resourceRootPosition = context.resourceRootPosition
    current = pointerChild.schema
  }
  const target = current
  return { schema: target, parentBase, base, resourceRoot, resourceRootPosition, position }
}

function seenAtBase(seen: WeakMap<object, Set<string | undefined>>, schema: object, base: string | undefined): boolean {
  const bases = seen.get(schema) ?? new Set<string | undefined>()
  if (bases.has(base)) return true
  bases.add(base)
  seen.set(schema, bases)
  return false
}

interface ReferenceScanOptions {
  readonly document: unknown
  readonly initialBase: string | undefined
  readonly dialect: Dialect
  readonly knownResources?: Set<string>
  readonly initialPosition?: string
  readonly initialResourceRoot?: unknown
  readonly initialResourceRootPosition?: string
  readonly entryPointerFragments?: readonly string[]
}

function referencesIn({
  document,
  initialBase,
  dialect,
  knownResources,
  initialPosition = '#',
  initialResourceRoot = document,
  initialResourceRootPosition = initialPosition,
  entryPointerFragments = [],
}: ReferenceScanOptions): LocatedReference[] {
  const references = new Map<string, LocatedReference>()
  const seen = new WeakMap<object, Set<string | undefined>>()
  const localReferences: LocalReference[] = []
  const anchorTargets = new Map<string, { schema: unknown; base: string | undefined; position: string }>()
  const contextsByPosition = new Map<string, { base: string | undefined; resourceRoot: unknown; resourceRootPosition: string }>()
  const visitedLocalReferences = new Set<number>()
  const referenceKeywordSet = new Set(referenceKeywords(dialect))

  const recordSchemaContext = (
    record: Record<string, unknown>,
    parentBase: string | undefined,
    position: string,
    resourceRoot: unknown,
    resourceRootPosition: string,
  ) => {
    const identifier = schemaIdentifier(record, dialect)
    const ignoresSiblings = isPre2019Dialect(dialect) && typeof record.$ref === 'string'
    const base = ignoresSiblings ? parentBase : resourceBase(identifier, parentBase, dialect)
    if (!ignoresSiblings && typeof identifier === 'string' && base !== undefined) {
      knownResources?.add(base)
      const embeddedDialect = detectDialect(record, { defaultDialect: dialect })
      if (embeddedDialect !== dialect) {
        throw new SchemaResourceResolutionError(
          `The resource at "${base}" uses ${embeddedDialect}, but this adapter uses ${dialect}.`,
          base,
          position,
        )
      }
    }
    const startsResource = !ignoresSiblings && typeof identifier === 'string' && !(isPre2019Dialect(dialect) && identifier.startsWith('#'))
    const currentRoot = startsResource ? record : resourceRoot
    const currentRootPosition = startsResource ? position : resourceRootPosition
    contextsByPosition.set(position, { base, resourceRoot: currentRoot, resourceRootPosition: currentRootPosition })
    return { identifier, ignoresSiblings, base, currentRoot, currentRootPosition }
  }

  const recordAnchors = (
    schema: Record<string, unknown>,
    parentBase: string | undefined,
    position: string,
    context: ReturnType<typeof recordSchemaContext>,
  ): void => {
    const { identifier, ignoresSiblings, base } = context
    if (!ignoresSiblings && isPre2019Dialect(dialect) && typeof identifier === 'string' && identifier.startsWith('#')) {
      const anchorUri = absoluteUri(identifier, parentBase) ?? (parentBase === undefined ? identifier : undefined)
      if (anchorUri !== undefined) anchorTargets.set(anchorUri, { schema, base, position })
    }
    if (!isPre2019Dialect(dialect) && typeof schema.$anchor === 'string') {
      anchorTargets.set(`${base ?? ''}#${schema.$anchor}`, { schema, base, position })
    }
    if (dialect === '2020-12' && typeof schema.$dynamicAnchor === 'string') {
      anchorTargets.set(`${base ?? ''}#${schema.$dynamicAnchor}`, { schema, base, position })
    }
  }

  const recordReferences = (
    record: Record<string, unknown>,
    position: string,
    context: ReturnType<typeof recordSchemaContext>,
  ): void => {
    const { base, currentRoot, currentRootPosition } = context
    for (const keyword of referenceKeywordSet) {
      const reference = record[keyword]
      if (typeof reference !== 'string') continue
      references.set(JSON.stringify([base, reference]), { base, reference, position: `${position}/${keyword}` })
      const resolved = absoluteUri(reference, base)
      const localUri = resolved ?? (base === undefined && reference.startsWith('#') ? reference : undefined)
      if (localUri !== undefined && (base === undefined || withoutFragment(localUri) === base)) {
        localReferences.push({
          uri: localUri,
          base,
          resourceRoot: currentRoot,
          resourceRootPosition: currentRootPosition,
        })
      }
    }
  }

  const visit = (
    schema: unknown,
    parentBase: string | undefined,
    position: string,
    resourceRoot: unknown,
    resourceRootPosition: string,
  ): void => {
    if (typeof schema !== 'object' || schema === null) return
    if (Array.isArray(schema)) {
      if (!seenAtBase(seen, schema, parentBase)) {
        schema.forEach((child, index) => visit(child, parentBase, `${position}/${index}`, resourceRoot, resourceRootPosition))
      }
      return
    }

    const record = schema as Record<string, unknown>
    const context = recordSchemaContext(record, parentBase, position, resourceRoot, resourceRootPosition)
    if (seenAtBase(seen, schema, parentBase)) return
    recordAnchors(record, parentBase, position, context)
    recordReferences(record, position, context)
    visitChildren(record, position, context)
  }

  function visitChildren(
    record: Record<string, unknown>,
    position: string,
    context: ReturnType<typeof recordSchemaContext>,
  ): void {
    if (visitLegacyDefinitions(record, position, context)) return
    visitSingleSchemas(record, position, context)
    visitListSchemas(record, position, context)
    visitMapSchemas(record, position, context)
    visitTupleSchemaItems(record, position, context.base, dialect, (child, base, childPosition) => {
      visit(child, base, childPosition, context.currentRoot, context.currentRootPosition)
    })
  }

  function visitLegacyDefinitions(
    record: Record<string, unknown>,
    position: string,
    context: ReturnType<typeof recordSchemaContext>,
  ): boolean {
    if (!isPre2019Dialect(dialect) || typeof record.$ref !== 'string') return false
    for (const keyword of ['definitions', '$defs']) {
      const children = record[keyword]
      if (!isRecord(children)) continue
      for (const [key, child] of Object.entries(children)) {
        if (isRecord(child) || typeof child === 'boolean') {
          visit(child, context.base, `${position}/${keyword}/${escape(key)}`, context.currentRoot, context.currentRootPosition)
        }
      }
    }
    return true
  }

  function visitSingleSchemas(
    record: Record<string, unknown>,
    position: string,
    context: ReturnType<typeof recordSchemaContext>,
  ): void {
    for (const keyword of SINGLE[dialect]) {
      const child = record[keyword]
      if (isRecord(child) || typeof child === 'boolean') {
        visit(child, context.base, `${position}/${keyword}`, context.currentRoot, context.currentRootPosition)
      }
    }
  }

  function visitListSchemas(
    record: Record<string, unknown>,
    position: string,
    context: ReturnType<typeof recordSchemaContext>,
  ): void {
    for (const keyword of LIST[dialect]) {
      const children = record[keyword]
      if (Array.isArray(children)) {
        children.forEach((child, index) => visit(child, context.base, `${position}/${keyword}/${index}`, context.currentRoot, context.currentRootPosition))
      }
    }
  }

  function visitMapSchemas(
    record: Record<string, unknown>,
    position: string,
    context: ReturnType<typeof recordSchemaContext>,
  ): void {
    for (const keyword of MAP[dialect]) {
      const children = record[keyword]
      if (!isRecord(children)) continue
      for (const [key, child] of Object.entries(children)) {
        if (isRecord(child) || typeof child === 'boolean') {
          visit(child, context.base, `${position}/${keyword}/${escape(key)}`, context.currentRoot, context.currentRootPosition)
        }
      }
    }
  }

  visit(document, initialBase, initialPosition, initialResourceRoot, initialResourceRootPosition)
  for (const fragment of entryPointerFragments) {
    const identifier = isRecord(document) ? schemaIdentifier(document, dialect) : undefined
    const pointerBase = resourceBase(identifier, initialBase, dialect)
    const located = pointerTargetWithContext(
      document,
      fragment,
      pointerBase,
      initialPosition,
      dialect,
      knownResources,
    )
    if (located !== undefined) {
      visit(located.schema, located.parentBase, located.position, located.resourceRoot, located.resourceRootPosition)
    }
  }
  visitPendingLocalReferences({
    localReferences,
    visitedLocalReferences,
    anchorTargets,
    contextsByPosition,
    dialect,
    knownResources,
    visit,
  })
  return [...references.values()]
}

export function referencedPointerTargets(documents: readonly unknown[], dialect: Dialect): Map<string, ReadonlySet<string>> {
  const state: ReferencedPointerScanState = {
    dialect,
    targets: new Map(),
    resourcePositions: new Map(),
    documentScanners: new Map(),
    knownResources: new Set(),
    pendingReferences: [],
    scannedTargets: new Set(),
  }
  for (const document of documents) indexReferencedDocument(document, state)
  collectDocumentReferences(documents, state)
  scanReferencedPointerTargets(state)
  return state.targets
}

interface ReferencedPointerScanState {
  readonly dialect: Dialect
  readonly targets: Map<string, Set<string>>
  readonly resourcePositions: Map<string, { document: string; position: string; schema: unknown }>
  readonly documentScanners: Map<string, (schema: unknown, base: string | undefined, position: string) => void>
  readonly knownResources: Set<string>
  readonly pendingReferences: LocatedReference[]
  readonly scannedTargets: Set<string>
}

interface ReferencedDocumentIndex {
  readonly dialect: Dialect
  readonly documentBase: string | undefined
  readonly documentKey: string
  readonly resourcePositions: ReferencedPointerScanState['resourcePositions']
  readonly seen: WeakMap<object, Set<string | undefined>>
}

function indexReferencedDocument(document: unknown, state: ReferencedPointerScanState): void {
  const identifier = isRecord(document) ? schemaIdentifier(document, state.dialect) : undefined
  const documentBase = resourceBase(identifier, undefined, state.dialect)
  const documentKey = documentBase ?? ''
  if (documentBase !== undefined) {
    state.resourcePositions.set(documentBase, { document: documentKey, position: '#', schema: document })
  }
  const index: ReferencedDocumentIndex = {
    dialect: state.dialect,
    documentBase,
    documentKey,
    resourcePositions: state.resourcePositions,
    seen: new WeakMap(),
  }
  const scan = (schema: unknown, base: string | undefined, position: string): void => {
    visitIndexedResource(schema, base, position, index)
  }
  scan(document, documentBase, '#')
  state.documentScanners.set(documentKey, scan)
}

function visitIndexedResource(
  schema: unknown,
  parentBase: string | undefined,
  position: string,
  index: ReferencedDocumentIndex,
): void {
  if (typeof schema !== 'object' || schema === null || seenAtBase(index.seen, schema, parentBase)) return
  if (Array.isArray(schema)) {
    schema.forEach((child, childIndex) => visitIndexedResource(child, parentBase, `${position}/${childIndex}`, index))
    return
  }
  const record = schema as Record<string, unknown>
  const context = resourcePositionContext(record, parentBase, index.dialect)
  recordResourcePosition(schema, position, context, index.documentBase, index.documentKey, index.resourcePositions)
  visitResourceChildren(record, position, context.base, index.dialect, (child, base, childPosition) =>
    visitIndexedResource(child, base, childPosition, index),
  )
}

function collectDocumentReferences(
  documents: readonly unknown[],
  state: ReferencedPointerScanState,
): void {
  for (const document of documents) {
    const identifier = isRecord(document) ? schemaIdentifier(document, state.dialect) : undefined
    const base = typeof identifier === 'string' ? resourceBase(identifier, undefined, state.dialect) : undefined
    state.pendingReferences.push(...referencesIn({
      document,
      initialBase: base,
      dialect: state.dialect,
      knownResources: state.knownResources,
    }))
  }
}

function scanReferencedPointerTargets(state: ReferencedPointerScanState): void {
  for (const reference of state.pendingReferences) scanReferencedPointerTarget(reference, state)
}

function scanReferencedPointerTarget(
  reference: LocatedReference,
  state: ReferencedPointerScanState,
): void {
  const resolved = absoluteUri(reference.reference, reference.base)
  if (resolved === undefined) return
  const fragment = pointerFragment(resolved)
  if (fragment === undefined) return
  const base = withoutFragment(resolved)
  const resource = state.resourcePositions.get(base)
  if (resource === undefined) return
  const pointer = resource.position === '#' ? `#${decodeUriFragment(fragment)}` : `${resource.position}${decodeUriFragment(fragment)}`
  const pointers = state.targets.get(resource.document) ?? new Set<string>()
  pointers.add(pointer)
  state.targets.set(resource.document, pointers)

  const targetKey = `${resource.document}\n${pointer}`
  if (state.scannedTargets.has(targetKey)) return
  state.scannedTargets.add(targetKey)
  appendPointerTargetReferences(resource, base, fragment, state)
}

function pointerFragment(resolved: string): string | undefined {
  const hash = resolved.indexOf('#')
  if (hash === -1) return undefined
  const fragment = resolved.slice(hash + 1)
  return decodeUriFragment(fragment).startsWith('/') ? fragment : undefined
}

function appendPointerTargetReferences(
  resource: { document: string; position: string; schema: unknown },
  base: string,
  fragment: string,
  state: ReferencedPointerScanState,
): void {
  const located = pointerTargetWithContext(
    resource.schema,
    fragment,
    base,
    resource.position,
    state.dialect,
    state.knownResources,
  )
  if (located === undefined) return
  state.documentScanners.get(resource.document)?.(located.schema, located.parentBase, located.position)
  state.pendingReferences.push(...referencesIn({
    document: located.schema,
    initialBase: located.parentBase,
    dialect: state.dialect,
    knownResources: state.knownResources,
    initialPosition: located.position,
    initialResourceRoot: located.resourceRoot,
    initialResourceRootPosition: located.resourceRootPosition,
  }))
}

function declaredResourceIds(
  document: unknown,
  initialBase: string | undefined,
  dialect: Dialect,
  resourceSchemas?: Map<string, { schema: unknown; parentBase: string | undefined }>,
): Set<string> {
  const ids = new Set<string>()
  if (initialBase !== undefined && !resourceSchemas?.has(initialBase)) {
    resourceSchemas?.set(initialBase, { schema: document, parentBase: initialBase })
  }
  const seen = new WeakMap<object, Set<string | undefined>>()
  const visit = (schema: unknown, parentBase: string | undefined, position: string): void => {
    if (typeof schema !== 'object' || schema === null || seenAtBase(seen, schema, parentBase)) return
    if (Array.isArray(schema)) {
      schema.forEach((child, index) => visit(child, parentBase, `${position}/${index}`))
      return
    }
    const record = schema as Record<string, unknown>
    const context = declaredResourceContext(record, parentBase)
    recordDeclaredResource(schema, record, parentBase, position, context)
    if (visitLegacyDefinitions(record, position, context)) return
    visitSingleSchemas(record, position, context.base)
    visitListSchemas(record, position, context.base)
    visitMapSchemas(record, position, context.base)
    visitTupleSchemaItems(record, position, context.base, dialect, visit)
  }

  const declaredResourceContext = (record: Record<string, unknown>, parentBase: string | undefined) => {
    const identifier = schemaIdentifier(record, dialect)
    const ignoresSiblings = isPre2019Dialect(dialect) && typeof record.$ref === 'string'
    const base = ignoresSiblings ? parentBase : resourceBase(identifier, parentBase, dialect)
    const startsResource = !ignoresSiblings && typeof identifier === 'string' && !(isPre2019Dialect(dialect) && identifier.startsWith('#'))
    return { identifier, ignoresSiblings, base, startsResource }
  }

  const recordDeclaredResource = (
    schema: unknown,
    record: Record<string, unknown>,
    parentBase: string | undefined,
    position: string,
    context: ReturnType<typeof declaredResourceContext>,
  ): void => {
    const { identifier, ignoresSiblings, base, startsResource } = context
    if (!ignoresSiblings && typeof identifier === 'string' && base !== undefined) {
      ids.add(base)
      if (startsResource && !resourceSchemas?.has(base)) resourceSchemas?.set(base, { schema, parentBase })
      const embeddedDialect = detectDialect(record, { defaultDialect: dialect })
      if (embeddedDialect !== dialect) {
        throw new SchemaResourceResolutionError(
          `The resource at "${base}" uses ${embeddedDialect}, but this adapter uses ${dialect}.`,
          base,
          position,
        )
      }
    }
  }

  function visitLegacyDefinitions(
    record: Record<string, unknown>,
    position: string,
    context: ReturnType<typeof declaredResourceContext>,
  ): boolean {
    if (!context.ignoresSiblings) return false
    for (const keyword of ['definitions', '$defs']) {
      const children = record[keyword]
      if (!isRecord(children)) continue
      for (const [key, child] of Object.entries(children)) {
        if (isRecord(child) || typeof child === 'boolean') visit(child, context.base, `${position}/${keyword}/${escape(key)}`)
      }
    }
    return true
  }

  function visitSingleSchemas(record: Record<string, unknown>, position: string, base: string | undefined): void {
    for (const keyword of SINGLE[dialect]) {
      const child = record[keyword]
      if (isRecord(child) || typeof child === 'boolean') visit(child, base, `${position}/${keyword}`)
    }
  }

  function visitListSchemas(record: Record<string, unknown>, position: string, base: string | undefined): void {
    for (const keyword of LIST[dialect]) {
      const children = record[keyword]
      if (Array.isArray(children)) children.forEach((child, index) => visit(child, base, `${position}/${keyword}/${index}`))
    }
  }

  function visitMapSchemas(record: Record<string, unknown>, position: string, base: string | undefined): void {
    for (const keyword of MAP[dialect]) {
      const children = record[keyword]
      if (!isRecord(children)) continue
      for (const [key, child] of Object.entries(children)) {
        if (isRecord(child) || typeof child === 'boolean') visit(child, base, `${position}/${keyword}/${escape(key)}`)
      }
    }
  }

  visit(document, initialBase, '#')
  return ids
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

function legacyAnchorTargets(source: unknown, retrievalUri: string, dialect: Dialect): Map<string, { base: string; pointer: string }> {
  const state: LegacyAnchorScanState = {
    dialect,
    targets: new Map(),
    seen: new WeakMap(),
  }
  visitLegacyAnchorNode(source, retrievalUri, '#', retrievalUri, '#', state)
  return state.targets
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

function visitLegacyAnchorNode(
  schema: unknown,
  parentBase: string,
  position: string,
  resourceBase: string,
  resourcePosition: string,
  state: LegacyAnchorScanState,
): void {
  if (!isRecord(schema) || hasVisitedLegacyAnchorContext(schema, parentBase, resourcePosition, state)) return
  const context = legacyAnchorNodeContext(schema, parentBase, position, resourceBase, resourcePosition, state)
  if (context.ignoresSiblings) {
    visitLegacyAnchorDefinitions(schema, position, context, state)
    return
  }
  visitLegacyAnchorChildren(schema, position, context, state)
}

function hasVisitedLegacyAnchorContext(
  schema: Record<string, unknown>,
  parentBase: string,
  resourcePosition: string,
  state: LegacyAnchorScanState,
): boolean {
  const contexts = state.seen.get(schema) ?? new Set<string>()
  const key = `${parentBase}\u0000${resourcePosition}`
  if (contexts.has(key)) return true
  contexts.add(key)
  state.seen.set(schema, contexts)
  return false
}

function legacyAnchorNodeContext(
  schema: Record<string, unknown>,
  parentBase: string,
  position: string,
  resourceBase: string,
  resourcePosition: string,
  state: LegacyAnchorScanState,
): LegacyAnchorNodeContext {
  const identifier = schemaIdentifier(schema, state.dialect)
  const ignoresSiblings = typeof schema.$ref === 'string'
  if (ignoresSiblings || typeof identifier !== 'string') {
    return { base: parentBase, anchorBase: resourceBase, anchorPosition: resourcePosition, ignoresSiblings }
  }
  const resolved = absoluteUri(identifier, parentBase)
  if (resolved === undefined) {
    return { base: parentBase, anchorBase: resourceBase, anchorPosition: resourcePosition, ignoresSiblings }
  }
  if (isLegacyNamedAnchor(identifier, resolved)) {
    const pointer = position.startsWith(resourcePosition) ? position.slice(resourcePosition.length) : position.slice(1)
    state.targets.set(resolved, { base: resourceBase, pointer })
    return { base: parentBase, anchorBase: resourceBase, anchorPosition: resourcePosition, ignoresSiblings }
  }
  const base = withoutFragment(resolved)
  return { base, anchorBase: base, anchorPosition: position, ignoresSiblings }
}

function isLegacyNamedAnchor(identifier: string, resolved: string): boolean {
  const hash = resolved.indexOf('#')
  const fragment = hash === -1 ? undefined : resolved.slice(hash + 1)
  const namedAbsoluteFragment =
    !identifier.startsWith('#') &&
    fragment !== undefined &&
    fragment !== '' &&
    !fragment.startsWith('/')
  return identifier.startsWith('#') || namedAbsoluteFragment
}

function visitLegacyAnchorDefinitions(
  schema: Record<string, unknown>,
  position: string,
  context: LegacyAnchorNodeContext,
  state: LegacyAnchorScanState,
): void {
  for (const keyword of DEFINITION_KEYS[state.dialect]) {
    const map = schema[keyword]
    if (isRecord(map)) visitLegacyAnchorMap(map, position, keyword, context, state)
  }
}

function visitLegacyAnchorChildren(
  schema: Record<string, unknown>,
  position: string,
  context: LegacyAnchorNodeContext,
  state: LegacyAnchorScanState,
): void {
  visitLegacyAnchorSingleSchemas(schema, position, context, state)
  visitLegacyAnchorListSchemas(schema, position, context, state)
  visitLegacyAnchorMaps(schema, position, context, state)
  if (Array.isArray(schema.items)) {
    schema.items.forEach((child, index) => visitLegacyAnchorChild(child, `${position}/items/${index}`, context, state))
  }
}

function visitLegacyAnchorSingleSchemas(
  schema: Record<string, unknown>,
  position: string,
  context: LegacyAnchorNodeContext,
  state: LegacyAnchorScanState,
): void {
  for (const keyword of SINGLE[state.dialect]) {
    visitLegacyAnchorChild(schema[keyword], `${position}/${keyword}`, context, state)
  }
}

function visitLegacyAnchorListSchemas(
  schema: Record<string, unknown>,
  position: string,
  context: LegacyAnchorNodeContext,
  state: LegacyAnchorScanState,
): void {
  for (const keyword of LIST[state.dialect]) {
    const list = schema[keyword]
    if (Array.isArray(list)) {
      list.forEach((child, index) => visitLegacyAnchorChild(child, `${position}/${keyword}/${index}`, context, state))
    }
  }
}

function visitLegacyAnchorMaps(
  schema: Record<string, unknown>,
  position: string,
  context: LegacyAnchorNodeContext,
  state: LegacyAnchorScanState,
): void {
  for (const keyword of MAP[state.dialect]) {
    const map = schema[keyword]
    if (isRecord(map)) visitLegacyAnchorMap(map, position, keyword, context, state)
  }
}

function visitLegacyAnchorMap(
  map: Record<string, unknown>,
  position: string,
  keyword: string,
  context: LegacyAnchorNodeContext,
  state: LegacyAnchorScanState,
): void {
  for (const [key, child] of Object.entries(map)) {
    visitLegacyAnchorChild(child, `${position}/${keyword}/${escape(key)}`, context, state)
  }
}

function visitLegacyAnchorChild(
  child: unknown,
  position: string,
  context: LegacyAnchorNodeContext,
  state: LegacyAnchorScanState,
): void {
  if (isRecord(child) || typeof child === 'boolean') {
    visitLegacyAnchorNode(child, context.base, position, context.anchorBase, context.anchorPosition, state)
  }
}

interface RemoteSchemaContext {
  readonly dialect: Dialect
  readonly retrievalUri: string
  readonly canonicalBase: string
  readonly rootIdentifier: string
  readonly idKeyword: string
  readonly referenceKeywordSet: Set<string>
  readonly legacyAnchors: Map<string, { base: string; pointer: string }>
  readonly memo: WeakMap<object, Map<string | undefined, unknown>>
}

interface RemoteSchemaNodeState {
  readonly base: string | undefined
  readonly resolvedId: string | undefined
  readonly ignoresSiblings: boolean
}

function remoteSchema(
  source: unknown,
  retrievalUri: string,
  dialect: Dialect,
  canonicalBase: string,
  rootIdentifier: string,
): unknown {
  const sourceDocument = typeof source === 'boolean'
    ? { allOf: [source] }
    : source as Record<string, unknown>
  const context: RemoteSchemaContext = {
    dialect,
    retrievalUri,
    canonicalBase,
    rootIdentifier,
    idKeyword: identifierKeyword(dialect),
    referenceKeywordSet: new Set(referenceKeywords(dialect)),
    legacyAnchors: isPre2019Dialect(dialect) ? legacyAnchorTargets(source, retrievalUri, dialect) : new Map(),
    memo: new WeakMap(),
  }
  return normalizeRemoteSchemaValue(sourceDocument, retrievalUri, '#', true, context)
}

function normalizeRemoteSchemaValue(
  value: unknown,
  parentBase: string | undefined,
  position: string,
  root: boolean,
  context: RemoteSchemaContext,
): unknown {
  if (!isRecord(value)) {
    if (Array.isArray(value)) {
      return value.map((child, index) => normalizeRemoteSchemaValue(child, parentBase, `${position}/${index}`, false, context))
    }
    return cloneValue(value)
  }
  const cached = context.memo.get(value)?.get(parentBase)
  if (cached !== undefined) return cached
  const node = remoteSchemaNodeState(value, parentBase, position, root, context)
  const output: Record<string, unknown> = {}
  rememberRemoteSchemaNode(value, parentBase, output, context)
  for (const [keyword, child] of Object.entries(value)) {
    const normalized = normalizeRemoteSchemaProperty(value, keyword, child, position, node, context)
    defineRemoteSchemaProperty(output, keyword, normalized)
  }
  if (root) addRemoteSchemaRootMetadata(output, context)
  return output
}

function remoteSchemaNodeState(
  value: Record<string, unknown>,
  parentBase: string | undefined,
  position: string,
  root: boolean,
  context: RemoteSchemaContext,
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
      throw new SchemaResourceResolutionError(`Cannot resolve $id "${originalId}" at "${position}" in the resource retrieved from "${context.retrievalUri}".`, context.retrievalUri, position)
    }
    base = isPre2019Dialect(context.dialect) && originalId.startsWith('#') ? parentBase : withoutFragment(resolvedId)
  }
  rejectFileRemoteSchemaId(resolvedId, position)
  return { base, resolvedId, ignoresSiblings }
}

function rejectFileRemoteSchemaId(resolvedId: string | undefined, position: string): void {
  if (resolvedId === undefined || !withoutFragment(resolvedId).startsWith('file:')) return
  const fileUri = withoutFragment(resolvedId)
  throw new SchemaResourceResolutionError(`File schema resources are not supported: "${fileUri}" at "${position}".`, fileUri, position)
}

function rememberRemoteSchemaNode(
  value: object,
  parentBase: string | undefined,
  output: Record<string, unknown>,
  context: RemoteSchemaContext,
): void {
  const values = context.memo.get(value) ?? new Map<string | undefined, unknown>()
  values.set(parentBase, output)
  context.memo.set(value, values)
}

function normalizeRemoteSchemaProperty(
  source: Record<string, unknown>,
  keyword: string,
  child: unknown,
  position: string,
  node: RemoteSchemaNodeState,
  context: RemoteSchemaContext,
): unknown {
  if (keyword === context.idKeyword && node.resolvedId !== undefined) {
    return normalizedRemoteSchemaId(source[context.idKeyword], node.resolvedId, context.dialect)
  }
  if (context.referenceKeywordSet.has(keyword) && typeof child === 'string') {
    return normalizeRemoteSchemaReference(child, keyword, position, node.base, context)
  }
  if (node.ignoresSiblings) return normalizeLegacyRemoteSchemaProperty(child, keyword, position, node.base, context)
  if (SINGLE[context.dialect].has(keyword) && (isRecord(child) || typeof child === 'boolean')) {
    return normalizeRemoteSchemaValue(child, node.base, `${position}/${keyword}`, false, context)
  }
  if (LIST[context.dialect].has(keyword) && Array.isArray(child)) {
    return normalizeRemoteSchemaList(child, node.base, `${position}/${keyword}`, context)
  }
  if (MAP[context.dialect].has(keyword) && isRecord(child)) {
    return normalizeRemoteSchemaMap(child, keyword, node.base, `${position}/${keyword}`, context)
  }
  if (keyword === 'items' && context.dialect !== '2020-12' && Array.isArray(child)) {
    return normalizeRemoteSchemaList(child, node.base, `${position}/items`, context)
  }
  return cloneValue(child)
}

function normalizedRemoteSchemaId(originalId: unknown, resolvedId: string, dialect: Dialect): string {
  if (isPre2019Dialect(dialect) && typeof originalId === 'string' && originalId.startsWith('#')) return originalId
  return resolvedId
}

function normalizeRemoteSchemaReference(
  reference: string,
  keyword: string,
  position: string,
  base: string | undefined,
  context: RemoteSchemaContext,
): string {
  const resolved = absoluteUri(reference, base)
  if (resolved === undefined) {
    throw new SchemaResourceResolutionError(`Cannot resolve schema reference "${reference}" at "${position}/${keyword}" in the resource retrieved from "${context.retrievalUri}".`, context.retrievalUri, `${position}/${keyword}`)
  }
  const anchor = context.legacyAnchors.get(resolved)
  return anchor === undefined ? resolved : `${anchor.base}#${anchor.pointer}`
}

function normalizeLegacyRemoteSchemaProperty(
  child: unknown,
  keyword: string,
  position: string,
  base: string | undefined,
  context: RemoteSchemaContext,
): unknown {
  if (!DEFINITION_KEYS[context.dialect].includes(keyword) || !isRecord(child)) return cloneValue(child)
  return Object.fromEntries(Object.entries(child).map(([name, member]) => [
    name,
    isRecord(member) || typeof member === 'boolean'
      ? normalizeRemoteSchemaValue(member, base, `${position}/${keyword}/${escape(name)}`, false, context)
      : cloneValue(member),
  ]))
}

function normalizeRemoteSchemaList(
  children: unknown[],
  base: string | undefined,
  position: string,
  context: RemoteSchemaContext,
): unknown[] {
  return children.map((child, index) => normalizeRemoteSchemaValue(child, base, `${position}/${index}`, false, context))
}

function normalizeRemoteSchemaMap(
  children: Record<string, unknown>,
  keyword: string,
  base: string | undefined,
  position: string,
  context: RemoteSchemaContext,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(children).map(([name, member]) => [
    name,
    normalizeRemoteSchemaMapMember(member, keyword, name, position, base, context),
  ]))
}

function normalizeRemoteSchemaMapMember(
  member: unknown,
  keyword: string,
  name: string,
  position: string,
  base: string | undefined,
  context: RemoteSchemaContext,
): unknown {
  if (Array.isArray(member) && keyword === 'dependencies') return cloneValue(member)
  if (isRecord(member) || typeof member === 'boolean') {
    return normalizeRemoteSchemaValue(member, base, `${position}/${escape(name)}`, false, context)
  }
  return cloneValue(member)
}

function defineRemoteSchemaProperty(target: Record<string, unknown>, keyword: string, value: unknown): void {
  Object.defineProperty(target, keyword, { value, enumerable: true, configurable: true, writable: true })
}

function addRemoteSchemaRootMetadata(output: Record<string, unknown>, context: RemoteSchemaContext): void {
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
  const resourceSchemas = new Map<string, { schema: unknown; parentBase: string | undefined }>()
  const known = declaredResourceIds(schema, rootId, dialect, resourceSchemas)
  if (rootId) known.add(rootId)
  if (!resolver) {
    referencesIn({ document: schema, initialBase: rootId, dialect, knownResources: known })
    return []
  }
  const maximum = options.maxExternalResources ?? DEFAULT_MAX_EXTERNAL_RESOURCES
  if (!Number.isInteger(maximum) || maximum < 1) {
    throw new RangeError('maxExternalResources must be a positive integer.')
  }
  const state = createExternalResourceState(schema, dialect, resolver, maximum, rootId, known, resourceSchemas)
  await scanExternalResourceQueue(state)
  return [...state.documents.values()]
}

type ExternalResourceResolver = NonNullable<SchemaResourceOptions['resolveResource']>

interface ExternalResourceQueueItem {
  readonly document: unknown
  readonly base: string | undefined
  readonly pointerTarget?: string
  readonly resourceIdentity?: string
}

interface ExternalResourceState {
  readonly dialect: Dialect
  readonly resolver: ExternalResourceResolver
  readonly maximum: number
  readonly known: Set<string>
  readonly resourceSchemas: Map<string, { schema: unknown; parentBase: string | undefined }>
  readonly resources: Map<string, unknown>
  readonly resourceBases: Map<string, string>
  readonly documents: Map<string, unknown>
  readonly scanned: Set<string>
  readonly queue: ExternalResourceQueueItem[]
  readonly loading: Map<string, Promise<NormalizedResource>>
}

interface ExternalReferenceTarget {
  readonly uri: string
  readonly pointerTarget?: string
}

function createExternalResourceState(
  schema: unknown,
  dialect: Dialect,
  resolver: ExternalResourceResolver,
  maximum: number,
  rootId: string | undefined,
  known: Set<string>,
  resourceSchemas: Map<string, { schema: unknown; parentBase: string | undefined }>,
): ExternalResourceState {
  return {
    dialect,
    resolver,
    maximum,
    known,
    resourceSchemas,
    resources: new Map(),
    resourceBases: new Map(),
    documents: new Map(),
    scanned: new Set(),
    queue: [{ document: schema, base: rootId }],
    loading: new Map(),
  }
}

async function scanExternalResourceQueue(state: ExternalResourceState): Promise<void> {
  while (state.queue.length > 0) {
    const current = state.queue.shift()!
    if (markExternalResourceScan(current, state)) continue
    const references = referencesIn({
      document: current.document,
      initialBase: current.base,
      dialect: state.dialect,
      knownResources: state.known,
      initialPosition: '#',
      initialResourceRoot: current.document,
      initialResourceRootPosition: '#',
      entryPointerFragments: current.pointerTarget === undefined ? [] : [current.pointerTarget],
    })
    // Resource loading changes the graph, so references resolve in traversal order.
    for (const reference of references) {
      await processExternalReference(reference, state) // NOSONAR: resource loading changes the graph, so references resolve in traversal order.
    }
  }
}

function markExternalResourceScan(current: ExternalResourceQueueItem, state: ExternalResourceState): boolean {
  const key = JSON.stringify([
    current.resourceIdentity ?? current.base ?? `anonymous:${state.scanned.size}`,
    current.pointerTarget ?? '',
  ])
  if (state.scanned.has(key)) return true
  state.scanned.add(key)
  return false
}

async function processExternalReference(reference: LocatedReference, state: ExternalResourceState): Promise<void> {
  if (reference.reference.startsWith('#')) return
  const target = resolveExternalReferenceTarget(reference, state)
  if (target === undefined) return
  if (queueKnownExternalResource(target, state)) return
  await loadReferencedExternalResource(target, reference.position, state)
}

function resolveExternalReferenceTarget(
  reference: LocatedReference,
  state: ExternalResourceState,
): ExternalReferenceTarget | undefined {
  const resolved = absoluteUri(reference.reference, reference.base)
  if (resolved === undefined) {
    throw new SchemaResourceResolutionError(`Cannot resolve relative schema reference "${reference.reference}" at "${reference.position}" without an absolute base URI.`, undefined, reference.position)
  }
  const uri = withoutFragment(resolved)
  rejectFileExternalResource(uri, reference.position)
  if (!uri || isMetaSchema(uri)) return undefined
  const hash = resolved.indexOf('#')
  const fragment = hash === -1 ? undefined : resolved.slice(hash + 1)
  const pointerTarget = fragment !== undefined && decodeUriFragment(fragment).startsWith('/') ? fragment : undefined
  return pointerTarget === undefined ? { uri } : { uri, pointerTarget }
}

function rejectFileExternalResource(uri: string, position: string): void {
  if (!uri.startsWith('file:')) return
  throw new SchemaResourceResolutionError(`File schema resources are not supported: "${uri}" at "${position}".`, uri, position)
}

function queueKnownExternalResource(target: ExternalReferenceTarget, state: ExternalResourceState): boolean {
  if (state.resources.has(target.uri)) {
    queueResourcePointerTarget(
      state.resources.get(target.uri),
      state.resourceBases.get(target.uri) ?? target.uri,
      target.uri,
      target.pointerTarget,
      state,
    )
    return true
  }
  if (!state.known.has(target.uri)) return false
  const resourceContext = state.resourceSchemas.get(target.uri)
  const document = state.resources.get(target.uri) ?? state.documents.get(target.uri) ?? resourceContext?.schema
  queueResourcePointerTarget(
    document,
    resourceContext?.parentBase ?? target.uri,
    target.uri,
    target.pointerTarget,
    state,
  )
  return true
}

function queueResourcePointerTarget(
  document: unknown,
  base: string,
  resourceIdentity: string,
  pointerTarget: string | undefined,
  state: ExternalResourceState,
): void {
  if (pointerTarget === undefined || document === undefined) return
  state.queue.push({ document, base, pointerTarget, resourceIdentity })
}

async function loadReferencedExternalResource(
  target: ExternalReferenceTarget,
  position: string,
  state: ExternalResourceState,
): Promise<void> {
  const loaded = await loadNormalizedExternalResource(target.uri, position, state) // NOSONAR
  validateLoadedExternalDialect(loaded.primary, target.uri, position, state.dialect)
  registerLoadedExternalResource(target.uri, position, loaded, state)
  state.queue.push({
    document: loaded.primary,
    base: loaded.canonicalBase,
    resourceIdentity: target.uri,
    ...(target.pointerTarget === undefined ? {} : { pointerTarget: target.pointerTarget }),
  })
}

function loadNormalizedExternalResource(
  uri: string,
  position: string,
  state: ExternalResourceState,
): Promise<NormalizedResource> {
  const existing = state.loading.get(uri)
  if (existing) return existing
  if (state.loading.size >= state.maximum) {
    throw new SchemaResourceResolutionError(`The external schema resource limit of ${state.maximum} was exceeded at "${position}".`, uri, position)
  }
  const promise = Promise.resolve(state.resolver(uri)).then((resolved) => {
    if (resolved === undefined) {
      throw new SchemaResourceResolutionError(`No schema resource was returned for "${uri}" referenced at "${position}".`, uri, position)
    }
    return canonicalRemote(uri, resolved, state.dialect)
  })
  state.loading.set(uri, promise)
  return promise
}

function validateLoadedExternalDialect(
  schema: unknown,
  uri: string,
  position: string,
  dialect: Dialect,
): void {
  const remoteDialect = detectDialect(schema, { defaultDialect: dialect })
  if (remoteDialect !== dialect) {
    throw new SchemaResourceResolutionError(`The resource at "${uri}" uses ${remoteDialect}, but this adapter uses ${dialect}.`, uri, position)
  }
}

function registerLoadedExternalResource(
  uri: string,
  position: string,
  loaded: NormalizedResource,
  state: ExternalResourceState,
): void {
  state.resources.set(uri, loaded.primary)
  state.resourceBases.set(uri, loaded.canonicalBase)
  state.known.add(uri)
  const nested = declaredResourceIds(loaded.primary, loaded.canonicalBase, state.dialect, state.resourceSchemas)
  for (const id of nested) state.known.add(id)
  for (const document of [loaded.primary, ...loaded.aliases]) {
    registerNormalizedExternalDocument(document, uri, position, state)
  }
}

function registerNormalizedExternalDocument(
  document: unknown,
  uri: string,
  position: string,
  state: ExternalResourceState,
): void {
  const id = isRecord(document) && typeof document.$id === 'string' ? document.$id : undefined
  if (id === undefined) {
    throw new SchemaResourceResolutionError(`A normalized resource for "${uri}" has no $id.`, uri, position)
  }
  const previous = state.documents.get(id)
  if (previous !== undefined && !structurallyEqual(previous, document)) {
    throw new SchemaResourceResolutionError(`Two retrieved resources declare conflicting schemas for "$id ${id}".`, uri, position)
  }
  state.documents.set(id, document)
  state.known.add(withoutFragment(id))
  const base = withoutFragment(id)
  if (!state.resourceSchemas.has(base)) state.resourceSchemas.set(base, { schema: document, parentBase: base })
}

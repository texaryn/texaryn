import { identifierKeyword, isPre2019Dialect, schemaIdentifier, type Dialect } from './dialect.js'
import { LIST, MAP, SINGLE } from './schema-keywords.js'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function clone(value: unknown, seen = new Map<object, unknown>()): unknown {
  if (typeof value !== 'object' || value === null) return value
  const previous = seen.get(value)
  if (previous !== undefined) return previous
  if (Array.isArray(value)) {
    const result: unknown[] = []
    seen.set(value, result)
    for (const item of value) result.push(clone(item, seen))
    return result
  }
  const result: Record<string, unknown> = {}
  seen.set(value, result)
  for (const [key, item] of Object.entries(value)) {
    Object.defineProperty(result, key, { value: clone(item, seen), enumerable: true, configurable: true, writable: true })
  }
  return result
}

function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true })
}

interface LocatedPointerTarget {
  readonly schema: unknown
  readonly base: string | undefined
  readonly resourceRoot: Record<string, unknown>
  readonly resourceRootPosition: string
  readonly position: string
}

function pointerChild(current: unknown, segment: string): { readonly value: unknown } | undefined {
  if (Array.isArray(current)) {
    const index = Number(segment)
    if (!Number.isInteger(index) || index < 0 || index >= current.length || !Object.hasOwn(current, index)) return undefined
    return { value: current[index] }
  }
  if (isRecord(current) && Object.hasOwn(current, segment)) return { value: current[segment] }
  return undefined
}

function pointerResourceScope(
  child: unknown,
  base: string | undefined,
  dialect: Dialect,
): { readonly base: string; readonly resourceRoot: Record<string, unknown> } | undefined {
  if (!isRecord(child) || (isPre2019Dialect(dialect) && typeof child.$ref === 'string')) return undefined
  const childId = schemaIdentifier(child, dialect)
  if (typeof childId !== 'string') return undefined
  try {
    const resolved = base === undefined ? new URL(childId).href : new URL(childId, base).href
    if (isPre2019Dialect(dialect) && childId.startsWith('#')) return undefined
    return { base: withoutFragment(resolved), resourceRoot: child }
  } catch {
    return undefined
  }
}

function pointerTargetWithBase(
  document: Record<string, unknown>,
  fragment: string,
  initialBase: string | undefined,
  initialPosition: string,
  dialect: Dialect,
): LocatedPointerTarget | undefined {
  let pointer: string
  try {
    pointer = decodeURIComponent(fragment)
  } catch {
    pointer = fragment
  }
  if (pointer === '') return {
    schema: document,
    base: initialBase,
    resourceRoot: document,
    resourceRootPosition: initialPosition,
    position: initialPosition,
  }
  if (!pointer.startsWith('/')) return undefined

  let current: unknown = document
  let base = initialBase
  let resourceRoot: Record<string, unknown> = document
  let resourceRootPosition = initialPosition
  let position = initialPosition
  for (const raw of pointer.slice(1).split('/')) {
    const segment = raw.replaceAll('~1', '/').replaceAll('~0', '~')
    const locatedChild = pointerChild(current, segment)
    if (locatedChild === undefined) return undefined
    const child = locatedChild.value

    position = `${position}/${segment.replaceAll('~', '~0').replaceAll('/', '~1')}`
    const nestedScope = pointerResourceScope(child, base, dialect)
    if (nestedScope !== undefined) {
      base = nestedScope.base
      resourceRoot = nestedScope.resourceRoot
      resourceRootPosition = position
    }
    current = child
  }
  return { schema: current, base, resourceRoot, resourceRootPosition, position }
}

function pointerPosition(rootPosition: string, fragment: string): string {
  let pointer = fragment
  try {
    pointer = decodeURIComponent(fragment)
  } catch {
    // Retain the authored URI when it contains an invalid escape sequence.
  }
  return `${rootPosition}${pointer}`
}

function withoutFragment(uri: string): string {
  const hash = uri.indexOf('#')
  return hash === -1 ? uri : uri.slice(0, hash)
}

interface ResourceScope {
  readonly schema: Record<string, unknown>
  readonly position: string
  readonly base: string | undefined
  readonly knownPositions: Set<string>
  readonly copiedPositions: Set<string>
  readonly aliases: Map<string, string>
  readonly materialized: boolean
  nextAlias: number
}

interface PendingPointerAlias {
  readonly schema: Record<string, unknown>
  readonly position: string
  readonly scope: ResourceScope
}

interface PointerAliasRewriteState {
  readonly dialect: Dialect
  readonly keyword: string
  readonly pending: readonly PendingPointerAlias[]
  readonly recognizedPositions: ReadonlySet<string>
  readonly scopesByPosition: ReadonlyMap<string, ResourceScope>
  readonly createAlias: (scope: ResourceScope, position: string, target: unknown, resourceBase?: string) => string
}

interface ResourceWalkState {
  readonly dialect: Dialect
  readonly preserveRootId: boolean
  readonly idKeyword: string
  readonly visited: WeakMap<object, Set<string>>
  readonly recognizedPositions: Set<string>
  readonly scopesByPosition: Map<string, ResourceScope>
  readonly pending: PendingPointerAlias[]
}

function createResourceScope(
  schema: Record<string, unknown>,
  position: string,
  base: string | undefined,
  materialized: boolean,
): ResourceScope {
  return {
    schema,
    position,
    base,
    knownPositions: new Set<string>(materialized ? [] : [position]),
    copiedPositions: new Set<string>(),
    aliases: new Map<string, string>(),
    materialized,
    nextAlias: 0,
  }
}

function resourceScopeForSchema(
  schema: Record<string, unknown>,
  position: string,
  inherited: ResourceScope,
  materialized: boolean,
  state: ResourceWalkState,
): ResourceScope {
  const id = schemaIdentifier(schema, state.dialect)
  if (isLegacyReferenceSibling(schema, position, state)) return inherited
  if (typeof id !== 'string' || isLegacyFragmentIdentifier(id, state.dialect)) return inherited
  const base = resolveSchemaIdentifierBase(id, inherited.base)
  return createResourceScope(schema, position, base === undefined ? undefined : withoutFragment(base), materialized)
}

function isLegacyReferenceSibling(schema: Record<string, unknown>, position: string, state: ResourceWalkState): boolean {
  if (!isPre2019Dialect(state.dialect) || typeof schema.$ref !== 'string') return false
  if (!(state.preserveRootId && position === '#')) Reflect.deleteProperty(schema, state.idKeyword)
  return true
}

function isLegacyFragmentIdentifier(id: string, dialect: Dialect): boolean {
  return isPre2019Dialect(dialect) && id.startsWith('#')
}

function resolveSchemaIdentifierBase(id: string, base: string | undefined): string | undefined {
  try {
    return base === undefined ? new URL(id).href : new URL(id, base).href
  } catch {
    return base
  }
}

function resourceSchemaVisited(schema: Record<string, unknown>, position: string, inherited: ResourceScope, state: ResourceWalkState): boolean {
  const positions = state.visited.get(schema) ?? new Set<string>()
  const key = `${inherited.position}\u0000${position}`
  if (positions.has(key)) return true
  positions.add(key)
  state.visited.set(schema, positions)
  return false
}

function recordRecognizedResourcePosition(
  scope: ResourceScope,
  position: string,
  recognized: boolean,
  materialized: boolean,
  state: ResourceWalkState,
): void {
  if (!recognized) return
  if (materialized) {
    scope.copiedPositions.add(position)
    return
  }
  scope.knownPositions.add(position)
  state.recognizedPositions.add(position)
}

interface ResourceWalkInput {
  readonly schema: unknown
  readonly position: string
  readonly inherited: ResourceScope
  readonly recognized: boolean
  readonly materialized: boolean
  readonly state: ResourceWalkState
  readonly walk: (schema: unknown, position: string, inherited: ResourceScope, recognized: boolean, materialized: boolean) => void
}

function walkResourceSchema(input: ResourceWalkInput): void {
  const { schema, position, inherited, recognized, materialized, state, walk } = input
  if (!isRecord(schema) || resourceSchemaVisited(schema, position, inherited, state)) return
  const scope = resourceScopeForSchema(schema, position, inherited, materialized, state)
  recordRecognizedResourcePosition(scope, position, recognized, materialized, state)
  state.scopesByPosition.set(position, scope)
  state.pending.push({ schema, position, scope })
  for (const child of children(schema, position, state.dialect)) {
    walk(child.schema, child.position, scope, recognized, materialized)
  }
}

interface LocatedChild {
  readonly schema: Record<string, unknown>
  readonly position: string
}

function children(schema: Record<string, unknown>, position: string, dialect: Dialect): LocatedChild[] {
  const found: LocatedChild[] = []
  if (isPre2019Dialect(dialect) && typeof schema.$ref === 'string') {
    collectLegacyDefinitionChildren(schema, position, dialect, found)
    return found
  }
  collectSingleSchemaChildren(schema, position, dialect, found)
  collectListSchemaChildren(schema, position, dialect, found)
  collectMapSchemaChildren(schema, position, dialect, found)
  collectTupleItemChildren(schema, position, dialect, found)
  return found
}

function addLocatedSchema(found: LocatedChild[], value: unknown, position: string): void {
  if (isRecord(value)) found.push({ schema: value, position })
}

function collectLegacyDefinitionChildren(
  schema: Record<string, unknown>,
  position: string,
  dialect: Dialect,
  found: LocatedChild[],
): void {
  const keywords = dialect === 'draft-04' ? ['definitions'] : ['definitions', '$defs']
  for (const keyword of keywords) {
    const definitions = schema[keyword]
    if (!isRecord(definitions)) continue
    for (const [name, child] of Object.entries(definitions)) {
      addLocatedSchema(found, child, `${position}/${keyword}/${name.replaceAll('~', '~0').replaceAll('/', '~1')}`)
    }
  }
}

function collectSingleSchemaChildren(
  schema: Record<string, unknown>,
  position: string,
  dialect: Dialect,
  found: LocatedChild[],
): void {
  for (const keyword of SINGLE[dialect]) addLocatedSchema(found, schema[keyword], `${position}/${keyword}`)
}

function collectListSchemaChildren(
  schema: Record<string, unknown>,
  position: string,
  dialect: Dialect,
  found: LocatedChild[],
): void {
  for (const keyword of LIST[dialect]) {
    const list = schema[keyword]
    if (Array.isArray(list)) list.forEach((child, index) => addLocatedSchema(found, child, `${position}/${keyword}/${index}`))
  }
}

function collectMapSchemaChildren(
  schema: Record<string, unknown>,
  position: string,
  dialect: Dialect,
  found: LocatedChild[],
): void {
  for (const keyword of MAP[dialect]) {
    const map = schema[keyword]
    if (!isRecord(map)) continue
    for (const [name, child] of Object.entries(map)) {
      if (keyword !== 'dependencies' || !Array.isArray(child)) {
        addLocatedSchema(found, child, `${position}/${keyword}/${name.replaceAll('~', '~0').replaceAll('/', '~1')}`)
      }
    }
  }
}

function collectTupleItemChildren(
  schema: Record<string, unknown>,
  position: string,
  dialect: Dialect,
  found: LocatedChild[],
): void {
  if (dialect === '2020-12' || !Array.isArray(schema.items)) return
  schema.items.forEach((child, index) => addLocatedSchema(found, child, `${position}/items/${index}`))
}

function referenceFragment(reference: string, base: string | undefined): string | undefined {
  if (reference.startsWith('#')) return reference.slice(1)
  if (base === undefined) return undefined
  try {
    const resolved = new URL(reference, base)
    return withoutFragment(resolved.href) === base ? resolved.hash.slice(1) : undefined
  } catch {
    return undefined
  }
}

function ancestorAlias(
  aliases: Map<string, string>,
  position: string,
): { position: string; name: string } | undefined {
  let match: { position: string; name: string } | undefined
  for (const [aliasPosition, name] of aliases) {
    if (position.startsWith(`${aliasPosition}/`) && (match === undefined || aliasPosition.length > match.position.length)) {
      match = { position: aliasPosition, name }
    }
  }
  return match
}

/** Gives the validator an indexed schema location for a pointer into non-schema JSON. */
export function materializeLocalPointerAliases(input: unknown, dialect: Dialect, preserveRootId = false): unknown {
  const document = clone(input)
  if (!isRecord(document)) return document

  const pending: { schema: Record<string, unknown>; position: string; scope: ResourceScope }[] = []
  const visited = new WeakMap<object, Set<string>>()
  const recognizedPositions = new Set<string>()
  const scopesByPosition = new Map<string, ResourceScope>()
  const keyword = isPre2019Dialect(dialect) ? 'definitions' : '$defs'
  const idKeyword = identifierKeyword(dialect)
  const walkState: ResourceWalkState = {
    dialect,
    preserveRootId,
    idKeyword,
    visited,
    recognizedPositions,
    scopesByPosition,
    pending,
  }

  const createAlias = (
    scope: ResourceScope,
    position: string,
    target: unknown,
    resourceBase?: string,
  ): string => {
    const existing = scope.aliases.get(position)
    if (existing !== undefined) return existing

    const aliasTarget = clone(target)
    if (isPre2019Dialect(dialect) && isRecord(aliasTarget) && typeof aliasTarget.$ref === 'string') {
      Reflect.deleteProperty(aliasTarget, idKeyword)
    }
    if (resourceBase !== undefined && isRecord(aliasTarget)) setOwn(aliasTarget, idKeyword, resourceBase)

    let definitions = scope.schema[keyword]
    if (!isRecord(definitions)) {
      const created: Record<string, unknown> = {}
      setOwn(scope.schema, keyword, created)
      definitions = created
    }
    const definitionMap = definitions as Record<string, unknown>
    let alias: string
    do {
      alias = `__texaryn_local_${scope.nextAlias++}`
    } while (Object.hasOwn(definitionMap, alias))
    scope.aliases.set(position, alias)
    setOwn(definitionMap, alias, aliasTarget)
    walk(aliasTarget, position, scope, true, true)
    return alias
  }

  const walk = (
    schema: unknown,
    position: string,
    inherited: ResourceScope,
    recognized: boolean,
    materialized = false,
  ): void => {
    walkResourceSchema({ schema, position, inherited, recognized, materialized, state: walkState, walk })
  }

  const documentId = schemaIdentifier(document, dialect)
  const initialBase = typeof documentId === 'string'
    ? (() => {
        try { return withoutFragment(new URL(documentId).href) } catch { return undefined }
      })()
    : undefined
  const rootScope = createResourceScope(document, '#', initialBase, false)
  walk(document, '#', rootScope, true)

  rewritePendingPointerAliases({ dialect, keyword, pending, recognizedPositions, scopesByPosition, createAlias })

  return document
}

function rewritePendingPointerAliases(state: PointerAliasRewriteState): void {
  for (const pending of state.pending) rewritePendingPointerAlias(pending, state)
}

function rewritePendingPointerAlias(pending: PendingPointerAlias, state: PointerAliasRewriteState): void {
  const { schema, scope } = pending
  if (typeof schema.$ref !== 'string') return
  const fragment = referenceFragment(schema.$ref, scope.base)
  if (!fragment?.startsWith('/')) return
  const targetPosition = pointerPosition(scope.position, fragment)
  if (rewriteExistingPointerAlias(schema, scope, targetPosition, state.keyword)) return
  const located = pointerTargetWithBase(scope.schema, fragment, scope.base, scope.position, state.dialect)
  const target = located?.schema
  if (!isRecord(target) && typeof target !== 'boolean') return
  if (rewriteRecognizedPointerTarget(schema, scope, located!, state)) return
  if (scope.knownPositions.has(targetPosition)) return

  const targetScope = getPointerAliasTargetScope(scope, located!, state)
  if (rewriteCopiedResourceRoot(schema, scope, targetScope, targetPosition, located!, state.keyword)) return
  if (rewriteExistingTargetScopeAlias(schema, scope, targetScope, targetPosition, located!, state.keyword)) return
  if (rewriteKnownPointerTarget(schema, targetScope, targetPosition, located!, state)) return
  writePointerTargetAlias(schema, scope, targetScope, targetPosition, target, state)
}

function rewriteExistingPointerAlias(
  schema: Record<string, unknown>,
  scope: ResourceScope,
  targetPosition: string,
  keyword: string,
): boolean {
  const localAlias = scope.aliases.get(targetPosition)
  if (localAlias !== undefined) {
    setOwn(schema, '$ref', `#/${keyword}/${localAlias}`)
    return true
  }
  const ancestor = ancestorAlias(scope.aliases, targetPosition)
  if (ancestor === undefined || !scope.copiedPositions.has(targetPosition)) return false
  const suffix = targetPosition.slice(ancestor.position.length)
  setOwn(schema, '$ref', `#/${keyword}/${ancestor.name}${suffix}`)
  return true
}

function rewriteRecognizedPointerTarget(
  schema: Record<string, unknown>,
  scope: ResourceScope,
  located: LocatedPointerTarget,
  state: PointerAliasRewriteState,
): boolean {
  if (
    !isPre2019Dialect(state.dialect) ||
    !state.recognizedPositions.has(located.position) ||
    located.resourceRootPosition === scope.position ||
    located.base === undefined
  ) return false
  const suffix = located.position.slice(located.resourceRootPosition.length)
  setOwn(schema, '$ref', `${located.base}#${suffix}`)
  return true
}

function getPointerAliasTargetScope(
  scope: ResourceScope,
  located: LocatedPointerTarget,
  state: PointerAliasRewriteState,
): { readonly targetScope: ResourceScope; readonly copiedResource: boolean } {
  const resourcePosition = located.resourceRootPosition
  if (resourcePosition === scope.position) return { targetScope: scope, copiedResource: false }
  let targetScope = state.scopesByPosition.get(resourcePosition) ?? scope
  if (targetScope === scope) {
    state.createAlias(scope, resourcePosition, located.resourceRoot, located.base)
    targetScope = state.scopesByPosition.get(resourcePosition) ?? scope
  }
  return { targetScope, copiedResource: scope.aliases.has(resourcePosition) }
}

function rewriteCopiedResourceRoot(
  schema: Record<string, unknown>,
  scope: ResourceScope,
  target: { readonly targetScope: ResourceScope; readonly copiedResource: boolean },
  targetPosition: string,
  located: LocatedPointerTarget,
  keyword: string,
): boolean {
  if (!target.copiedResource || targetPosition !== located.resourceRootPosition) return false
  const alias = scope.aliases.get(located.resourceRootPosition)
  if (alias !== undefined) setOwn(schema, '$ref', `#/${keyword}/${alias}`)
  return true
}

function rewriteExistingTargetScopeAlias(
  schema: Record<string, unknown>,
  scope: ResourceScope,
  target: { readonly targetScope: ResourceScope; readonly copiedResource: boolean },
  targetPosition: string,
  located: LocatedPointerTarget,
  keyword: string,
): boolean {
  const alias = target.targetScope.aliases.get(targetPosition)
  if (alias !== undefined) {
    const reference = target.targetScope === scope
      ? `#/${keyword}/${alias}`
      : `${target.targetScope.base ?? ''}#/${keyword}/${alias}`
    setOwn(schema, '$ref', reference)
    return true
  }
  const ancestor = ancestorAlias(target.targetScope.aliases, targetPosition)
  if (ancestor !== undefined && target.targetScope.copiedPositions.has(targetPosition)) {
    const suffix = targetPosition.slice(ancestor.position.length)
    const prefix = target.targetScope === scope ? '' : target.targetScope.base ?? ''
    setOwn(schema, '$ref', `${prefix}#/${keyword}/${ancestor.name}${suffix}`)
    return true
  }
  if (target.targetScope !== scope && target.targetScope.materialized && target.targetScope.copiedPositions.has(targetPosition)) {
    const suffix = located.position.slice(located.resourceRootPosition.length)
    setOwn(schema, '$ref', `${target.targetScope.base ?? ''}#${suffix}`)
    return true
  }
  return false
}

function rewriteKnownPointerTarget(
  schema: Record<string, unknown>,
  target: { readonly targetScope: ResourceScope; readonly copiedResource: boolean },
  targetPosition: string,
  located: LocatedPointerTarget,
  state: PointerAliasRewriteState,
): boolean {
  if (!target.targetScope.knownPositions.has(targetPosition) && !state.recognizedPositions.has(targetPosition)) return false
  if (target.copiedResource) {
    const suffix = located.position.slice(located.resourceRootPosition.length)
    setOwn(schema, '$ref', `${target.targetScope.base ?? ''}#${suffix}`)
  }
  return true
}

function writePointerTargetAlias(
  schema: Record<string, unknown>,
  scope: ResourceScope,
  target: { readonly targetScope: ResourceScope },
  targetPosition: string,
  targetSchema: unknown,
  state: PointerAliasRewriteState,
): void {
  const alias = state.createAlias(target.targetScope, targetPosition, targetSchema)
  const reference = target.targetScope === scope
    ? `#/${state.keyword}/${alias}`
    : `${target.targetScope.base ?? ''}#/${state.keyword}/${alias}`
  setOwn(schema, '$ref', reference)
}

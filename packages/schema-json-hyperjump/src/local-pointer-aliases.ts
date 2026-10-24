import { identifierKeyword, isPre2019Dialect, schemaIdentifier, type Dialect } from './dialect.js'

const SINGLE: Record<Dialect, ReadonlySet<string>> = {
  'draft-04': new Set(['additionalItems', 'additionalProperties', 'items', 'not']),
  'draft-07': new Set(['additionalItems', 'additionalProperties', 'contains', 'else', 'if', 'items', 'not', 'propertyNames', 'then']),
  '2019-09': new Set(['additionalItems', 'additionalProperties', 'contains', 'contentSchema', 'else', 'if', 'items', 'not', 'propertyNames', 'then', 'unevaluatedItems', 'unevaluatedProperties']),
  '2020-12': new Set(['additionalProperties', 'contains', 'contentSchema', 'else', 'if', 'items', 'not', 'propertyNames', 'then', 'unevaluatedItems', 'unevaluatedProperties']),
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
const DRAFT_04_UNKNOWN_SCHEMA_KEYWORDS = [
  '$defs',
  'contains',
  'contentSchema',
  'dependentRequired',
  'dependentSchemas',
  'else',
  'if',
  'prefixItems',
  'propertyNames',
  'then',
  'unevaluatedItems',
  'unevaluatedProperties',
] as const

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
    let child: unknown
    if (Array.isArray(current)) {
      const index = Number(segment)
      if (!Number.isInteger(index) || index < 0 || index >= current.length || !Object.hasOwn(current, index)) return undefined
      child = current[index]
    } else if (isRecord(current) && Object.hasOwn(current, segment)) {
      child = current[segment]
    } else {
      return undefined
    }

    position = `${position}/${segment.replaceAll('~', '~0').replaceAll('/', '~1')}`
    const childId = isRecord(child) ? schemaIdentifier(child, dialect) : undefined
    if (isRecord(child) && !(isPre2019Dialect(dialect) && typeof child.$ref === 'string') && typeof childId === 'string') {
      try {
        const resolved = base === undefined ? new URL(childId).href : new URL(childId, base).href
        if (!(isPre2019Dialect(dialect) && childId.startsWith('#'))) {
          base = withoutFragment(resolved)
          resourceRoot = child
          resourceRootPosition = position
        }
      } catch {
        // An unresolvable identifier leaves the inherited base in place.
      }
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

interface LocatedChild {
  readonly schema: Record<string, unknown>
  readonly position: string
}

function children(schema: Record<string, unknown>, position: string, dialect: Dialect): LocatedChild[] {
  const found: LocatedChild[] = []
  const add = (value: unknown, childPosition: string): void => {
    if (isRecord(value)) found.push({ schema: value, position: childPosition })
  }
  if (isPre2019Dialect(dialect) && typeof schema.$ref === 'string') {
    for (const key of dialect === 'draft-04' ? ['definitions'] : ['definitions', '$defs']) {
      const map = schema[key]
      if (isRecord(map)) for (const [name, child] of Object.entries(map)) add(child, `${position}/${key}/${name.replaceAll('~', '~0').replaceAll('/', '~1')}`)
    }
    return found
  }
  for (const key of SINGLE[dialect]) add(schema[key], `${position}/${key}`)
  for (const key of LIST[dialect]) {
    const list = schema[key]
    if (Array.isArray(list)) list.forEach((child, index) => add(child, `${position}/${key}/${index}`))
  }
  for (const key of MAP[dialect]) {
    const map = schema[key]
    if (isRecord(map)) {
      for (const [name, child] of Object.entries(map)) {
        if (key === 'dependencies' && Array.isArray(child)) continue
        add(child, `${position}/${key}/${name.replaceAll('~', '~0').replaceAll('/', '~1')}`)
      }
    }
  }
  if (dialect !== '2020-12' && Array.isArray(schema.items)) {
    schema.items.forEach((child, index) => add(child, `${position}/items/${index}`))
  }
  return found
}

function stripDraft04UnknownSchemaKeywords(
  schema: unknown,
  position: string,
  preservedPointers: ReadonlySet<string>,
  visited = new WeakMap<object, Set<string>>(),
): void {
  if (Array.isArray(schema)) {
    schema.forEach((child, index) => stripDraft04UnknownSchemaKeywords(child, `${position}/${index}`, preservedPointers, visited))
    return
  }
  if (!isRecord(schema)) return
  const positions = visited.get(schema) ?? new Set<string>()
  if (positions.has(position)) return
  positions.add(position)
  visited.set(schema, positions)
  for (const keyword of DRAFT_04_UNKNOWN_SCHEMA_KEYWORDS) {
    const childPosition = `${position}/${keyword}`
    const preserve = hasPreservedTarget(childPosition, preservedPointers)
    if (!preserve) {
      Reflect.deleteProperty(schema, keyword)
    } else if ((keyword === '$defs' || keyword === 'dependentSchemas') && isRecord(schema[keyword])) {
      const map = schema[keyword] as Record<string, unknown>
      for (const [name, child] of Object.entries(map)) {
        const childPosition = `${position}/${keyword}/${name.replaceAll('~', '~0').replaceAll('/', '~1')}`
        if (hasPreservedTarget(childPosition, preservedPointers)) {
          stripDraft04UnknownSchemaKeywords(child, childPosition, preservedPointers, visited)
        } else {
          Reflect.deleteProperty(map, name)
        }
      }
    } else if (keyword === 'prefixItems' && Array.isArray(schema[keyword])) {
      const items = schema[keyword] as unknown[]
      for (const [index, child] of items.entries()) {
        const itemPosition = `${childPosition}/${index}`
        if (hasPreservedTarget(itemPosition, preservedPointers)) {
          stripDraft04UnknownSchemaKeywords(child, itemPosition, preservedPointers, visited)
        } else {
          items[index] = {}
        }
      }
    } else {
      stripDraft04UnknownSchemaKeywords(schema[keyword], childPosition, preservedPointers, visited)
    }
  }
  for (const child of children(schema, position, 'draft-04')) {
    stripDraft04UnknownSchemaKeywords(child.schema, child.position, preservedPointers, visited)
  }
}

function hasPreservedTarget(position: string, preservedPointers: ReadonlySet<string>): boolean {
  for (const pointer of preservedPointers) {
    if (pointer === position || pointer.startsWith(`${position}/`)) return true
  }
  return false
}

function valueAtPointer(document: unknown, pointer: string): unknown {
  const fragment = pointer.startsWith('#') ? pointer.slice(1) : pointer
  if (fragment === '') return document
  if (!fragment.startsWith('/')) return undefined
  let value = document
  for (const rawSegment of fragment.slice(1).split('/')) {
    const segment = rawSegment.replaceAll('~1', '/').replaceAll('~0', '~')
    if (Array.isArray(value)) {
      const index = Number(segment)
      if (!Number.isInteger(index) || index < 0 || index >= value.length) return undefined
      value = value[index]
    } else if (isRecord(value) && Object.hasOwn(value, segment)) {
      value = value[segment]
    } else {
      return undefined
    }
  }
  return value
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
export function materializeLocalPointerAliases(
  input: unknown,
  dialect: Dialect,
  preserveRootId = false,
  preservedUnknownPointers: ReadonlySet<string> = new Set(),
): unknown {
  const document = clone(input)
  if (!isRecord(document)) return document

  const pending: { schema: Record<string, unknown>; position: string; scope: ResourceScope }[] = []
  const legacyAnchors = new Map<string, { base: string; resourcePosition: string; position: string }>()
  const visited = new WeakMap<object, Set<string>>()
  const recognizedPositions = new Set<string>()
  const scopesByPosition = new Map<string, ResourceScope>()
  const keyword = isPre2019Dialect(dialect) ? 'definitions' : '$defs'
  const idKeyword = identifierKeyword(dialect)
  const newScope = (
    schema: Record<string, unknown>,
    position: string,
    base: string | undefined,
    materialized: boolean,
  ): ResourceScope => {
    const scope = {
      schema,
      position,
      base,
      knownPositions: new Set<string>(materialized ? [] : [position]),
      copiedPositions: new Set<string>(),
      aliases: new Map<string, string>(),
      materialized,
      nextAlias: 0,
    }
    return scope
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
    if (!isRecord(schema)) return
    const visitedPositions = visited.get(schema) ?? new Set<string>()
    const visitKey = `${inherited.position}\u0000${position}`
    if (visitedPositions.has(visitKey)) return
    visitedPositions.add(visitKey)
    visited.set(schema, visitedPositions)

    let scope = inherited
    const id = schemaIdentifier(schema, dialect)
    const ignoresSiblings = isPre2019Dialect(dialect) && typeof schema.$ref === 'string'
    if (ignoresSiblings && !(preserveRootId && position === '#')) Reflect.deleteProperty(schema, idKeyword)
    if (!ignoresSiblings && typeof id === 'string' && !(isPre2019Dialect(dialect) && id.startsWith('#'))) {
      let base = inherited.base
      try {
        const resolved = base === undefined ? new URL(id).href : new URL(id, base).href
        base = resolved
        if (isPre2019Dialect(dialect)) {
          const hash = resolved.indexOf('#')
          const fragment = hash === -1 ? undefined : resolved.slice(hash + 1)
          if (fragment !== undefined && fragment !== '' && !fragment.startsWith('/')) {
            const resourceBase = withoutFragment(resolved)
            const sameResource = inherited.base === resourceBase
            legacyAnchors.set(resolved, {
              base: resourceBase,
              resourcePosition: sameResource ? inherited.position : position,
              position,
            })
            if (dialect === 'draft-04' && position !== '#') {
              if (sameResource) Reflect.deleteProperty(schema, idKeyword)
              else setOwn(schema, idKeyword, resourceBase)
            }
          }
        }
      } catch {
        base = inherited.base
      }
      scope = newScope(schema, position, base === undefined ? undefined : withoutFragment(base), materialized)
    }
    if (!ignoresSiblings && isPre2019Dialect(dialect) && typeof id === 'string' && id.startsWith('#')) {
      try {
        const resolved = inherited.base === undefined ? undefined : new URL(id, inherited.base).href
        const fragment = resolved?.slice(resolved.indexOf('#') + 1)
        if (resolved !== undefined && fragment !== undefined && fragment !== '' && !fragment.startsWith('/')) {
          legacyAnchors.set(resolved, {
            base: inherited.base ?? withoutFragment(resolved),
            resourcePosition: inherited.position,
            position,
          })
          if (dialect === 'draft-04' && position !== '#') Reflect.deleteProperty(schema, idKeyword)
        }
      } catch {
        // An unresolvable legacy identifier cannot be used to rewrite a reference.
      }
    }
    if (recognized) {
      if (materialized) {
        scope.copiedPositions.add(position)
      } else {
        scope.knownPositions.add(position)
        recognizedPositions.add(position)
      }
    }
    scopesByPosition.set(position, scope)
    pending.push({ schema, position, scope })
    for (const child of children(schema, position, dialect)) {
      walk(child.schema, child.position, scope, recognized, materialized)
    }
  }

  const documentId = schemaIdentifier(document, dialect)
  const initialBase = typeof documentId === 'string'
    ? (() => {
        try { return withoutFragment(new URL(documentId).href) } catch { return undefined }
      })()
    : undefined
  const rootScope = newScope(document, '#', initialBase, false)
  walk(document, '#', rootScope, true)

  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const { schema, scope } = pending[cursor]!
    if (typeof schema.$ref !== 'string') continue
    if (isPre2019Dialect(dialect) && scope.base !== undefined) {
      try {
        const resolved = new URL(schema.$ref, scope.base).href
        const anchor = legacyAnchors.get(resolved)
        if (anchor !== undefined) {
          const pointer = anchor.position.startsWith(anchor.resourcePosition)
            ? anchor.position.slice(anchor.resourcePosition.length)
            : anchor.position.slice(1)
          const reference = anchor.base === scope.base && anchor.resourcePosition === scope.position
            ? `#${pointer}`
            : `${anchor.base}#${pointer}`
          setOwn(schema, '$ref', reference)
          continue
        }
      } catch {
        // Let the ordinary reference handling report malformed references.
      }
    }
    const fragment = referenceFragment(schema.$ref, scope.base)
    if (!fragment?.startsWith('/')) continue
    const targetPosition = pointerPosition(scope.position, fragment)
    const localAlias = scope.aliases.get(targetPosition)
    if (localAlias !== undefined) {
      setOwn(schema, '$ref', `#/${keyword}/${localAlias}`)
      continue
    }
    const localAncestorAlias = ancestorAlias(scope.aliases, targetPosition)
    if (localAncestorAlias !== undefined && scope.copiedPositions.has(targetPosition)) {
      const suffix = targetPosition.slice(localAncestorAlias.position.length)
      setOwn(schema, '$ref', `#/${keyword}/${localAncestorAlias.name}${suffix}`)
      continue
    }
    const located = pointerTargetWithBase(scope.schema, fragment, scope.base, scope.position, dialect)
    const target = located?.schema
    if (!isRecord(target) && typeof target !== 'boolean') continue
    if (isPre2019Dialect(dialect) && located!.resourceRootPosition !== scope.position && located!.base !== undefined) {
      const suffix = located!.position.slice(located!.resourceRootPosition.length)
      setOwn(schema, '$ref', `${located!.base}#${suffix}`)
      continue
    }
    if (scope.knownPositions.has(targetPosition)) continue

    let targetScope = scope
    let copiedResource = false
    const resourcePosition = located!.resourceRootPosition
    if (resourcePosition !== scope.position) {
      targetScope = scopesByPosition.get(resourcePosition) ?? scope
      if (targetScope === scope) {
        createAlias(scope, resourcePosition, located!.resourceRoot, located!.base)
        targetScope = scopesByPosition.get(resourcePosition) ?? scope
      }
      copiedResource = scope.aliases.has(resourcePosition)
    }

    if (copiedResource && targetPosition === resourcePosition) {
      const resourceAlias = scope.aliases.get(resourcePosition)
      if (resourceAlias !== undefined) setOwn(schema, '$ref', `#/${keyword}/${resourceAlias}`)
      continue
    }

    const targetAlias = targetScope.aliases.get(targetPosition)
    if (targetAlias !== undefined) {
      const reference = targetScope === scope
        ? `#/${keyword}/${targetAlias}`
        : `${targetScope.base ?? ''}#/${keyword}/${targetAlias}`
      setOwn(schema, '$ref', reference)
      continue
    }

    const targetAncestorAlias = ancestorAlias(targetScope.aliases, targetPosition)
    if (targetAncestorAlias !== undefined && targetScope.copiedPositions.has(targetPosition)) {
      const suffix = targetPosition.slice(targetAncestorAlias.position.length)
      const prefix = targetScope === scope ? '' : targetScope.base ?? ''
      setOwn(schema, '$ref', `${prefix}#/${keyword}/${targetAncestorAlias.name}${suffix}`)
      continue
    }

    if (targetScope !== scope && targetScope.materialized && targetScope.copiedPositions.has(targetPosition)) {
      const suffix = located!.position.slice(resourcePosition.length)
      setOwn(schema, '$ref', `${targetScope.base ?? ''}#${suffix}`)
      continue
    }

    if (targetScope.knownPositions.has(targetPosition) || recognizedPositions.has(targetPosition)) {
      if (copiedResource) {
        const suffix = located!.position.slice(resourcePosition.length)
        setOwn(schema, '$ref', `${targetScope.base ?? ''}#${suffix}`)
      }
      continue
    }

    const alias = createAlias(targetScope, targetPosition, target)
    const reference = targetScope === scope
      ? `#/${keyword}/${alias}`
      : `${targetScope.base ?? ''}#/${keyword}/${alias}`
    setOwn(schema, '$ref', reference)
  }

  if (dialect === 'draft-04') {
    const visited = new WeakMap<object, Set<string>>()
    stripDraft04UnknownSchemaKeywords(document, '#', preservedUnknownPointers, visited)
    for (const pointer of preservedUnknownPointers) {
      stripDraft04UnknownSchemaKeywords(valueAtPointer(document, pointer), pointer, preservedUnknownPointers, visited)
    }
  }

  return document
}

import type { MaybePromise } from '@texaryn/core'
import { detectDialect, type Dialect } from './dialect.js'

/** Resolves one absolute resource URI without its fragment. The adapter never fetches it itself. */
export type SchemaResourceResolver = (uri: string) => MaybePromise<unknown | undefined>

export interface SchemaResourceOptions {
  /** Supplies external schemas on the host's terms. Return undefined when the resource is unavailable. */
  readonly resolveResource?: SchemaResourceResolver
  /** Maximum number of unique external resource retrieval URIs. The default is 128. */
  readonly maxExternalResources?: number
}

export const DEFAULT_MAX_EXTERNAL_RESOURCES = 128

const SINGLE: Record<Dialect, ReadonlySet<string>> = {
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
  'draft-07': new Set(['allOf', 'anyOf', 'oneOf']),
  '2019-09': new Set(['allOf', 'anyOf', 'oneOf']),
  '2020-12': new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']),
}
const MAP: Record<Dialect, ReadonlySet<string>> = {
  'draft-07': new Set(['$defs', 'definitions', 'dependencies', 'patternProperties', 'properties']),
  '2019-09': new Set(['$defs', 'definitions', 'dependencies', 'dependentSchemas', 'patternProperties', 'properties']),
  '2020-12': new Set(['$defs', 'definitions', 'dependencies', 'dependentSchemas', 'patternProperties', 'properties']),
}
const META_URIS = new Set([
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

function resourceBase(identifier: unknown, parent: string | undefined, dialect: Dialect): string | undefined {
  if (typeof identifier !== 'string') return parent
  if (dialect === 'draft-07' && identifier.startsWith('#')) return parent
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

const escape = (segment: string): string => segment.replace(/~/g, '~0').replace(/\//g, '~1')

interface LocatedPointerTarget {
  readonly schema: unknown
  readonly parentBase: string | undefined
  readonly base: string | undefined
  readonly resourceRoot: unknown
  readonly resourceRootPosition: string
  readonly position: string
}

function pointerTargetWithContext(
  document: unknown,
  fragment: string,
  initialBase: string | undefined,
  initialPosition: string,
  dialect: Dialect,
  knownResources?: Set<string>,
): LocatedPointerTarget | undefined {
  let pointer: string
  try {
    pointer = decodeURIComponent(fragment)
  } catch {
    pointer = fragment
  }
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
    const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~')
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

    parentBase = base
    position = `${position}/${escape(segment)}`
    if (isRecord(child) && !(dialect === 'draft-07' && typeof child.$ref === 'string') && typeof child.$id === 'string') {
      const childBase = resourceBase(child.$id, base, dialect)
      if (childBase !== undefined) {
        knownResources?.add(childBase)
        const embeddedDialect = detectDialect(child, { defaultDialect: dialect })
        if (embeddedDialect !== dialect) {
          throw new SchemaResourceResolutionError(
            `The resource at "${childBase}" uses ${embeddedDialect}, but this adapter uses ${dialect}.`,
            childBase,
            position,
          )
        }
        const startsResource = !(dialect === 'draft-07' && child.$id.startsWith('#'))
        if (startsResource) {
          base = childBase
          resourceRoot = child
          resourceRootPosition = position
        }
      }
    }
    current = child
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

function referencesIn(
  document: unknown,
  initialBase: string | undefined,
  dialect: Dialect,
  knownResources?: Set<string>,
): LocatedReference[] {
  const references = new Map<string, LocatedReference>()
  const seen = new WeakMap<object, Set<string | undefined>>()
  const localReferences: LocalReference[] = []
  const anchorTargets = new Map<string, { schema: unknown; base: string | undefined; position: string }>()
  const contextsByPosition = new Map<string, { base: string | undefined; resourceRoot: unknown; resourceRootPosition: string }>()
  const visitedLocalReferences = new Set<number>()
  const referenceKeywords = dialect === 'draft-07'
    ? ['$ref']
    : dialect === '2019-09'
      ? ['$ref', '$recursiveRef']
      : ['$ref', '$dynamicRef']

  const visit = (
    schema: unknown,
    parentBase: string | undefined,
    position: string,
    resourceRoot: unknown,
    resourceRootPosition: string,
  ): void => {
    if (typeof schema !== 'object' || schema === null) return
    if (Array.isArray(schema)) {
      if (seenAtBase(seen, schema, parentBase)) return
      schema.forEach((child, index) => visit(child, parentBase, `${position}/${index}`, resourceRoot, resourceRootPosition))
      return
    }

    const record = schema as Record<string, unknown>
    const ignoresSiblings = dialect === 'draft-07' && typeof record.$ref === 'string'
    const base = ignoresSiblings ? parentBase : resourceBase(record.$id, parentBase, dialect)
    if (!ignoresSiblings && typeof record.$id === 'string' && base !== undefined) {
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
    const startsResource = !ignoresSiblings && typeof record.$id === 'string' && !(dialect === 'draft-07' && record.$id.startsWith('#'))
    const currentRoot = startsResource ? schema : resourceRoot
    const currentRootPosition = startsResource ? position : resourceRootPosition
    contextsByPosition.set(position, { base, resourceRoot: currentRoot, resourceRootPosition: currentRootPosition })
    if (seenAtBase(seen, schema, parentBase)) return
    if (!ignoresSiblings && dialect === 'draft-07' && typeof record.$id === 'string' && record.$id.startsWith('#')) {
      const anchorUri = absoluteUri(record.$id, parentBase) ?? (parentBase === undefined ? record.$id : undefined)
      if (anchorUri !== undefined) anchorTargets.set(anchorUri, { schema, base, position })
    }
    if (dialect !== 'draft-07' && typeof record.$anchor === 'string') {
      anchorTargets.set(`${base ?? ''}#${record.$anchor}`, { schema, base, position })
    }
    if (dialect === '2020-12' && typeof record.$dynamicAnchor === 'string') {
      anchorTargets.set(`${base ?? ''}#${record.$dynamicAnchor}`, { schema, base, position })
    }
    for (const keyword of referenceKeywords) {
      const reference = record[keyword]
      if (typeof reference === 'string') {
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

    if (dialect === 'draft-07' && typeof record.$ref === 'string') {
      for (const keyword of ['definitions', '$defs']) {
        const children = record[keyword]
        if (isRecord(children)) {
          for (const [key, child] of Object.entries(children)) {
            if (isRecord(child) || typeof child === 'boolean') {
              visit(child, base, `${position}/${keyword}/${escape(key)}`, currentRoot, currentRootPosition)
            }
          }
        }
      }
      return
    }

    for (const keyword of SINGLE[dialect]) {
      const child = record[keyword]
      if (isRecord(child) || typeof child === 'boolean') {
        visit(child, base, `${position}/${keyword}`, currentRoot, currentRootPosition)
      }
    }
    for (const keyword of LIST[dialect]) {
      const children = record[keyword]
      if (Array.isArray(children)) {
        children.forEach((child, index) => visit(child, base, `${position}/${keyword}/${index}`, currentRoot, currentRootPosition))
      }
    }
    for (const keyword of MAP[dialect]) {
      const children = record[keyword]
      if (!isRecord(children)) continue
      for (const [key, child] of Object.entries(children)) {
        if (isRecord(child) || typeof child === 'boolean') {
          visit(child, base, `${position}/${keyword}/${escape(key)}`, currentRoot, currentRootPosition)
        }
      }
    }
    if (dialect !== '2020-12' && Array.isArray(record.items)) {
      record.items.forEach((child, index) => visit(child, base, `${position}/items/${index}`, currentRoot, currentRootPosition))
    }
  }

  visit(document, initialBase, '#', document, '#')
  let progressed = true
  while (progressed) {
    progressed = false
    for (let index = 0; index < localReferences.length; index += 1) {
      if (visitedLocalReferences.has(index)) continue
      const local = localReferences[index]!
      const hash = local.uri.indexOf('#')
      const fragment = hash === -1 ? '' : local.uri.slice(hash + 1)
      let target: unknown
      let targetBase = local.base
      let targetPosition = local.resourceRootPosition
      let targetResourceRoot = local.resourceRoot
      let targetResourceRootPosition = local.resourceRootPosition
      if (fragment === '' || fragment.startsWith('/')) {
        const located = pointerTargetWithContext(
          local.resourceRoot,
          fragment,
          local.base,
          local.resourceRootPosition,
          dialect,
          knownResources,
        )
        target = located?.schema
        targetBase = located?.parentBase ?? local.base
        targetPosition = located?.position ?? local.resourceRootPosition
        targetResourceRoot = located?.resourceRoot ?? local.resourceRoot
        targetResourceRootPosition = located?.resourceRootPosition ?? local.resourceRootPosition
        if (fragment === '') targetBase = local.base
      } else {
        const anchor = anchorTargets.get(local.uri)
        if (anchor === undefined) {
          visitedLocalReferences.delete(index)
          continue
        }
        target = anchor.schema
        targetBase = anchor.base ?? local.base
        targetPosition = anchor.position
      }
      visitedLocalReferences.add(index)
      progressed = true
      if (isRecord(target) || typeof target === 'boolean') {
        const knownContext = contextsByPosition.get(targetPosition)
        if (knownContext === undefined) {
          visit(target, targetBase, targetPosition, targetResourceRoot, targetResourceRootPosition)
        }
      }
    }
  }
  return [...references.values()]
}

function declaredResourceIds(document: unknown, initialBase: string | undefined, dialect: Dialect): Set<string> {
  const ids = new Set<string>()
  const seen = new WeakMap<object, Set<string | undefined>>()
  const visit = (schema: unknown, parentBase: string | undefined, position: string): void => {
    if (typeof schema !== 'object' || schema === null || seenAtBase(seen, schema, parentBase)) return
    if (Array.isArray(schema)) {
      schema.forEach((child, index) => visit(child, parentBase, `${position}/${index}`))
      return
    }
    const record = schema as Record<string, unknown>
    const ignoresSiblings = dialect === 'draft-07' && typeof record.$ref === 'string'
    const base = ignoresSiblings ? parentBase : resourceBase(record.$id, parentBase, dialect)
    if (!ignoresSiblings && typeof record.$id === 'string' && base !== undefined) {
      ids.add(base)
      const embeddedDialect = detectDialect(record, { defaultDialect: dialect })
      if (embeddedDialect !== dialect) {
        throw new SchemaResourceResolutionError(
          `The resource at "${base}" uses ${embeddedDialect}, but this adapter uses ${dialect}.`,
          base,
          position,
        )
      }
    }
    if (ignoresSiblings) {
      for (const keyword of ['definitions', '$defs']) {
        const children = record[keyword]
        if (isRecord(children)) {
          for (const [key, child] of Object.entries(children)) {
            if (isRecord(child) || typeof child === 'boolean') visit(child, base, `${position}/${keyword}/${escape(key)}`)
          }
        }
      }
      return
    }
    for (const keyword of SINGLE[dialect]) {
      const child = record[keyword]
      if (isRecord(child) || typeof child === 'boolean') visit(child, base, `${position}/${keyword}`)
    }
    for (const keyword of LIST[dialect]) {
      const children = record[keyword]
      if (Array.isArray(children)) children.forEach((child, index) => visit(child, base, `${position}/${keyword}/${index}`))
    }
    for (const keyword of MAP[dialect]) {
      const children = record[keyword]
      if (isRecord(children)) {
        for (const [key, child] of Object.entries(children)) {
          if (isRecord(child) || typeof child === 'boolean') visit(child, base, `${position}/${keyword}/${escape(key)}`)
        }
      }
    }
    if (dialect !== '2020-12' && Array.isArray(record.items)) {
      record.items.forEach((child, index) => visit(child, base, `${position}/items/${index}`))
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
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) =>
    key === rightKeys[index] && structurallyEqual(left[key], right[key], seen))
}

function draft7AnchorTargets(source: unknown, retrievalUri: string): Map<string, { base: string; pointer: string }> {
  const targets = new Map<string, { base: string; pointer: string }>()
  const seen = new WeakMap<object, Set<string>>()
  const visit = (schema: unknown, parentBase: string, position: string, resourceBase: string, resourcePosition: string): void => {
    if (!isRecord(schema)) return
    const contexts = seen.get(schema) ?? new Set<string>()
    const context = `${parentBase}\u0000${resourcePosition}`
    if (contexts.has(context)) return
    contexts.add(context)
    seen.set(schema, contexts)

    const ignoresSiblings = typeof schema.$ref === 'string'
    let base = parentBase
    let anchorBase = resourceBase
    let anchorPosition = resourcePosition
    if (!ignoresSiblings && typeof schema.$id === 'string') {
      const resolved = absoluteUri(schema.$id, parentBase)
      if (resolved !== undefined && schema.$id.startsWith('#')) {
        const pointer = position.startsWith(resourcePosition) ? position.slice(resourcePosition.length) : position.slice(1)
        targets.set(resolved, { base: resourceBase, pointer })
      } else if (resolved !== undefined) {
        base = withoutFragment(resolved)
        anchorBase = base
        anchorPosition = position
      }
    }

    const visitChild = (child: unknown, childPosition: string): void => {
      if (isRecord(child) || typeof child === 'boolean') visit(child, base, childPosition, anchorBase, anchorPosition)
    }
    if (ignoresSiblings) {
      for (const keyword of ['definitions', '$defs']) {
        const map = schema[keyword]
        if (isRecord(map)) {
          for (const [key, child] of Object.entries(map)) visitChild(child, `${position}/${keyword}/${escape(key)}`)
        }
      }
      return
    }
    for (const keyword of SINGLE['draft-07']) visitChild(schema[keyword], `${position}/${keyword}`)
    for (const keyword of LIST['draft-07']) {
      const list = schema[keyword]
      if (Array.isArray(list)) list.forEach((child, index) => visitChild(child, `${position}/${keyword}/${index}`))
    }
    for (const keyword of MAP['draft-07']) {
      const map = schema[keyword]
      if (isRecord(map)) for (const [key, child] of Object.entries(map)) visitChild(child, `${position}/${keyword}/${escape(key)}`)
    }
    if (Array.isArray(schema.items)) schema.items.forEach((child, index) => visitChild(child, `${position}/items/${index}`))
  }
  visit(source, retrievalUri, '#', retrievalUri, '#')
  return targets
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
  const referenceKeywords = dialect === 'draft-07'
    ? new Set(['$ref'])
    : dialect === '2019-09'
      ? new Set(['$ref', '$recursiveRef'])
      : new Set(['$ref', '$dynamicRef'])
  const legacyAnchors = dialect === 'draft-07' ? draft7AnchorTargets(source, retrievalUri) : new Map()
  const memo = new WeakMap<object, Map<string | undefined, unknown>>()

  const visit = (value: unknown, parentBase: string | undefined, position: string, root = false): unknown => {
    if (!isRecord(value)) {
      if (Array.isArray(value)) return value.map((child, index) => visit(child, parentBase, `${position}/${index}`))
      return cloneValue(value)
    }
    const keyBase = parentBase
    const cached = memo.get(value)?.get(keyBase)
    if (cached !== undefined) return cached
    const originalId = value.$id
    const ignoresSiblings = dialect === 'draft-07' && typeof value.$ref === 'string'
    let base = parentBase
    let resolvedId: string | undefined
    if (root) {
      base = canonicalBase
      resolvedId = rootIdentifier
    } else if (!ignoresSiblings && typeof originalId === 'string') {
      resolvedId = absoluteUri(originalId, parentBase)
      if (resolvedId === undefined) {
        throw new SchemaResourceResolutionError(`Cannot resolve $id "${originalId}" at "${position}" in the resource retrieved from "${retrievalUri}".`, retrievalUri, position)
      }
      base = dialect === 'draft-07' && originalId.startsWith('#') ? parentBase : withoutFragment(resolvedId)
    }
    if (resolvedId !== undefined && withoutFragment(resolvedId).startsWith('file:')) {
      throw new SchemaResourceResolutionError(`File schema resources are not supported: "${withoutFragment(resolvedId)}" at "${position}".`, withoutFragment(resolvedId), position)
    }
    const output: Record<string, unknown> = {}
    const values = memo.get(value) ?? new Map<string | undefined, unknown>()
    values.set(keyBase, output)
    memo.set(value, values)

    for (const [keyword, child] of Object.entries(value)) {
      if (keyword === '$id' && resolvedId !== undefined) {
        const normalizedId = dialect === 'draft-07' && typeof originalId === 'string' && originalId.startsWith('#')
          ? originalId
          : resolvedId
        Object.defineProperty(output, keyword, { value: normalizedId, enumerable: true, configurable: true, writable: true })
      } else if (referenceKeywords.has(keyword) && typeof child === 'string') {
        const resolved = absoluteUri(child, base)
        if (resolved === undefined) {
          throw new SchemaResourceResolutionError(`Cannot resolve schema reference "${child}" at "${position}/${keyword}" in the resource retrieved from "${retrievalUri}".`, retrievalUri, `${position}/${keyword}`)
        }
        const anchor = legacyAnchors.get(resolved)
        const normalizedReference = anchor === undefined ? resolved : `${anchor.base}#${anchor.pointer}`
        Object.defineProperty(output, keyword, { value: normalizedReference, enumerable: true, configurable: true, writable: true })
      } else if (ignoresSiblings && (keyword === 'definitions' || keyword === '$defs') && isRecord(child)) {
        Object.defineProperty(output, keyword, { value: Object.fromEntries(Object.entries(child).map(([name, member]) => [
          name,
          isRecord(member) || typeof member === 'boolean' ? visit(member, base, `${position}/${keyword}/${escape(name)}`) : cloneValue(member),
        ])), enumerable: true, configurable: true, writable: true })
      } else if (ignoresSiblings) {
        Object.defineProperty(output, keyword, { value: cloneValue(child), enumerable: true, configurable: true, writable: true })
      } else if (SINGLE[dialect].has(keyword) && (isRecord(child) || typeof child === 'boolean')) {
        Object.defineProperty(output, keyword, { value: visit(child, base, `${position}/${keyword}`), enumerable: true, configurable: true, writable: true })
      } else if (LIST[dialect].has(keyword) && Array.isArray(child)) {
        Object.defineProperty(output, keyword, { value: child.map((member, index) => visit(member, base, `${position}/${keyword}/${index}`)), enumerable: true, configurable: true, writable: true })
      } else if (MAP[dialect].has(keyword) && isRecord(child)) {
        Object.defineProperty(output, keyword, { value: Object.fromEntries(Object.entries(child).map(([name, member]) => [
          name,
          Array.isArray(member) && keyword === 'dependencies'
            ? cloneValue(member)
            : isRecord(member) || typeof member === 'boolean'
              ? visit(member, base, `${position}/${keyword}/${escape(name)}`)
              : cloneValue(member),
        ])), enumerable: true, configurable: true, writable: true })
      } else if (keyword === 'items' && dialect !== '2020-12' && Array.isArray(child)) {
        Object.defineProperty(output, keyword, { value: child.map((member, index) => visit(member, base, `${position}/items/${index}`)), enumerable: true, configurable: true, writable: true })
      } else {
        Object.defineProperty(output, keyword, { value: cloneValue(child), enumerable: true, configurable: true, writable: true })
      }
    }
    if (root) {
      output.$id = rootIdentifier
      if (!Object.hasOwn(output, '$schema')) {
        output.$schema = dialect === 'draft-07'
          ? 'http://json-schema.org/draft-07/schema#'
          : `https://json-schema.org/draft/${dialect}/schema`
      }
    }
    return output
  }

  return visit(sourceDocument, retrievalUri, '#', true)
}

function canonicalRemote(uri: string, schema: unknown, dialect: Dialect): NormalizedResource {
  if (!isRecord(schema) && typeof schema !== 'boolean') {
    throw new SchemaResourceResolutionError(`The resource resolver returned a non-schema value for "${uri}".`, uri)
  }
  if (isRecord(schema) && schema.$id !== undefined && typeof schema.$id !== 'string') {
    throw new SchemaResourceResolutionError(`The resource at "${uri}" has a non-string $id.`, uri)
  }
  const id = isRecord(schema) && typeof schema.$id === 'string' ? schema.$id : uri
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
        dialect === 'draft-07' && resolvedId.includes('#') ? `${uri}${resolvedId.slice(resolvedId.indexOf('#'))}` : uri,
      )]
  return { primary, aliases, canonicalBase }
}

function isMetaSchema(uri: string): boolean {
  return META_URIS.has(uri)
}

export function assertNoFileSchemaIdentifiers(schema: unknown, dialect: Dialect): void {
  const rootId = isRecord(schema) && typeof schema.$id === 'string'
    ? resourceBase(schema.$id, undefined, dialect)
    : undefined
  for (const uri of declaredResourceIds(schema, rootId, dialect)) {
    if (uri.startsWith('file:')) {
      throw new Error(`Hyperjump does not support schema identifiers with the file: scheme: "${uri}".`)
    }
  }
}

export async function loadExternalResources(
  schema: unknown,
  dialect: Dialect,
  options: SchemaResourceOptions | undefined,
): Promise<unknown[]> {
  const resolver = options?.resolveResource
  const rootId = isRecord(schema) && typeof schema.$id === 'string'
    ? resourceBase(schema.$id, undefined, dialect)
    : undefined
  const known = declaredResourceIds(schema, rootId, dialect)
  if (rootId) known.add(rootId)
  if (!resolver) {
    referencesIn(schema, rootId, dialect, known)
    return []
  }
  const maximum = options.maxExternalResources ?? DEFAULT_MAX_EXTERNAL_RESOURCES
  if (!Number.isInteger(maximum) || maximum < 1) {
    throw new RangeError('maxExternalResources must be a positive integer.')
  }

  const resources = new Map<string, unknown>()
  const documents = new Map<string, unknown>()
  const scanned = new Set<string>()
  const queue: { document: unknown; base: string | undefined }[] = [{ document: schema, base: rootId }]
  const loading = new Map<string, Promise<NormalizedResource>>()

  const load = (uri: string, position: string): Promise<NormalizedResource> => {
    const existing = loading.get(uri)
    if (existing) return existing
    if (loading.size >= maximum) {
      throw new SchemaResourceResolutionError(`The external schema resource limit of ${maximum} was exceeded at "${position}".`, uri, position)
    }
    const promise = Promise.resolve(resolver(uri)).then((resolved) => {
      if (resolved === undefined) {
        throw new SchemaResourceResolutionError(`No schema resource was returned for "${uri}" referenced at "${position}".`, uri, position)
      }
      return canonicalRemote(uri, resolved, dialect)
    })
    loading.set(uri, promise)
    return promise
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    const key = current.base ?? `anonymous:${scanned.size}`
    if (scanned.has(key)) continue
    scanned.add(key)
    const references = referencesIn(current.document, current.base, dialect, known)
    for (const { base, reference, position } of references) {
      if (reference.startsWith('#')) {
        const localUri = base === undefined ? undefined : absoluteUri(reference, base)
        if (localUri !== undefined && withoutFragment(localUri).startsWith('file:')) {
          throw new SchemaResourceResolutionError(`File schema resources are not supported: "${withoutFragment(localUri)}" at "${position}".`, withoutFragment(localUri), position)
        }
        continue
      }
      const resolved = absoluteUri(reference, base)
      if (resolved === undefined) {
        throw new SchemaResourceResolutionError(`Cannot resolve relative schema reference "${reference}" at "${position}" without an absolute base URI.`, undefined, position)
      }
      const uri = withoutFragment(resolved)
      if (uri.startsWith('file:')) {
        throw new SchemaResourceResolutionError(`File schema resources are not supported: "${uri}" at "${position}".`, uri, position)
      }
      if (!uri || isMetaSchema(uri) || known.has(uri) || resources.has(uri)) continue
      const loaded = await load(uri, position)
      const remoteDialect = detectDialect(loaded.primary, { defaultDialect: dialect })
      if (remoteDialect !== dialect) {
        throw new SchemaResourceResolutionError(`The resource at "${uri}" uses ${remoteDialect}, but this adapter uses ${dialect}.`, uri, position)
      }
      resources.set(uri, loaded.primary)
      known.add(uri)
      const nested = declaredResourceIds(loaded.primary, loaded.canonicalBase, dialect)
      for (const id of nested) known.add(id)
      const uniqueDocuments = [loaded.primary, ...loaded.aliases]
      for (const document of uniqueDocuments) {
        const id = isRecord(document) && typeof document.$id === 'string' ? document.$id : undefined
        if (id === undefined) throw new SchemaResourceResolutionError(`A normalized resource for "${uri}" has no $id.`, uri, position)
        const previous = documents.get(id)
        if (previous !== undefined && !structurallyEqual(previous, document)) {
          throw new SchemaResourceResolutionError(`Two retrieved resources declare conflicting schemas for "$id ${id}".`, uri, position)
        }
        documents.set(id, document)
        known.add(withoutFragment(id))
      }
      queue.push({ document: loaded.primary, base: loaded.canonicalBase })
    }
  }

  return [...documents.values()]
}

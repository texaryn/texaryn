import { interpret, BASIC, type CompiledSchema } from '@hyperjump/json-schema/experimental'
import * as Instance from '@hyperjump/json-schema/instance/experimental'
import type {
  SchemaProjection,
  EnumOption,
  JsonPointer,
  ProjectionDiagnostic,
  ProjectionOptions,
} from '@texaryn/core'
import { ProjectionPlugin, type KeywordRecord } from './plugin.js'
import {
  schemaAtPosition,
  schemaParentPosition,
  schemaPosition,
  schemaPositionSegments,
  schemaReferenceTarget,
  escapeSegment,
} from './pointer-utils.js'
import { collectDefaultConflicts } from './default-conflicts.js'
import {
  staticWalk,
  ensureNode,
  addChild,
  finalizeNodes,
  resolveShapes,
  resolveTypeValue,
  newRecursionState,
  locationInfo,
  type ProjectionCache,
  type ProjectionLimits,
  type DraftNode,
  type BranchChecker,
  unselectedAlternativeFamilies,
} from './static-walk.js'
import { CONSTRAINT_KEYS, ANNOTATION_KEYS } from './constants.js'

export const DEFAULT_LIMITS: ProjectionLimits = { objects: 16, nodes: 512 }

function walkOrder(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!
  return a.length - b.length
}

type ReferenceAnalysis = { containsReference: boolean; unsafeScope: boolean }

interface ReferenceAnalysisState {
  rawSchema: unknown
  visited: Set<string>
  result: ReferenceAnalysis
}

const schemaSingleKeys = new Set([
  'additionalItems', 'additionalProperties', 'contains', 'contentSchema', 'else', 'if',
  'items', 'not', 'propertyNames', 'then', 'unevaluatedItems', 'unevaluatedProperties',
])
const schemaListKeys = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems'])
const schemaMapKeys = new Set([
  '$defs', 'definitions', 'dependencies', 'dependentSchemas', 'patternProperties', 'properties',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasNestedIdBoundary(rawSchema: unknown, pointer: string): boolean {
  const hashIndex = pointer.indexOf('#')
  if (hashIndex > 0) return true
  const parts = schemaPositionSegments(pointer)
  return parts.some((_, index) => {
    const ancestorPointer = schemaParentPosition(pointer, index + 1)
    const ancestor = schemaAtPosition(rawSchema, ancestorPointer)
    return isRecord(ancestor) && typeof ancestor.$id === 'string'
  })
}

function analyzeReferenceGraph(
  rawSchema: unknown,
  pointer: string,
  cache: Map<string, ReferenceAnalysis>,
): ReferenceAnalysis {
  const cached = cache.get(pointer)
  if (cached) return cached
  const state: ReferenceAnalysisState = {
    rawSchema,
    visited: new Set(),
    result: { containsReference: false, unsafeScope: false },
  }
  visitReferenceSchema(pointer, state)
  cache.set(pointer, state.result)
  return state.result
}

function visitReferenceSchema(schemaPointer: string, state: ReferenceAnalysisState): void {
  if (state.visited.has(schemaPointer) || state.result.unsafeScope) return
  state.visited.add(schemaPointer)
  if (hasNestedIdBoundary(state.rawSchema, schemaPointer)) {
    state.result.unsafeScope = true
    return
  }

  const schema = schemaAtPosition(state.rawSchema, schemaPointer)
  if (!isRecord(schema)) return
  if ('$dynamicRef' in schema || '$recursiveRef' in schema) {
    state.result.containsReference = true
    state.result.unsafeScope = true
    return
  }
  if (typeof schema.$ref === 'string') {
    state.result.containsReference = true
    const target = localReferenceTarget(state.rawSchema, schemaPointer, schema, state.result)
    if (target !== undefined) visitReferenceSchema(target, state)
  }
  visitSchemaChildren(schemaPointer, schema, state)
}

function localReferenceTarget(
  rawSchema: unknown,
  schemaPointer: string,
  schema: Record<string, unknown>,
  result: ReferenceAnalysis,
): string | undefined {
  const reference = schema.$ref as string
  if (!reference.startsWith('#')) {
    result.unsafeScope = true
    return undefined
  }
  const target = schemaReferenceTarget(rawSchema, schemaPointer)
  const rawFragment = reference.slice(1)
  if (rawFragment !== '' && !rawFragment.startsWith('/')) {
    result.unsafeScope = true
    return undefined
  }
  if (target === undefined) {
    result.unsafeScope = true
    return undefined
  }
  return target
}

function visitSchemaChildren(
  schemaPointer: string,
  schema: Record<string, unknown>,
  state: ReferenceAnalysisState,
): void {
  visitSingleSchemaChildren(schemaPointer, schema, state)
  visitSchemaListChildren(schemaPointer, schema, state)
  visitSchemaArrayItems(schemaPointer, schema, state)
  visitSchemaMapChildren(schemaPointer, schema, state)
}

function visitSingleSchemaChildren(
  schemaPointer: string,
  schema: Record<string, unknown>,
  state: ReferenceAnalysisState,
): void {
  for (const keyword of schemaSingleKeys) {
    if (isRecord(schema[keyword])) {
      visitReferenceSchema(schemaPointer + '/' + keyword, state)
    }
  }
}

function visitSchemaListChildren(
  schemaPointer: string,
  schema: Record<string, unknown>,
  state: ReferenceAnalysisState,
): void {
  for (const keyword of schemaListKeys) {
    const branches = schema[keyword]
    if (Array.isArray(branches)) {
      branches.forEach((_, index) =>
        visitReferenceSchema(schemaPointer + '/' + keyword + '/' + index, state)
      )
    }
  }
}

function visitSchemaArrayItems(
  schemaPointer: string,
  schema: Record<string, unknown>,
  state: ReferenceAnalysisState,
): void {
  if (!Array.isArray(schema.items)) return
  schema.items.forEach((_, index) =>
    visitReferenceSchema(schemaPointer + '/items/' + index, state)
  )
}

function visitSchemaMapChildren(
  schemaPointer: string,
  schema: Record<string, unknown>,
  state: ReferenceAnalysisState,
): void {
  for (const keyword of schemaMapKeys) {
    const members = schema[keyword]
    if (!isRecord(members)) continue
    Object.entries(members).forEach(([key, child]) => {
      if (isRecord(child)) {
        visitReferenceSchema(schemaPointer + '/' + keyword + '/' + escapeSegment(key), state)
      }
    })
  }
}

/**
 * Reads branch selection off each construct's own local scope validity (see
 * ProjectionPlugin.scopeValidity), not off the (globally valid-gated) `records`
 * list: a `then` branch that is selected but currently incomplete (missing one
 * of its own required fields, the normal state of a form mid-edit) must still
 * read as selected, and that signal would otherwise be wiped out by its own
 * incompleteness cascading through the merge-up gate all the way to the root.
 *
 * `then`/`else` resolve through the *if* scope's validity.
 *
 * `oneOf`/`anyOf`: a branch is selected when it is directly valid, and for
 * `oneOf` only when no sibling is. When none is valid, none is selected, which
 * is what `active` has to say: the schema applies no branch to this data. That
 * state is the normal one for a form mid-edit, where the user has supplied a
 * discriminator and not yet the branch's required fields, and exposing the
 * branch then is provisional selection's job rather than this function's. See
 * `selectProvisionalBranch`.
 */
function makeBranchChecker(
  rawSchema: unknown,
  scopeValidity: Map<string, boolean>,
  compiled: CompiledSchema,
  data: unknown,
  dialect: ProjectionCache['dialect'],
): BranchChecker {
  const annotationKeys = new Set<string>(ANNOTATION_KEYS)
  const referenceAnalysisCache = new Map<string, ReferenceAnalysis>()
  const analyzeReferences = (pointer: string): ReferenceAnalysis =>
    analyzeReferenceGraph(rawSchema, pointer, referenceAnalysisCache)

  const hasInstanceAt = (pointer: string): boolean => {
    if (pointer === '') return true
    let current = data
    for (const rawSegment of pointer.split('/').slice(1)) {
      const segment = rawSegment.replaceAll('~1', '/').replaceAll('~0', '~')
      if (Array.isArray(current)) {
        const index = Number(segment)
        if (!Number.isInteger(index) || index < 0 || index >= current.length || !Object.hasOwn(current, index)) {
          return false
        }
        current = current[index]
      } else if (isRecord(current) && Object.hasOwn(current, segment)) {
        current = current[segment]
      } else {
        return false
      }
    }
    return true
  }

  const rootUri = compiled.schemaUri.split('#')[0]!
  const compiledUrisByFragment = new Map<string, string>()
  for (const uri of Object.keys(compiled.ast)) {
    if (uri.startsWith(`${rootUri}#`)) compiledUrisByFragment.set(schemaPosition(uri, rootUri), uri)
  }
  const missingIfValidity = new Map<string, boolean | undefined>()
  const missingIfResult = (schemaPointer: string, instancePointer: string): boolean | undefined => {
    const conditionPointer = `${schemaPointer}/if`
    const cacheKey = `${conditionPointer}@${instancePointer}`
    if (missingIfValidity.has(cacheKey)) return missingIfValidity.get(cacheKey)

    let result: boolean | undefined
    if (!hasInstanceAt(instancePointer) && !analyzeReferences(conditionPointer).unsafeScope) {
      const conditionUri = compiledUrisByFragment.get(conditionPointer)
      if (conditionUri) {
        try {
          const output = interpret(
            { ...compiled, schemaUri: conditionUri },
            Instance.fromJs({}),
            BASIC,
          ) as { valid: boolean }
          result = output.valid
        } catch {
          result = undefined
        }
      }
    }

    missingIfValidity.set(cacheKey, result)
    return result
  }

  const missingBranchValidity = new Map<string, boolean | undefined>()
  const missingAnyOfObjectApplicability = new Map<string, boolean>()
  const hasUnselectedObjectAlternatives = (schemaPointer: string): boolean => {
    if (missingAnyOfObjectApplicability.has(schemaPointer)) {
      return missingAnyOfObjectApplicability.get(schemaPointer)!
    }
    const construct = schemaAtPosition(rawSchema, schemaPointer)
    const families = isRecord(construct)
      ? unselectedAlternativeFamilies(construct, rawSchema, 'anyOf')
      : new Set()
    const result = families.size === 1 && families.has('object')
    missingAnyOfObjectApplicability.set(schemaPointer, result)
    return result
  }

  const missingBranchResult = (branchPointer: string, instancePointer: string): boolean | undefined => {
    const cacheKey = `${branchPointer}@${instancePointer}`
    if (missingBranchValidity.has(cacheKey)) return missingBranchValidity.get(cacheKey)

    let result: boolean | undefined
    if (!hasInstanceAt(instancePointer) && !analyzeReferences(branchPointer).unsafeScope) {
      const branchUri = compiledUrisByFragment.get(branchPointer)
      if (branchUri) {
        try {
          const output = interpret(
            { ...compiled, schemaUri: branchUri },
            Instance.fromJs({}),
            BASIC,
          ) as { valid: boolean }
          result = output.valid
        } catch {
          result = undefined
        }
      }
    }

    missingBranchValidity.set(cacheKey, result)
    return result
  }

  const referencedValidity = (branch: unknown, instancePointer: string, branchPosition: string): boolean | undefined => {
    if (!isRecord(branch) || typeof branch.$ref !== 'string') return undefined
    if (Object.keys(branch).some((key) => key !== '$ref' && !annotationKeys.has(key))) {
      return undefined
    }

    let pointer = schemaReferenceTarget(rawSchema, branchPosition)
    if (pointer === undefined) return undefined
    const visited = new Set<string>()
    while (!visited.has(pointer)) {
      visited.add(pointer)
      if (hasNestedIdBoundary(rawSchema, pointer)) return undefined
      const key = `${pointer}@${instancePointer}`
      if (scopeValidity.has(key)) return scopeValidity.get(key)

      const target = schemaAtPosition(rawSchema, pointer)
      if (!isRecord(target) || typeof target.$ref !== 'string') {
        return undefined
      }
      if (Object.keys(target).some((name) => name !== '$ref' && !annotationKeys.has(name))) {
        return undefined
      }
      pointer = schemaReferenceTarget(rawSchema, pointer) ?? ''
    }
    return undefined
  }

  const branchValidity = (
    schemaPointer: string,
    instancePointer: string,
    keyword: string,
    index: number,
  ): boolean | undefined => {
    const key = `${schemaPointer}/${keyword}/${index}@${instancePointer}`
    if (scopeValidity.has(key)) return scopeValidity.get(key)
    const construct = schemaAtPosition(rawSchema, schemaPointer)
    const branches = isRecord(construct) ? construct[keyword] : undefined
    const branch = Array.isArray(branches) ? branches[index] : undefined
    if (hasNestedIdBoundary(rawSchema, schemaPointer)) return undefined
    const branchPosition = `${schemaPointer}/${keyword}/${index}`
    const referenced = referencedValidity(branch, instancePointer, branchPosition)
    if (referenced !== undefined) return referenced
    if (keyword !== 'anyOf' || !hasUnselectedObjectAlternatives(schemaPointer)) return undefined
    return missingBranchResult(branchPosition, instancePointer)
  }

  return (schemaPointer: string, instancePointer: string, suffix: string): boolean => {
    if (suffix === '/then' || suffix === '/else') {
      const ifKey = `${schemaPointer}/if@${instancePointer}`
      const branchPointer = `${schemaPointer}${suffix}`
      const skipDraft07Reference =
        dialect === 'draft-07' && analyzeReferences(branchPointer).containsReference
      let ifValid: boolean | undefined
      if (scopeValidity.has(ifKey)) ifValid = scopeValidity.get(ifKey)
      else if (!skipDraft07Reference) ifValid = missingIfResult(schemaPointer, instancePointer)
      return suffix === '/then' ? ifValid === true : ifValid === false
    }

    const match = /^\/(oneOf|anyOf)\/(\d+)$/.exec(suffix)
    if (!match) return scopeValidity.get(`${schemaPointer}${suffix}@${instancePointer}`) === true

    const [, keyword, indexStr] = match
    const branchIndex = Number.parseInt(indexStr, 10)
    const construct = schemaAtPosition(rawSchema, schemaPointer)
    const branches = isRecord(construct) && Array.isArray(construct[keyword])
      ? construct[keyword] as unknown[]
      : []
    const directlyValid = branchValidity(schemaPointer, instancePointer, keyword, branchIndex) === true
    const validSibling = branches.some((_, index) =>
      index !== branchIndex && branchValidity(schemaPointer, instancePointer, keyword, index) === true,
    )

    if (directlyValid) {
      if (keyword === 'anyOf') return true
      return !validSibling
    }

    // If any sibling branch is directly valid, this branch lost and is inactive.
    if (validSibling) return false

    // No branch is directly valid, so none applies. `active` means JSON Schema
    // evaluation says the node applies, and nothing here does.
    //
    // This used to pick a best match by counting each branch's valid
    // sub-scopes, which reached the useful answer for a form mid-edit and
    // reached it in the wrong field: a branch validation rejects was reported
    // active. It was broader than any discriminator rule too, since a generic
    // constraint like `minLength` being satisfied could decide the winner, and
    // it applied to `anyOf` as well with an even looser tie-break. Exposing an
    // identified but unsatisfied branch is provisional selection's job, on an
    // explicit `const` or `enum`, which `staticWalk` does for `oneOf` alone.
    return false
  }
}

/**
 * Builds a SchemaProjection from a compiled schema and instance data in two passes.
 *
 * Pass 1 (data-driven, authoritative): interpret() with a ProjectionPlugin records every
 * keyword hyperjump actually evaluated, grouped by instance pointer; each keyword's raw
 * value is then resolved by JSON Pointer lookup into the original schema document (the
 * schemaUri fragment the plugin reports is exactly that pointer for local $ref/$defs).
 * This is authoritative wherever it applies, since it reflects exactly what was
 * evaluated for the data given: hyperjump only fires keyword evaluations for
 * instance pointers that exist in the data, so a declared-but-unfilled optional field is
 * indistinguishable, from firing alone, from a field in a branch that didn't match.
 *
 * Pass 2 (static, backfill): staticWalk() walks the raw schema document (bounded: local
 * $ref only, array items only where data provides them) to add nodes for
 * declared-but-currently-unfilled fields and to correctly mark declared-but-inactive-
 * branch fields as active: false. Fields pass 1 already populated are left untouched.
 * Branch selection for this pass comes from the plugin's per-scope validity map, not
 * from pass 1's `records` (see makeBranchChecker for why: pass 1's merge-up gate can
 * legitimately go empty for a schema that is only *incomplete*, not misselected).
 */
export function buildProjection(
  rawSchema: unknown,
  compiled: CompiledSchema,
  data: unknown,
  cache: ProjectionCache,
  limits: ProjectionLimits = DEFAULT_LIMITS,
  options: ProjectionOptions = {},
): SchemaProjection {
  const rootUri = compiled.schemaUri.split('#')[0]!
  const plugin = evaluateProjection(compiled, data, rootUri)
  const byPointer = groupRecordsByInstance(rawSchema, rootUri, plugin.records, cache.dialect)
  const nodes = buildEvaluatedNodes(rawSchema, rootUri, byPointer, cache.dialect)

  const { branchChecker, recursion } = buildStaticProjection(
    { rawSchema, compiled, data, plugin, cache, limits, options, nodes }
  )

  // After both passes, because either can have written the annotation: pass 1
  // reads the keyword off the schema position that fired, pass 2 fills the gap
  // for a location no data has reached. Which of them got there first is not
  // the question; a location with two declarations that disagree has no value
  // to report whoever wrote one.
  //
  // Two runs, because the two channels answer different questions. Without the
  // checker the walk follows only the edges that apply whatever the instance
  // is, which is what a diagnostic about the schema may claim. With it, the
  // walk also enters the branches this instance selects, which is what the node
  // reports. The second is a superset of the first, so the annotation is
  // omitted wherever either found a disagreement.
  const { schemaConflicts, applicableConflicts } = reconcileDefaultConflicts(
    rawSchema, data, nodes, cache.dialect, branchChecker, recursion
  )

  const { projected, diagnostics: shapeDiagnostics } = finalizeNodes(nodes, recursion.cycles)
  applyDefaultConflictNodes(projected, applicableConflicts)
  const diagnostics = buildProjectionDiagnostics(
    recursion.cycles, shapeDiagnostics, schemaConflicts, projected
  )
  return { nodes: projected, diagnostics }
}

function evaluateProjection(
  compiled: CompiledSchema,
  data: unknown,
  rootUri: string,
): ProjectionPlugin {
  const plugin = new ProjectionPlugin(rootUri)
  interpret(compiled, Instance.fromJs((data === undefined ? {} : data) as Parameters<typeof Instance.fromJs>[0]), {
    outputFormat: BASIC,
    plugins: [plugin],
  })
  return plugin
}

function shouldSkipDraft07Record(
  rawSchema: unknown,
  rootUri: string,
  record: KeywordRecord,
): boolean {
  const position = schemaPosition(record.schemaUri, rootUri)
  const source = schemaAtPosition(rawSchema, position)
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return false
  if (typeof (source as Record<string, unknown>).$ref !== 'string') return false
  const referencePosition = schemaReferenceTarget(rawSchema, position)
  return referencePosition !== undefined && schemaAtPosition(rawSchema, referencePosition) === false
}

function groupRecordsByInstance(
  rawSchema: unknown,
  rootUri: string,
  records: KeywordRecord[],
  dialect: ProjectionCache['dialect'],
): Map<string, KeywordRecord[]> {
  const byPointer = new Map<string, KeywordRecord[]>()
  for (const record of records) {
    if (dialect === 'draft-07' && shouldSkipDraft07Record(rawSchema, rootUri, record)) continue
    const list = byPointer.get(record.instancePointer) ?? []
    list.push(record)
    byPointer.set(record.instancePointer, list)
  }
  return byPointer
}

function buildEvaluatedNodes(
  rawSchema: unknown,
  rootUri: string,
  byPointer: Map<string, KeywordRecord[]>,
  dialect: ProjectionCache['dialect'],
): Map<string, DraftNode> {
  const nodes = new Map<string, DraftNode>()
  for (const [pointer, records] of byPointer) {
    const node = ensureNode(nodes, pointer)
    node.active = true
    const resolvedByKeyword = resolveKeywordsByRecord(rawSchema, rootUri, records)
    applyResolvedNodeValues({
      rawSchema,
      rootUri,
      nodes,
      pointer,
      node,
      records,
      resolvedByKeyword,
      dialect,
    })
  }
  return nodes
}

function resolveKeywordsByRecord(
  rawSchema: unknown,
  rootUri: string,
  records: KeywordRecord[],
): Map<string, unknown[]> {
  const resolvedByKeyword = new Map<string, unknown[]>()
  for (const record of records) {
    const value = schemaAtPosition(rawSchema, schemaPosition(record.schemaUri, rootUri))
    const list = resolvedByKeyword.get(record.keywordName) ?? []
    list.push(value)
    resolvedByKeyword.set(record.keywordName, list)
  }
  return resolvedByKeyword
}

function applyResolvedNodeValues(
  input: {
    rawSchema: unknown
    rootUri: string
    nodes: Map<string, DraftNode>
    pointer: string
    node: DraftNode
    records: KeywordRecord[]
    resolvedByKeyword: Map<string, unknown[]>
    dialect: ProjectionCache['dialect']
  },
): void {
  const { rawSchema, rootUri, nodes, pointer, node, records, resolvedByKeyword, dialect } = input
  applyNodeTypeAndFormat(node, resolvedByKeyword)
  applyNodeConstraints(rawSchema, rootUri, node, records, resolvedByKeyword, dialect)
  applyNodeAnnotations(node, resolvedByKeyword)
  applyNodeEnumValues(node, resolvedByKeyword)
  applyNodeProperties(nodes, pointer, resolvedByKeyword)
}

function applyNodeTypeAndFormat(
  node: DraftNode,
  resolvedByKeyword: Map<string, unknown[]>,
): void {
  const type = resolveTypeValue(resolvedByKeyword.get('type')?.[0])
  if (type !== undefined) node.type = type
  const format = resolvedByKeyword.get('format')?.[0] as string | undefined
  if (format !== undefined) node.format = format
}

function applyNodeConstraints(
  rawSchema: unknown,
  rootUri: string,
  node: DraftNode,
  records: KeywordRecord[],
  resolvedByKeyword: Map<string, unknown[]>,
  dialect: ProjectionCache['dialect'],
): void {
  const draft04Bounds = new Set(['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum'])
  for (const key of CONSTRAINT_KEYS) {
    if (dialect === 'draft-04' && draft04Bounds.has(key)) continue
    const value = resolvedByKeyword.get(key)?.[0]
    if (value !== undefined) (node.constraints as Record<string, unknown>)[key] = value
  }
  if (dialect === 'draft-04') {
    applyDraft04Bounds(rawSchema, rootUri, node, records, draft04Bounds)
  }
}

function applyDraft04Bounds(
  rawSchema: unknown,
  rootUri: string,
  node: DraftNode,
  records: KeywordRecord[],
  draft04Bounds: Set<string>,
): void {
  const constraints = node.constraints as Record<string, unknown>
  for (const record of records) {
    applyDraft04RecordBounds(rawSchema, rootUri, constraints, record, draft04Bounds)
  }
}

function applyDraft04RecordBounds(
  rawSchema: unknown,
  rootUri: string,
  constraints: Record<string, unknown>,
  record: KeywordRecord,
  draft04Bounds: Set<string>,
): void {
  if (!draft04Bounds.has(record.keywordName)) return
  const keywordPosition = schemaPosition(record.schemaUri, rootUri)
  const sourcePosition = schemaParentPosition(
    keywordPosition,
    Math.max(0, schemaPositionSegments(keywordPosition).length - 1),
  )
  const source = schemaAtPosition(rawSchema, sourcePosition)
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return
  applyDraft04BoundPair(source as Record<string, unknown>, constraints)
}

function applyDraft04BoundPair(
  schema: Record<string, unknown>,
  constraints: Record<string, unknown>,
): void {
  applyDraft04Bound(schema, constraints, 'minimum', 'exclusiveMinimum')
  applyDraft04Bound(schema, constraints, 'maximum', 'exclusiveMaximum')
}

function applyDraft04Bound(
  schema: Record<string, unknown>,
  constraints: Record<string, unknown>,
  bound: 'minimum' | 'maximum',
  exclusive: 'exclusiveMinimum' | 'exclusiveMaximum',
): void {
  const value = schema[bound]
  if (typeof value !== 'number') return
  const target = schema[exclusive] === true ? exclusive : bound
  if (constraints[target] === undefined) constraints[target] = value
}

function applyNodeAnnotations(
  node: DraftNode,
  resolvedByKeyword: Map<string, unknown[]>,
): void {
  for (const key of ANNOTATION_KEYS) {
    const value = resolvedByKeyword.get(key)?.[0]
    if (value !== undefined) (node.annotations as Record<string, unknown>)[key] = value
  }
}

function applyNodeEnumValues(
  node: DraftNode,
  resolvedByKeyword: Map<string, unknown[]>,
): void {
  const enumValue = resolvedByKeyword.get('enum')?.[0]
  if (Array.isArray(enumValue)) {
    node.enumValues = enumValue.map((value): EnumOption => ({ value }))
  }
}

function applyNodeProperties(
  nodes: Map<string, DraftNode>,
  pointer: string,
  resolvedByKeyword: Map<string, unknown[]>,
): void {
  const propertiesValues = resolvedByKeyword.get('properties')
  if (!propertiesValues) return
  const requiredSets = resolvedByKeyword.get('required') as unknown[][] | undefined
  const requiredKeys = new Set<string>()
  for (const arr of requiredSets ?? []) {
    if (Array.isArray(arr)) for (const key of arr) requiredKeys.add(key as string)
  }
  for (const propsObj of propertiesValues) {
    if (propsObj && typeof propsObj === 'object') {
      for (const key of Object.keys(propsObj as Record<string, unknown>)) {
        addChild(nodes, pointer, key, requiredKeys.has(key))
      }
    }
  }
}

function buildStaticProjection(
  input: {
    rawSchema: unknown
    compiled: CompiledSchema
    data: unknown
    plugin: ProjectionPlugin
    cache: ProjectionCache
    limits: ProjectionLimits
    options: ProjectionOptions
    nodes: Map<string, DraftNode>
  },
): { branchChecker: BranchChecker; recursion: ReturnType<typeof newRecursionState> } {
  const { rawSchema, compiled, data, plugin, cache, limits, options, nodes } = input
  const branchChecker = makeBranchChecker(rawSchema, plugin.scopeValidity, compiled, data, cache.dialect)
  const recursion = newRecursionState(
    cache,
    limits,
    options.expandedBoundaryTokens,
    options.boundaryGeneration,
  )
  const rootInfo = locationInfo(['#'], rawSchema, recursion)
  if (rootInfo.cycle) recursion.cycles.add('')
  else {
    staticWalk({
      schema: rawSchema,
      data,
      pointer: '',
      schemaPointer: '#',
      active: true,
      provisional: false,
      isBranchActive: branchChecker,
      nodes,
      visited: new Set(),
      rootSchema: rawSchema,
      recursion,
      declaring: ['#'],
      lineage: undefined,
      path: [],
    })
  }
  for (const level of recursion.queue) {
    for (const { enter } of (level ?? []).sort((a, b) => walkOrder(a.path, b.path))) enter()
  }
  resolveShapes(nodes)
  applyRecursionMetadata(nodes, recursion)
  return { branchChecker, recursion }
}

function applyRecursionMetadata(
  nodes: Map<string, DraftNode>,
  recursion: ReturnType<typeof newRecursionState>,
): void {
  for (const pointer of recursion.flagged) {
    const node = nodes.get(pointer)
    if (node) node.recursiveExpansion = true
  }
  for (const [pointer, reasons] of recursion.boundaries) {
    const node = nodes.get(pointer)
    if (node?.type !== 'object') continue
    node.boundaries = (['recursion', 'budget'] as const).filter((reason) => reasons.has(reason))
    const targets = recursion.boundaryTargets.get(pointer)
    if (targets) node.boundaryTargets = [...targets.values()]
  }
  for (const node of nodes.values()) {
    if (!node.children) continue
    node.children = node.children.filter(
      (child) => !recursion.pruned.has(child.pointer) || nodes.has(child.pointer),
    )
  }
}

function reconcileDefaultConflicts(
  rawSchema: unknown,
  data: unknown,
  nodes: Map<string, DraftNode>,
  dialect: ProjectionCache['dialect'],
  branchChecker: BranchChecker,
  recursion: ReturnType<typeof newRecursionState>,
): {
  schemaConflicts: ReturnType<typeof collectDefaultConflicts>
  applicableConflicts: ReturnType<typeof collectDefaultConflicts>
} {
  const sources = new Map<string, readonly string[]>()
  const schemaConflicts = collectDefaultConflicts(rawSchema, data, undefined, nodes, dialect)
  const conflictBranchChecker: BranchChecker = (schemaPointer, instancePointer, suffix) =>
    branchChecker(schemaPointer.startsWith('#') ? schemaPointer : '#' + schemaPointer, instancePointer, suffix)
  const applicableConflicts =
    collectDefaultConflicts(rawSchema, data, conflictBranchChecker, nodes, dialect, sources)
  for (const pointer of applicableConflicts.keys()) {
    const node = nodes.get(pointer)
    if (node) delete node.annotations.default
  }
  for (const [pointer, node] of nodes) {
    if ('default' in node.annotations && recursion.onCycle.has(pointer)) {
      node.defaultSources = sources.get(pointer) ?? []
    }
  }
  return { schemaConflicts, applicableConflicts }
}

function applyDefaultConflictNodes<K extends string, T extends { defaultConflict?: readonly string[] }>(
  projected: Map<K, T>,
  applicableConflicts: ReturnType<typeof collectDefaultConflicts>,
): void {
  for (const [pointer, sources] of applicableConflicts) {
    const node = projected.get(pointer as K)
    if (node) node.defaultConflict = sources
  }
}

function buildProjectionDiagnostics<T>(
  cycles: Set<string>,
  shapeDiagnostics: ProjectionDiagnostic[],
  schemaConflicts: ReturnType<typeof collectDefaultConflicts>,
  projected: Map<JsonPointer, T>,
): ProjectionDiagnostic[] {
  const diagnostics: ProjectionDiagnostic[] = []
  for (const pointer of cycles) {
    diagnostics.push({
      pointer: pointer as JsonPointer,
      code: 'unresolved-projection-shape',
      message:
        'A "$ref" or in-place applicator cycle never leaves this location, so there is no ' +
        'shape to render.',
    })
  }
  diagnostics.push(...shapeDiagnostics)
  for (const [pointer, sources] of schemaConflicts) {
    if (!projected.has(pointer as JsonPointer)) continue
    diagnostics.push({
      pointer: pointer as JsonPointer,
      code: 'ambiguous-default',
      message:
        String(sources.length) + ' "default" declarations apply here whatever the instance ' +
        'is, and they disagree, so there is no value to report. Declare one of them, ' +
        'or make them equal.',
      sources,
    })
  }
  return diagnostics
}

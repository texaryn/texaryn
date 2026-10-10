import { mergeNode, isSchemaNode, type SchemaNode, type ValidationPath } from 'json-schema-library'
import type {
  SchemaProjection,
  NodeProjection,
  ProjectionDiagnostic,
  ChildProjection,
  AnnotationSet,
  JsonPointer,
  JsonSchemaType,
  FieldConstraints,
  EnumOption,
  ProjectionBoundary,
  ProjectionBoundaryTarget,
  ProjectionOptions,
} from '@texaryn/core'
import {
  authoredSchema,
  childDeclaring,
  extendDeclaring,
  followRef,
  itemDeclaring,
  locationInfo,
  onlyPoints,
  positionOf,
  referenceKeywords,
  referenceOf,
  type LocationInfo,
  type ProjectionCache,
} from './identity.js'
import { inferProjectionShape, shapeDiagnostic } from './projection-shape.js'
import { POSITION } from './schema-graph.js'

const VALID_TYPES = new Set<JsonSchemaType>([
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
  'null',
])

const NON_ASSERTION_REFERENCE_SIBLINGS = new Set([
  '$id',
  '$anchor',
  '$dynamicAnchor',
  '$recursiveAnchor',
  '$schema',
  '$vocabulary',
  '$comment',
  '$defs',
  'definitions',
  POSITION,
])

function toPointer(value: string): JsonPointer {
  return value as JsonPointer
}

function escapeSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}

/** The `type` the schema itself declares, and nothing else. */
function resolveExplicitType(schema: Record<string, unknown>): JsonSchemaType | undefined {
  const type = schema.type
  if (Array.isArray(type)) {
    return type.find((t): t is JsonSchemaType => VALID_TYPES.has(t as JsonSchemaType))
  }
  if (typeof type === 'string' && VALID_TYPES.has(type as JsonSchemaType)) {
    return type as JsonSchemaType
  }
  return undefined
}

/**
 * Whether any branch of this node's `oneOf`/`anyOf` could be given a shape at
 * all, for some value.
 *
 * This is what separates "the current value matches no branch" from "this
 * composition is unrenderable whatever the value is". The first is validation's
 * subject and transient; the second is a limitation of this adapter and worth
 * reporting.
 */
function compositionHasRenderableAlternative(node: SchemaNode): boolean {
  const branches = [...(node.oneOf ?? []), ...(node.anyOf ?? [])]
  return branches.some((branch) => {
    const resolved = dereference(branch)
    const schema = resolved.schema as Record<string, unknown> | undefined
    if (!schema || typeof schema !== 'object') return false
    if (resolveExplicitType(schema)) return true
    return inferProjectionShape(schema).kind === 'resolved'
  })
}

function extractConstraints(schema: Record<string, unknown>): FieldConstraints {
  const constraints: FieldConstraints = {}
  if (typeof schema.minLength === 'number') constraints.minLength = schema.minLength
  if (typeof schema.maxLength === 'number') constraints.maxLength = schema.maxLength
  if (typeof schema.minimum === 'number') constraints.minimum = schema.minimum
  if (typeof schema.maximum === 'number') constraints.maximum = schema.maximum
  if (typeof schema.exclusiveMinimum === 'number') {
    constraints.exclusiveMinimum = schema.exclusiveMinimum
  }
  if (typeof schema.exclusiveMaximum === 'number') {
    constraints.exclusiveMaximum = schema.exclusiveMaximum
  }
  if (typeof schema.multipleOf === 'number') constraints.multipleOf = schema.multipleOf
  if (schema.pattern !== undefined) {
    constraints.pattern =
      schema.pattern instanceof RegExp ? schema.pattern.source : String(schema.pattern)
  }
  if (typeof schema.minItems === 'number') constraints.minItems = schema.minItems
  if (typeof schema.maxItems === 'number') constraints.maxItems = schema.maxItems
  if (typeof schema.uniqueItems === 'boolean') constraints.uniqueItems = schema.uniqueItems
  return constraints
}

function extractAnnotations(
  schema: Record<string, unknown>,
  /**
   * Set where two declarations apply to this location whatever the instance is
   * and disagree. The merged schema still carries one of them, and which one is
   * the merge's traversal order rather than an answer.
  */
  omitDefault = false,
  defaultOverride?: { readonly present: boolean; readonly value?: unknown },
): AnnotationSet {
  const annotations: AnnotationSet = {}
  if (typeof schema.title === 'string') annotations.title = schema.title
  if (typeof schema.description === 'string') annotations.description = schema.description
  if (typeof schema.readOnly === 'boolean') annotations.readOnly = schema.readOnly
  if (typeof schema.writeOnly === 'boolean') annotations.writeOnly = schema.writeOnly
  if (typeof schema.deprecated === 'boolean') annotations.deprecated = schema.deprecated
  if (Array.isArray(schema.examples)) annotations.examples = schema.examples
  if (!omitDefault) {
    if (defaultOverride) {
      if (defaultOverride.present) annotations.default = defaultOverride.value
    } else if ('default' in schema) {
      annotations.default = schema.default
    }
  }
  return annotations
}

function extractEnumValues(schema: Record<string, unknown>): EnumOption[] | undefined {
  if (!Array.isArray(schema.enum)) return undefined
  return schema.enum.map((value) => ({ value }))
}

function dereferenceChecked(node: SchemaNode): { node: SchemaNode; cycle: boolean; unresolved: boolean } {
  const completed = new Set<string>()
  const active = new Set<string>()
  const parts: SchemaNode[] = []
  let cycle = false
  let unresolved = false

  const visit = (current: SchemaNode, referringSite = false): void => {
    const position = positionOf(current)
    if (active.has(position)) {
      cycle = true
      return
    }
    if (completed.has(position)) return
    const references = referenceKeywords(current)
    if (references.length === 0) {
      parts.push(current)
      completed.add(position)
      return
    }
    if (!referringSite && current.getDraftVersion() !== 'draft-07' && !onlyPoints(current)) {
      parts.push(current)
      completed.add(position)
      return
    }

    active.add(position)
    for (const keyword of references) {
      const target = followRef(current, keyword)
      if (target === undefined || !isSchemaNode(target)) {
        unresolved = true
      } else {
        visit(target)
      }
    }
    if (current.getDraftVersion() !== 'draft-07') {
      const sibling = mergeNode(current, current, ...references)
      const siblingSchema = sibling?.schema as Record<string, unknown> | undefined
      if (
        isSchemaNode(sibling) &&
        Object.keys(siblingSchema ?? {}).some((keyword) => !NON_ASSERTION_REFERENCE_SIBLINGS.has(keyword))
      ) {
        parts.push(sibling)
      }
    }
    active.delete(position)
    completed.add(position)
  }

  visit(node, true)
  if (cycle) return { node, cycle: true, unresolved: false }
  if (unresolved || parts.length === 0) return { node, cycle: false, unresolved: true }
  if (parts.length === 1) return { node: parts[0]!, cycle: false, unresolved: false }
  const position = JSON.stringify(parts.map(positionOf))
  const type = referenceCompositionType(parts)
  const oneOfSource = parts.find((part) => part.oneOf !== undefined)
  const anyOfSource = parts.find((part) => part.anyOf !== undefined)
  const projectionFields: Record<string, unknown> = {}
  const projectionKeys = [
    'format',
    'minLength',
    'maxLength',
    'pattern',
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'multipleOf',
    'minItems',
    'maxItems',
    'uniqueItems',
    'enum',
    'title',
    'description',
    'readOnly',
    'writeOnly',
    'deprecated',
    'examples',
  ] as const
  for (const part of parts) {
    const record = part.schema as Record<string, unknown> | undefined
    if (!record || typeof record !== 'object') continue
    for (const keyword of projectionKeys) {
      if (keyword in record) projectionFields[keyword] = record[keyword]
    }
  }
  const schema = {
    ...projectionFields,
    [POSITION]: `reference-composition:${position}`,
    ...(type === undefined ? {} : { type }),
    // Compile a harmless branch so json-schema-library installs the allOf
    // reducer, then attach the already compiled components below. Recompiling
    // their raw schemas here would resolve relative references in the first
    // component's resource scope instead of each component's original scope.
    allOf: [{}],
  }
  const first = parts[0]!
  const composed = first.compileSchema(
    schema,
    `${first.evaluationPath}/$ref`,
    `${first.schemaLocation}/reference-composition`,
  )
  composed.schema = {
    ...composed.schema,
    allOf: parts.map((part) => part.schema),
    ...(oneOfSource?.oneOf ? { oneOf: oneOfSource.oneOf.map((branch) => branch.schema) } : {}),
    ...(anyOfSource?.anyOf ? { anyOf: anyOfSource.anyOf.map((branch) => branch.schema) } : {}),
  }
  composed.allOf = [...parts]
  if (oneOfSource?.oneOf) composed.oneOf = [...oneOfSource.oneOf]
  if (anyOfSource?.anyOf) composed.anyOf = [...anyOfSource.anyOf]
  composed.reduceNode = (data, options = {}) => {
    let reduced: SchemaNode | undefined
    let reductionFailed = false
    let reductionError: ReturnType<SchemaNode['reduceNode']>['error']
    for (const part of parts) {
      const outcome = part.reduceNode(data, options)
      if (!isSchemaNode(outcome.node)) {
        reductionFailed = true
        reductionError ??= outcome.error
        continue
      }
      const candidate = outcome.node
      reduced = reduced ? mergeNode(reduced, candidate) : candidate
    }
    if (reductionFailed) return { node: undefined, error: reductionError }
    if (!reduced) return { node: composed, error: undefined }

    const reducedSchema: Record<string, unknown> = {
      ...(reduced.schema as Record<string, unknown>),
      [POSITION]: `reference-composition:${position}`,
    }
    if (type !== undefined) reducedSchema.type = type

    const reducedNode = { ...reduced, schema: reducedSchema, allOf: undefined }
    if (type !== undefined) reducedNode.type = type
    return { node: reducedNode, error: undefined }
  }
  return { node: composed, cycle: false, unresolved: false }
}

/** Follows a $ref to the node it points at; returns the node unchanged otherwise. */
function dereference(node: SchemaNode): SchemaNode {
  return dereferenceChecked(node).node
}

function visitReferenceDefaultSites(
  node: SchemaNode,
  cache: ProjectionCache,
  visitor: (node: SchemaNode) => void,
  dynamicReferenceProjection = false,
): void {
  if (cache.dialect === 'draft-07' || referenceOf(node) === undefined) return
  const pending = [node]
  const visited = new Set<string>()
  while (pending.length > 0) {
    const current = pending.pop()!
    const position = positionOf(current)
    if (visited.has(position)) continue
    visited.add(position)

    const authored = authoredSchema(current, cache)
    if (
      authored !== null &&
      typeof authored === 'object' &&
      'default' in authored
    ) {
      visitor(current)
    }

    for (const keyword of referenceKeywords(current)) {
      if (dynamicReferenceProjection && (keyword === '$dynamicRef' || keyword === '$recursiveRef')) continue
      const target = followRef(current, keyword)
      if (target) pending.push(target)
    }
  }
}

function traversalKey(node: SchemaNode): string {
  const parent = node.parent
  const isInPlaceBranch =
    parent !== undefined &&
    (['if', 'then', 'else', 'contains'] as const).some(
      (keyword) =>
        parent[keyword] === node || node.evaluationPath === `${parent.evaluationPath}/${keyword}`,
    )
  if (isInPlaceBranch) {
    return positionOf(node)
  }
  const location = (node as { schemaLocation?: unknown }).schemaLocation
  return typeof location === 'string' ? location : positionOf(node)
}

function allOfExplicitType(node: SchemaNode, visited = new Set<string>()): JsonSchemaType | undefined {
  const position = positionOf(node)
  if (visited.has(position)) return undefined
  visited.add(position)
  for (const branch of node.allOf ?? []) {
    const reference = referenceOf(branch) !== undefined ? dereferenceChecked(branch) : undefined
    if (reference?.unresolved || (reference && !isSchemaNode(reference.node))) continue
    const target = reference?.node ?? branch
    const schema = target.schema as Record<string, unknown> | undefined
    if (schema && typeof schema === 'object') {
      const type = resolveExplicitType(schema)
      if (type) return type
    }
    const nested = allOfExplicitType(target, visited)
    if (nested) return nested
  }
  return undefined
}

function declaresObject(node: SchemaNode, visited = new Set<string>()): boolean {
  const resolved = dereference(node)
  if (!isSchemaNode(resolved)) return false
  const position = positionOf(resolved)
  if (visited.has(position)) return false
  visited.add(position)
  const schema = resolved.schema as Record<string, unknown> | undefined
  if (!schema || typeof schema !== 'object') return false
  const explicitType = resolveExplicitType(schema)
  if (explicitType) return explicitType === 'object'
  const allOfType = allOfExplicitType(resolved)
  if (allOfType) return allOfType === 'object'
  const shape = inferProjectionShape(schema)
  if (shape.kind === 'resolved') return shape.type === 'object'
  return (resolved.allOf ?? []).some((branch) => declaresObject(branch, visited))
}

function declaresArray(node: SchemaNode, visited = new Set<string>()): boolean {
  const resolved = dereference(node)
  if (!isSchemaNode(resolved)) return false
  const position = positionOf(resolved)
  if (visited.has(position)) return false
  visited.add(position)
  const schema = resolved.schema as Record<string, unknown> | undefined
  if (!schema || typeof schema !== 'object') return false
  const explicitType = resolveExplicitType(schema)
  if (explicitType) return explicitType === 'array'
  const allOfType = allOfExplicitType(resolved)
  if (allOfType) return allOfType === 'array'
  const shape = inferProjectionShape(schema)
  if (shape.kind === 'resolved') return shape.type === 'array'
  return (resolved.allOf ?? []).some((branch) => declaresArray(branch, visited))
}

function referenceCompositionType(parts: readonly SchemaNode[]): JsonSchemaType | undefined {
  const explicit = new Set(
    parts
      .map((part) => {
        const schema = part.schema as Record<string, unknown> | undefined
        return (schema && typeof schema === 'object' ? resolveExplicitType(schema) : undefined) ?? allOfExplicitType(part)
      })
      .filter((type): type is JsonSchemaType => type !== undefined),
  )
  if (explicit.size === 1) return [...explicit][0]
  if (explicit.size > 1) return undefined
  const object = parts.some((part) => declaresObject(part))
  const array = parts.some((part) => declaresArray(part))
  if (object === array) return undefined
  return object ? 'object' : 'array'
}

function hasReferencedAllOf(node: SchemaNode, visited = new Set<string>()): boolean {
  const position = positionOf(node)
  if (visited.has(position)) return false
  visited.add(position)
  for (const branch of node.allOf ?? []) {
    if (referenceOf(branch) !== undefined) return true
    if (hasReferencedAllOf(branch, visited)) return true
  }
  return false
}

function hasUnresolvedAllOfReference(node: SchemaNode, visited = new Set<string>()): boolean {
  const position = positionOf(node)
  if (visited.has(position)) return false
  visited.add(position)

  for (const branch of node.allOf ?? []) {
    const source = referenceOf(branch) !== undefined ? dereferenceChecked(branch) : undefined
    if (source?.unresolved || (source && !isSchemaNode(source.node))) return true
    const target = source?.node ?? branch
    if (hasUnresolvedAllOfReference(target, visited)) return true
  }
  return false
}

function expandAllOfReferences(node: SchemaNode, stack = new Set<string>()): SchemaNode | undefined {
  const position = positionOf(node)
  if (stack.has(position)) return node
  const nextStack = new Set(stack).add(position)
  const branches: SchemaNode[] = []
  let changed = false

  for (const branch of node.allOf ?? []) {
    if (referenceOf(branch) !== undefined) {
      const { node: target, unresolved } = dereferenceChecked(branch)
      if (unresolved || !isSchemaNode(target)) return undefined
      if (nextStack.has(positionOf(target))) {
        branches.push(branch)
        continue
      }
      const expanded = expandAllOfReferences(target, nextStack)
      if (!expanded) return undefined
      branches.push(expanded)
      changed = true
      continue
    }

    const expanded = expandAllOfReferences(branch, nextStack)
    if (!expanded) return undefined
    branches.push(expanded)
    changed ||= expanded !== branch
  }

  return changed ? { ...node, allOf: branches } : node
}

function reduceAllOfForProjection(node: SchemaNode, data: unknown, scope: ValidationPath = []): SchemaNode | undefined {
  if (hasUnresolvedAllOfReference(node)) return undefined
  if (node.getDraftVersion() !== 'draft-07') return node.reduceNode(data, { path: [...scope] }).node
  const expanded = expandAllOfReferences(node)
  return expanded?.reduceNode(data, { path: [...scope] }).node
}

// A dialect whose reducer leaves $ref unresolved reduces a selected `{ $ref }` branch to `{}`.
function resolveSelectedBranch(
  original: SchemaNode,
  reduced: SchemaNode,
  data: unknown,
  scope: ValidationPath = [],
  branchApplicability: WeakMap<SchemaNode, boolean> | undefined,
): SchemaNode {
  const reducedSchema = reduced.schema as Record<string, unknown>
  if (reducedSchema && typeof reducedSchema === 'object') {
    if (resolveExplicitType(reducedSchema) || inferProjectionShape(reducedSchema).kind === 'resolved') {
      return reduced
    }
  }
  const selected: SchemaNode[] = []
  if (original.oneOf) {
    const matching = original.oneOf.filter((branch) => branchApplies(branch, data, scope, branchApplicability))
    if (matching.length === 1) selected.push(matching[0]!)
  }
  for (const branch of original.anyOf ?? []) {
    if (branchApplies(branch, data, scope, branchApplicability)) selected.push(branch)
  }
  if (!selected.some((branch) => referenceOf(branch) !== undefined)) return reduced
  let merged: SchemaNode = reduced
  for (const branch of selected) {
    const target = dereference(branch)
    if (!isSchemaNode(target)) continue
    const targetReduced = target.reduceNode(data, { path: [...scope] }).node ?? target
    merged = mergeNode(merged, targetReduced) ?? merged
  }
  return merged
}

/** Fills properties a selected Draft 7 conditional `$ref` loses during reduction. */
function resolveSelectedConditionalReference(
  original: SchemaNode,
  reduced: SchemaNode,
  data: unknown,
  scope: ValidationPath = [],
  branchApplicability?: WeakMap<SchemaNode, boolean>,
): SchemaNode {
  if (original.getDraftVersion() !== 'draft-07' || !original.if) return reduced
  const selected = branchApplies(original.if, data, scope, branchApplicability) ? original.then : original.else
  if (!selected || typeof selected.$ref !== 'string') return reduced

  const target = dereference(selected)
  if (!isSchemaNode(target)) return reduced
  const targetReduced = reduceAllOfForProjection(target, data, scope) ?? target
  const reducedProperties = reduced.properties ?? {}
  const hasUnprojectedProperty = Object.keys(targetReduced.properties ?? {}).some(
    (key) => !Object.hasOwn(reducedProperties, key),
  )
  return hasUnprojectedProperty ? mergeNode(reduced, targetReduced) ?? reduced : reduced
}

export interface ProjectionLimits {
  readonly objects: number
  readonly nodes: number
}

export const DEFAULT_LIMITS: ProjectionLimits = { objects: 16, nodes: 512 }

interface Lineage {
  readonly key: string
  readonly pointer: string
  readonly recursive: boolean
  readonly depth: number
  readonly parent: Lineage | undefined
}

interface RecursionContext {
  readonly cache: ProjectionCache
  readonly branchApplicability: WeakMap<SchemaNode, boolean> | undefined
  readonly limits: ProjectionLimits
  readonly boundaries: Map<string, Set<ProjectionBoundary>>
  readonly boundaryTargets: Map<string, Map<string, ProjectionBoundaryTarget>>
  readonly expandedBoundaryTokens: ReadonlySet<string>
  readonly boundaryGeneration: number
  readonly removed: Set<string>
  readonly flagged: Set<string>
  readonly reserved: Set<string>
  readonly queue: { path: readonly number[]; enter: () => void }[][]
  objectsUsed: number
  nodesUsed: number
}

function walkOrder(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!
  return a.length - b.length
}

function boundaryToken(pointer: string, schemaKey: string, generation: number): string {
  return JSON.stringify([pointer, schemaKey, generation])
}

function addBoundary(
  ctx: RecursionContext,
  pointer: string,
  reason: ProjectionBoundary,
  targetPointer: string,
  schemaKey: string,
): void {
  const reasons = ctx.boundaries.get(pointer) ?? new Set<ProjectionBoundary>()
  reasons.add(reason)
  ctx.boundaries.set(pointer, reasons)
  const targets = ctx.boundaryTargets.get(pointer) ?? new Map<string, ProjectionBoundaryTarget>()
  if (![...targets.values()].some((target) => target.reason === reason)) {
    const token = boundaryToken(targetPointer, schemaKey, ctx.boundaryGeneration)
    targets.set(token, { pointer: toPointer(targetPointer), reason, token })
  }
  ctx.boundaryTargets.set(pointer, targets)
}

// A leaf needs no reduction, so it rides with its parent's budget unit.
function isLeafSchema(schema: unknown): boolean {
  if (typeof schema !== 'object' || schema === null) return true
  const record = schema as Record<string, unknown>
  const type = resolveExplicitType(record)
  if (type !== undefined) return type !== 'object'
  return ('enum' in record || 'const' in record) && !('properties' in record)
}

/**
 * The authored schema position as a JSON Pointer with the root as the empty
 * string. Reference sites and targets keep separate positions, and encoded
 * reference segments use their document spelling. Both adapters report
 * sources in this form so diagnostics mean the same thing whichever produced
 * them.
 */
function documentPointer(node: SchemaNode): string {
  return positionOf(node).replace(/^#/, '')
}

/** One `default` declaration, and the schema position that makes it. */
interface DefaultDeclaration {
  value: unknown
  source: string
}

/**
 * Visits every schema position that applies to one location whatever the
 * instance is.
 *
 * The edges followed are the unconditional ones: a schema's own keywords, its
 * `allOf` branches, and whatever a `$ref` resolves to. Nothing about an
 * instance can make one of those not apply, so two of them declaring different
 * values is a fact about the schema and there is no instance that resolves it.
 *
 * `oneOf`, `anyOf`, `if`/`then`/`else` and `dependentSchemas` are deliberately
 * not followed, and not because their conflicts are less real. A declaration
 * one of them carries competes with the base only while its branch is
 * selected, so whether the disagreement holds is a state of the data, and
 * `SchemaProjection.diagnostics` carries facts about schemas. Reporting it
 * there would mean a diagnostic that appears and disappears as a discriminator
 * is typed.
 *
 * `roots` is a set rather than one node because a location can be declared in
 * several places at once: `properties/x` on the node's own schema and on each
 * of its `allOf` branches are all declarations of the same location.
 */
function eachUnconditional(
  roots: readonly SchemaNode[],
  visitor: (node: SchemaNode) => void,
  referenceVisitor?: (node: SchemaNode) => void,
  cache?: ProjectionCache,
): void {
  const visited = new Set<string | SchemaNode>()

  const visit = (current: SchemaNode): void => {
    if (referenceVisitor && cache) visitReferenceDefaultSites(current, cache, referenceVisitor)
    const resolved = dereference(current)
    const key = traversalKey(resolved)
    if (visited.has(key)) return
    visited.add(key)

    visitor(resolved)
    for (const branch of resolved.allOf ?? []) visit(branch)
  }

  for (const root of roots) visit(root)
}

/**
 * Whether a conditional subschema applies to the instance at this location.
 *
 * Asked of the branch itself rather than of the whole instance, because each
 * branch is evaluated independently of whether `oneOf` ends up satisfied: a
 * form mid-edit routinely satisfies none, and a branch the data does match is
 * still the one carrying declarations that compete.
 *
 * A branch whose evaluation throws is treated as not applying. The projection's
 * own descent already survives the shapes that throw (#119, #121), and a
 * conflict is the wrong place to surface one.
 */
function branchApplies(
  branch: SchemaNode,
  data: unknown,
  scope: ValidationPath = [],
  branchApplicability?: WeakMap<SchemaNode, boolean>,
): boolean {
  if (data === undefined && branchApplicability?.has(branch)) {
    return branchApplicability.get(branch)!
  }
  try {
    const applies = branch.validate(data, '#', [...scope]).valid === true
    if (data === undefined) branchApplicability?.set(branch, applies)
    return applies
  } catch {
    return false
  }
}

/**
 * Every position that declares this location for the instance as it stands:
 * the unconditional edges above, plus the conditional branches this instance
 * selects.
 *
 * Applicability is exposure rather than validity, which is one place it
 * deliberately parts from JSON Schema: a provisionally selected `oneOf` branch
 * is entered even though it does not validate, because the projection exposes
 * it and ADR-003 fills from it, so a disagreement it carries has to be visible
 * where the fill would happen. `selectProvisionalBranch` is the same narrow
 * rule the projection uses to expose that branch, so the two cannot disagree
 * about which branch it is.
 */
function eachApplicable(
  roots: readonly SchemaNode[],
  data: unknown,
  branchApplicability: WeakMap<SchemaNode, boolean> | undefined,
  visitor: (node: SchemaNode) => void,
  referenceVisitor?: (node: SchemaNode) => void,
  cache?: ProjectionCache,
  scope: ValidationPath = [],
  dynamicReferenceProjection = false,
): void {
  const visited = new Set<string | SchemaNode>()

  const visit = (current: SchemaNode, parentScope: ValidationPath): void => {
    if (referenceVisitor && cache) visitReferenceDefaultSites(current, cache, referenceVisitor, dynamicReferenceProjection)
    const entered = dynamicReferenceProjection ? enterDynamicScope(current, parentScope) : { node: dereference(current), path: parentScope }
    const resolved = entered.node
    const currentScope = entered.path
    const key = traversalKey(resolved)
    if (visited.has(key)) return
    visited.add(key)

    visitor(resolved)
    for (const branch of resolved.allOf ?? []) visit(branch, currentScope)

    // `oneOf` contributes the one branch it selects, which is the evaluator's
    // rule and not "every branch the data matches": an empty object matches
    // every permissive branch, and treating all of them as applicable would
    // report a disagreement in a schema where the user has typed nothing. Zero
    // or several matching selects none, and then the provisionally identified
    // branch stands in, which is what the projection exposes.
    const oneOf = resolved.oneOf ?? []
    if (oneOf.length > 0) {
      const matching = oneOf.filter((branch) =>
        branchApplies(branch, data, currentScope, branchApplicability),
      )
      const selected =
        matching.length === 1
          ? matching[0]
          : selectProvisionalBranch(
              resolved,
              typeof data === 'object' && data !== null
                ? (data as Record<string, unknown>)
                : undefined,
            )
      if (selected) visit(selected, currentScope)
    }

    // `anyOf` is the opposite case and needs no such rule: several of its
    // branches applying at once is ordinary, and each that validates
    // contributes its annotations, so each competes.
    for (const branch of resolved.anyOf ?? []) {
      if (branchApplies(branch, data, currentScope, branchApplicability)) visit(branch, currentScope)
    }

    if (resolved.if) {
      const taken = branchApplies(resolved.if, data, currentScope, branchApplicability) ? resolved.then : resolved.else
      if (taken) visit(taken, currentScope)
    }

    const dependent = resolved.dependentSchemas as Record<string, SchemaNode> | undefined
    if (dependent && typeof data === 'object' && data !== null && !Array.isArray(data)) {
      for (const [dependency, subschema] of Object.entries(dependent)) {
        if (Object.prototype.hasOwnProperty.call(data, dependency)) visit(subschema, currentScope)
      }
    }
  }

  for (const root of roots) visit(root, scope)
}

function enterDynamicScope(node: SchemaNode, scope: ValidationPath): { node: SchemaNode; path: ValidationPath } {
  const path = [...scope]
  let current = node
  const seen = new Set<string>()
  while (
    typeof current.$ref === 'string' ||
    typeof (current.schema as Record<string, unknown>).$dynamicRef === 'string' ||
    typeof (current.schema as Record<string, unknown>).$recursiveRef === 'string'
  ) {
    const position = positionOf(current)
    if (seen.has(position)) break
    seen.add(position)
    const resolved = current.resolveRef({ pointer: '#', path })
    if (!isSchemaNode(resolved) || resolved === current) break
    if (
      typeof current.$ref === 'string' &&
      current.getDraftVersion() !== 'draft-07' &&
      !onlyPoints(current)
    ) {
      return { node: dereference(current), path }
    }
    current = resolved
  }
  if (path[path.length - 1]?.node !== current) path.push({ pointer: '#', node: current })
  return { node: current, path }
}

/**
 * The two position sets a location travels with.
 *
 * `unconditional` feeds `diagnostics`, which describes the schema, so it holds
 * only what applies whatever the instance is. `applicable` feeds
 * `NodeProjection.defaultConflict`, which describes this projection, so it also
 * holds whatever the instance currently selects. They are carried together
 * rather than derived from one another because neither is a subset of the other
 * once a conditional branch has been entered: everything below that branch is
 * conditional, however unconditional it looks from inside.
 */
interface DeclarationPositions {
  readonly unconditional: readonly SchemaNode[]
  readonly applicable: readonly SchemaNode[]
  /** Every position declaring this location, from every branch of every position applying at the parent, unmerged. */
  readonly declaring: readonly SchemaNode[]
}

function declarationsFrom(
  walkRoots: (
    visitor: (node: SchemaNode) => void,
    referenceVisitor: (node: SchemaNode) => void,
  ) => void,
  cache: ProjectionCache,
): DefaultDeclaration[] {
  const declarations: DefaultDeclaration[] = []
  const seen = new Set<string>()
  const add = (node: SchemaNode): void => {
    const schema = authoredSchema(node, cache)
    if (schema === null || typeof schema !== 'object' || !('default' in schema)) return
    const record = schema as Record<string, unknown>
    if (typeof record.$ref === 'string' && cache.dialect === 'draft-07') return
    const source = documentPointer(node)
    if (seen.has(source)) return
    seen.add(source)
    declarations.push({ value: record.default, source })
  }
  walkRoots(add, add)
  return declarations
}

function collectUnconditionalDefaults(
  roots: readonly SchemaNode[],
  cache: ProjectionCache,
): DefaultDeclaration[] {
  return declarationsFrom(
    (visitor, referenceVisitor) => eachUnconditional(roots, visitor, referenceVisitor, cache),
    cache,
  )
}

function collectApplicableDefaults(
  roots: readonly SchemaNode[],
  data: unknown,
  cache: ProjectionCache,
  scope: ValidationPath = [],
  dynamicReferenceProjection = false,
  branchApplicability?: WeakMap<SchemaNode, boolean>,
): DefaultDeclaration[] {
  return declarationsFrom(
    (visitor, referenceVisitor) =>
      eachApplicable(
        roots,
        data,
        branchApplicability,
        visitor,
        referenceVisitor,
        cache,
        scope,
        dynamicReferenceProjection,
      ),
    cache,
  )
}

/** The positions that declare one property of `roots`, by both reachability rules. */
function childPositions(
  roots: DeclarationPositions,
  key: string,
  data: unknown,
  declaring: readonly SchemaNode[],
  scope: ValidationPath = [],
  dynamicReferenceProjection = false,
  branchApplicability?: WeakMap<SchemaNode, boolean>,
): DeclarationPositions {
  const unconditional: SchemaNode[] = []
  eachUnconditional(roots.unconditional, (node) => {
    const child = memberSchema(node, key)
    if (child) unconditional.push(child)
  })

  const applicable: SchemaNode[] = []
  eachApplicable(roots.applicable, data, branchApplicability, (node) => {
    const child = memberSchema(node, key)
    if (child) applicable.push(child)
  }, undefined, undefined, scope, dynamicReferenceProjection)

  return { unconditional, applicable, declaring }
}

/** The positions that declare the elements of `roots`, by both reachability rules. */
function itemPositions(
  roots: DeclarationPositions,
  data: unknown,
  declaring: readonly SchemaNode[],
  scope: ValidationPath = [],
  dynamicReferenceProjection = false,
  branchApplicability?: WeakMap<SchemaNode, boolean>,
): DeclarationPositions {
  const unconditional: SchemaNode[] = []
  eachUnconditional(roots.unconditional, (node) => {
    if (node.items) unconditional.push(node.items)
  })

  const applicable: SchemaNode[] = []
  eachApplicable(roots.applicable, data, branchApplicability, (node) => {
    if (node.items) applicable.push(node.items)
  }, undefined, undefined, scope, dynamicReferenceProjection)

  return { unconditional, applicable, declaring }
}

/**
 * The declarations to report, or nothing where the schema states one answer.
 *
 * One declaration needs no report, and several that agree state the same
 * answer more than once, which is not a disagreement however many times it is
 * said. Compared by value, as ADR-003's own pass compares them: two branches
 * declaring an equal object have nothing to choose between.
 */
function disagreeingDefaults(
  declarations: readonly DefaultDeclaration[],
): readonly DefaultDeclaration[] | undefined {
  const [first, ...rest] = declarations
  return rest.every((other) => deepEqual(other.value, first!.value)) ? undefined : declarations
}

/**
 * A property key a form may need to render, and where its schema came from.
 *
 * The two are kept apart rather than collapsed to one node, because they carry
 * different authority. A key declared by this schema's own `properties` is the
 * most specific statement about that location. A key contributed by an
 * applicator branch is one of possibly several competing statements, and which
 * of them applies is a question about the data, not about the schema.
 */
interface CandidateProperty {
  /** Declared by the node's own `properties`. */
  direct?: SchemaNode
  /** Contributed by applicator branches, in the order the schema declares them. */
  alternatives: SchemaNode[]
}

function additionalPropertyKeys(
  node: SchemaNode | undefined,
  data: Record<string, unknown> | undefined,
): string[] {
  if (!node?.additionalProperties) return []
  const keys = new Set([...Object.keys(data ?? {}), ...(node.required ?? [])])
  return [...keys].filter(
    (key) =>
      !Object.hasOwn(node.properties ?? {}, key) &&
      !node.patternProperties?.some(({ pattern }) => pattern.test(key)),
  )
}

function additionalPropertySchema(node: SchemaNode | undefined, key: string): SchemaNode | undefined {
  if (!node || Object.hasOwn(node.properties ?? {}, key)) return undefined
  if (node.patternProperties?.some(({ pattern }) => pattern.test(key))) return undefined
  return node.additionalProperties
}

function memberSchema(node: SchemaNode | undefined, key: string): SchemaNode | undefined {
  if (!node) return undefined
  if (Object.hasOwn(node.properties ?? {}, key)) return node.properties?.[key]
  return additionalPropertySchema(node, key)
}

function applicableAdditionalPropertySchemas(
  roots: readonly SchemaNode[],
  key: string,
  data: unknown,
  scope: ValidationPath = [],
  dynamicReferenceProjection = false,
  branchApplicability?: WeakMap<SchemaNode, boolean>,
): SchemaNode[] {
  const schemas: SchemaNode[] = []
  const seen = new Set<string>()
  eachApplicable(roots, data, branchApplicability, (node) => {
    const schema = additionalPropertySchema(node, key)
    if (!schema) return
    const position = positionOf(schema)
    if (seen.has(position)) return
    seen.add(position)
    schemas.push(schema)
  }, undefined, undefined, scope, dynamicReferenceProjection)
  return schemas
}

function applicableRequiredKeys(
  roots: readonly SchemaNode[],
  data: unknown,
  scope: ValidationPath = [],
  dynamicReferenceProjection = false,
  branchApplicability?: WeakMap<SchemaNode, boolean>,
): Set<string> {
  const keys = new Set<string>()
  eachApplicable(roots, data, branchApplicability, (node) => {
    for (const key of node.required ?? []) keys.add(key)
  }, undefined, undefined, scope, dynamicReferenceProjection)
  return keys
}

function unconditionalRequiredKeys(roots: readonly SchemaNode[]): Set<string> {
  const keys = new Set<string>()
  eachUnconditional(roots, (node) => {
    for (const key of node.required ?? []) keys.add(key)
  })
  return keys
}

function reduceAdditionalPropertySchema(source: SchemaNode, data: unknown, scope: ValidationPath = []): SchemaNode {
  if (source.getDraftVersion() !== 'draft-07') return source.reduceNode(data, { path: [...scope] }).node ?? source
  const { node, unresolved } = dereferenceChecked(source)
  if (unresolved || !isSchemaNode(node)) return source
  return reduceAllOfForProjection(node, data) ?? node
}

const candidatePropertyCache = new WeakMap<SchemaNode, ReadonlyMap<string, CandidateProperty> | null>()

/**
 * Property keys that might need to appear at this instance location.
 *
 * Declared keys remain static candidates across all branches. Keys governed
 * only by `additionalProperties` come from the current data, since the schema
 * has no finite set of names to enumerate; required names are candidates too.
 * `reduceNode` decides which candidates apply now, so an inactive branch keeps
 * its declared pointers with `active: false`.
 *
 * **Recursion is through applicators only, and only those acting on this same
 * instance location**: `if`, `then`, `else`, `allOf`, `anyOf`, `oneOf`,
 * `dependentSchemas`, and whatever a `$ref` resolves to. draft-07
 * `dependencies` needs no separate handling, because json-schema-library
 * normalises it into `dependentSchemas` at parse time.
 *
 * Three things are deliberately not followed:
 *
 * - **`not`**, because a subschema inside it describes a shape the instance
 *   must *not* satisfy. Collecting its properties as candidates would invert
 *   its meaning.
 * - **the values of `properties`**, because those describe a child location,
 *   not this one. `owner` is collected; the walk descends into `/owner`
 *   separately and collects `name` there. Following it here would make `name` a
 *   sibling of `owner`.
 * - **`items` and `prefixItems`**, for the same reason: an array's items are
 *   their own locations.
 *
 * Inline conditional branches use `positionOf` because the library can assign
 * `if`, `then` and `else` the same `schemaLocation` after resolving a
 * reference. Other nodes keep their location key, so references still close
 * at the same point in the traversal as before.
 */
function collectCandidateProperties(
  node: SchemaNode,
  data: Record<string, unknown> | undefined,
): ReadonlyMap<string, CandidateProperty> {
  if (candidatePropertyCache.has(node)) {
    const cached = candidatePropertyCache.get(node)
    if (cached) return cached
  }
  const candidates = new Map<string, CandidateProperty>()
  const visited = new Set<string>()
  const scopes: { node: SchemaNode; own: boolean }[] = []

  const record = (key: string, propNode: SchemaNode, direct: boolean): void => {
    const entry = candidates.get(key) ?? { alternatives: [] }
    if (direct) entry.direct ??= propNode
    else entry.alternatives.push(propNode)
    candidates.set(key, entry)
  }

  const visit = (current: SchemaNode, own: boolean): void => {
    const resolved = dereference(current)

    const key = traversalKey(resolved)
    if (visited.has(key)) return
    visited.add(key)
    scopes.push({ node: resolved, own })

    for (const [key, propNode] of Object.entries(resolved.properties ?? {})) {
      record(key, propNode, own)
    }

    for (const branch of [resolved.if, resolved.then, resolved.else]) {
      if (branch) visit(branch, false)
    }
    for (const branch of resolved.allOf ?? []) visit(branch, own)
    for (const branches of [resolved.anyOf, resolved.oneOf]) {
      for (const branch of branches ?? []) visit(branch, false)
    }
    for (const dependency of Object.values(resolved.dependentSchemas ?? {})) {
      if (dependency && typeof dependency === 'object') {
        visit(dependency as SchemaNode, false)
      }
    }
  }

  visit(node, true)
  const memberKeys = new Set(Object.keys(data ?? {}))
  for (const scope of scopes) for (const key of scope.node.required ?? []) memberKeys.add(key)
  for (const { node: scope, own } of scopes) {
    for (const key of memberKeys) {
      const propNode = additionalPropertySchema(scope, key)
      if (propNode) record(key, propNode, own)
    }
  }
  const hasDataDependentAdditionalProperties = scopes.some(({ node: scope }) => Boolean(scope.additionalProperties))
  candidatePropertyCache.set(node, hasDataDependentAdditionalProperties ? null : candidates)
  return candidates
}

/**
 * The schema to project for a candidate when no branch is active.
 *
 * A hidden node is still compiled, so it needs some shape, and an inactive key
 * defined differently by two branches has no single right answer. The rule is
 * therefore stated rather than left to traversal order: the node's own
 * declaration wins, and failing that the first branch the schema declares. It
 * is a stable placeholder and deliberately not a claim that one branch matters
 * more, which is why `CandidateProperty` keeps the alternatives instead of
 * discarding them.
 *
 * Last of three, and only reached when no branch has claimed the location: an
 * active branch gives `walk` the reduced node, and a provisionally selected one
 * gives it `composeChild`, so this is consulted for neither.
 */
function candidatePrototype(candidate: CandidateProperty): SchemaNode {
  return candidate.direct ?? candidate.alternatives[0]
}

/**
 * The two statements that both apply to a child location, as one node.
 *
 * A selected branch beats an unselected sibling, and it does not beat the
 * node's own unconditional declaration: in JSON Schema the two are conjunctive,
 * so the instance has to satisfy both. Replacing in either direction is wrong,
 * and visibly so from the form. Dropping the base constraint makes the form
 * accept what the submission rejects. Dropping the branch's makes an unrelated
 * limit appear from nowhere the moment the branch activates, when all the user
 * supplied was the property that completed it.
 *
 * `mergeNode` is the library's own routine, the one `reduceNode` uses to fold a
 * reducer's result into the node it is building, called here in that same order:
 * base first, branch second, so the branch wins a keyword both sides declare.
 * Matching it is the point. It makes the provisional projection *equal* the
 * active projection of the same branch rather than merely resemble it, which is
 * what a hand-written conjunction could not promise.
 *
 * Both sides are dereferenced first because `mergeNode` carries `$ref` over
 * from the base, and `walk` dereferences whatever it is handed: an unresolved
 * `$ref` on the result would resolve back to the base alone and discard the
 * branch.
 */
function composeChild(base?: SchemaNode, branch?: SchemaNode): SchemaNode | undefined {
  if (!base || !branch) return base ?? branch
  return mergeNode(dereference(base), dereference(branch))
}

/**
 * The `oneOf` branch the current data uniquely identifies, when the evaluator
 * selected none.
 *
 * `oneOf` selects on full validity, so a branch the data plainly identifies
 * stays unselected while one of its own required properties is absent, and
 * hiding it leaves the user no way to supply the property that would make it
 * apply. This picks that branch so a form can expose it, and the node it
 * returns is reported `provisional` rather than `active`: JSON Schema still
 * says the branch does not apply, and that fact is not this function's to
 * overwrite.
 *
 * Deliberately narrow, because a form that guesses is worse than one that shows
 * nothing:
 *
 * - only an explicit `const` or `enum` on a property discriminates, and both
 *   together are conjunctive rather than alternatives
 * - a discriminator has to be present in the data by own-property presence,
 *   never read from a `default` annotation, since a declared default is not a
 *   value anyone supplied
 * - a key discriminates only if every branch constrains it, so branches that
 *   simply differ in shape do not vote
 * - every present discriminator has to agree on one branch
 * - zero or several surviving branches select nothing
 *
 * `type` is excluded: it says almost nothing about intent when every branch is
 * an object. `anyOf` is excluded because several of its branches may apply at
 * once, which is a different question from which one the user means.
 *
 * Nothing else about a branch participates. A branch stays identified when some
 * other constraint of its own fails, or selection would quietly become validity
 * again and the field that completes the branch would stay hidden for a second
 * reason.
 */
function selectProvisionalBranch(
  node: SchemaNode,
  dataRecord: Record<string, unknown> | undefined,
): SchemaNode | undefined {
  const branches = node.oneOf
  if (!branches || branches.length === 0 || dataRecord === undefined) return undefined

  const resolvedBranches = branches.map(dereference)
  const discriminators = [...discriminatorKeys(resolvedBranches)].filter((key) =>
    Object.prototype.hasOwnProperty.call(dataRecord, key),
  )
  if (discriminators.length === 0) return undefined

  const accepted = resolvedBranches.filter((branch) =>
    discriminators.every((key) => branchAccepts(branch, key, dataRecord[key])),
  )
  return accepted.length === 1 ? accepted[0] : undefined
}

/** Keys every branch constrains with `const` or `enum`. */
function discriminatorKeys(branches: readonly SchemaNode[]): Set<string> {
  const first = branches[0]
  if (!first) return new Set()
  const shared = new Set(
    Object.keys((first.schema as Record<string, unknown>).properties ?? {}).filter((key) =>
      isDiscriminator(first, key),
    ),
  )
  for (const branch of branches.slice(1)) {
    for (const key of [...shared]) {
      if (!isDiscriminator(branch, key)) shared.delete(key)
    }
  }
  return shared
}

function discriminatorSchema(
  branch: SchemaNode,
  key: string,
): Record<string, unknown> | undefined {
  const property = branch.properties?.[key]
  if (!property) return undefined
  return dereference(property).schema as Record<string, unknown>
}

function isDiscriminator(branch: SchemaNode, key: string): boolean {
  const schema = discriminatorSchema(branch, key)
  if (!schema) return false
  return 'const' in schema || Array.isArray(schema.enum)
}

/** `const` and `enum` are separate constraints, so a value has to satisfy both. */
function branchAccepts(branch: SchemaNode, key: string, value: unknown): boolean {
  const schema = discriminatorSchema(branch, key)
  if (!schema) return false
  if ('const' in schema && !deepEqual(schema.const, value)) return false
  if (Array.isArray(schema.enum) && !schema.enum.some((member) => deepEqual(member, value))) {
    return false
  }
  return true
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Computes the currently-required property keys for an object node given its data.
 *
 * `reducedSchema.required` already reflects if/then/else and dependentSchemas (their
 * reducers merge `required` arrays). It does not reflect a standalone `dependentRequired`
 * keyword, which json-schema-library only enforces at validation time and never merges
 * into a reduced schema's `required` list, so that keyword's effect is computed here
 * directly from `node.dependentRequired` and the trigger properties present in `data`.
 */
function computeRequiredSet(
  resolved: SchemaNode,
  reducedSchema: Record<string, unknown> | undefined,
  dataRecord: Record<string, unknown> | undefined,
): Set<string> {
  const baseSchema = resolved.schema as Record<string, unknown>
  const requiredSource = Array.isArray(reducedSchema?.required)
    ? (reducedSchema.required as string[])
    : Array.isArray(baseSchema.required)
      ? (baseSchema.required as string[])
      : []
  const required = new Set(requiredSource)

  if (resolved.dependentRequired && dataRecord) {
    for (const [trigger, extra] of Object.entries(resolved.dependentRequired)) {
      if (Object.prototype.hasOwnProperty.call(dataRecord, trigger)) {
        for (const key of extra) required.add(key)
      }
    }
  }
  return required
}

// Keep aligned with json-schema-library 11.6.2 addReduce predicates.
function requiresReduction(node: SchemaNode): boolean {
  const schema = node.schema as Record<string, unknown>
  return (
    schema.$ref != null ||
    schema.$dynamicRef != null ||
    schema.$recursiveRef != null ||
    schema.allOf != null ||
    schema.anyOf != null ||
    schema.contains != null ||
    schema.dependencies != null ||
    schema.dependentSchemas != null ||
    (schema.if != null && (schema.then != null || schema.else != null)) ||
    schema.oneOf != null ||
    schema.patternProperties != null ||
    schema.propertyDependencies != null ||
    Array.isArray(node.type)
  )
}

// An unreadable identity is never a repeat, and is budgeted so it cannot expand without end.
const budgeted = (info: LocationInfo): boolean => info.cyclic || info.key === ''

/**
 * Walks the compiled schema statically (via node.properties/node.items plus every
 * conditional branch), only descending into array items that are actually present in
 * the data, and collects one NodeProjection per JsonPointer into `nodes`.
 *
 * Static (not data-driven) traversal is required for object properties so that fields
 * absent from the current data instance (e.g. an untouched optional field, or a field
 * that only exists in an inactive if/then/else/dependentSchemas branch) still produce a
 * NodeProjection a form can render, with `active` reflecting whether that branch is
 * currently selected for `data`.
 */
function walk(
  node: SchemaNode,
  pointer: string,
  data: unknown,
  active: boolean,
  /**
   * Whether an ancestor's provisionally selected branch exposes this node. A
   * node is never both: `active` is what the schema says, and this is what the
   * projection selected so the user can complete it.
   */
  provisional: boolean,
  nodes: Map<JsonPointer, NodeProjection>,
  diagnostics: ProjectionDiagnostic[],
  /**
   * The schema positions that declare this location, which `node` alone cannot
   * supply: by the time the caller has a node to walk it holds the merge of
   * them, and the merge is what loses a disagreement.
   */
  declaredAt: DeclarationPositions,
  ctx: RecursionContext,
  /** Entered as an object member, which is the only way to be past the data. */
  member: boolean,
  /** The past-the-data ancestors, nearest first, up to the nearest location holding data. */
  lineage: Lineage | undefined,
  path: readonly number[],
  scope: ValidationPath,
): void {
  if (ctx.cache.dynamicReferenceProjection) {
    const entered = enterDynamicScope(node, scope)
    node = entered.node
    scope = entered.path
  }
  const info = locationInfo(declaredAt.declaring, ctx.cache)
  const { node: original, cycle: referenceCycle, unresolved: unresolvedReference } = dereferenceChecked(node)
  if (info.cycle || referenceCycle) {
    diagnostics.push({
      pointer: toPointer(pointer),
      code: 'unresolved-projection-shape',
      message:
        `A "$ref" or in-place applicator cycle never leaves this location, so there is no ` +
        `shape to render.`,
    })
    return
  }
  const pastData = member && (data === undefined || data === null)
  const token = boundaryToken(pointer, info.key, ctx.boundaryGeneration)
  const recursive =
    pastData && !unresolvedReference && ((lineage?.recursive ?? false) || budgeted(info))
  for (let ancestor = pastData ? lineage : undefined; ancestor; ancestor = ancestor.parent) {
    if (
      info.key !== '' &&
      ancestor.key === info.key &&
      !ctx.expandedBoundaryTokens.has(token)
    ) {
      addBoundary(ctx, ancestor.pointer, 'recursion', pointer, info.key)
      ctx.removed.add(pointer)
      return
    }
  }
  const originalSchema = original.schema as Record<string, unknown>
  if (recursive && lineage !== undefined) {
    const parent = pointer.slice(0, pointer.lastIndexOf('/'))
    let admit: boolean
    if (isLeafSchema(originalSchema)) {
      const covered = ctx.reserved.has(parent)
      admit = ctx.expandedBoundaryTokens.has(token) || covered || ctx.nodesUsed < ctx.limits.nodes
      if (admit && !covered) ctx.nodesUsed += 1
    } else {
      const explicitlyExpanded = ctx.expandedBoundaryTokens.has(token)
      const leaves = [...collectCandidateProperties(original, undefined).values()].filter((candidate) =>
        isLeafSchema(dereference(candidatePrototype(candidate)).schema),
      ).length
      admit =
        explicitlyExpanded ||
        (ctx.objectsUsed < ctx.limits.objects && ctx.nodesUsed + 1 + leaves <= ctx.limits.nodes)
      if (admit) {
        ctx.objectsUsed += 1
        ctx.nodesUsed += explicitlyExpanded ? 1 : 1 + leaves
        if (!explicitlyExpanded) ctx.reserved.add(pointer)
      }
    }
    if (!admit) {
      addBoundary(ctx, parent, 'budget', pointer, info.key)
      ctx.removed.add(pointer)
      return
    }
    ctx.flagged.add(pointer)
  }
  if (typeof originalSchema !== 'object' || originalSchema === null) return

  let resolved = original
  let schema = originalSchema
  let type = resolveExplicitType(schema)
  const localShape = inferProjectionShape(schema)
  const allOfType = original.allOf ? allOfExplicitType(original) : undefined
  const hasReferencedAllOfBranch = original.allOf ? hasReferencedAllOf(original) : false
  if (
    original.allOf &&
    !original.oneOf &&
    !original.anyOf &&
    !type &&
    (localShape.kind !== 'resolved' || allOfType !== undefined) &&
    (hasReferencedAllOfBranch || allOfType !== undefined)
  ) {
    const reductionData =
      (allOfType === 'object' || declaresObject(original)) &&
      (data === undefined || data === null)
        ? {}
        : data
    const reduced = reduceAllOfForProjection(original, reductionData, scope)
    const reducedSchema = reduced?.schema as Record<string, unknown> | undefined
    if (reduced && reducedSchema && typeof reducedSchema === 'object') {
      resolved = reduced
      schema = reducedSchema
      if (!type) type = resolveExplicitType(schema)
    }
  }

  if (!type && ctx.cache.dynamicReferenceProjection && original.allOf?.length) {
    const reduced = original.reduceNode(data, { path: [...scope] }).node
    if (reduced) {
      resolved = reduced
      schema = reduced.schema as Record<string, unknown>
      type = resolveExplicitType(schema)
    }
  }
  // Whether this node's own active branch could be determined. Stays true for every
  // node except a typeless oneOf/anyOf wrapper whose branch could not be resolved
  // (see below), where the node's own presence in the projection is the thing in
  // doubt rather than only its children's.
  let branchResolved = true

  // A node whose own schema carries no `type` keyword, only `oneOf`/`anyOf` branches
  // (e.g. a property schema like `{ oneOf: [{ type: 'object', ... }, ...] }`), has no
  // type until its active branch is resolved against `data`. `original` is kept
  // separately so every branch's properties can still be collected below for the
  // inactive-node contract, even though only the matching branch's schema is used here.
  // Whether a branch of this node's own `oneOf`/`anyOf` was resolved against
  // `data`. Recorded so an unresolved shape can be attributed correctly below:
  // on this path, "no shape" means the current value matches no branch, which
  // is a fact about the data rather than about the schema.
  let composedAgainstData = false
  /**
   * Whether a typeless wrapper's branch was picked by the discriminator rather
   * than by the evaluator. The wrapper is then shown provisionally: the schema
   * still applies no branch, and that is what `active` reports.
   */
  let wrapperIdentified = false

  if (!type && (original.oneOf || original.anyOf)) {
    composedAgainstData = true
    const { node: branchNode } = original.reduceNode(data, { path: [...scope] })
    if (branchNode) {
      resolved = resolveSelectedBranch(original, branchNode, data, scope, ctx.branchApplicability)
      schema = resolved.schema as Record<string, unknown>
      type = resolveExplicitType(schema)
    } else {
      // reduceNode() returned no node at all: this is oneOf's behavior when data
      // matches zero or multiple branches (anyOf instead returns a node with an
      // empty merged schema in that case, which carries no explicit type either,
      // but which does not reach this branch). This test suite's oneOf wrappers put
      // an object schema on every branch, so 'object' is a safe stand-in type here:
      // it lets this pointer and every candidate branch property still appear in the
      // projection, all `active: false`, per the inactive-node contract, instead of
      // silently dropping the whole subtree. A oneOf/anyOf wrapper whose branches are
      // primitives (not objects) is not handled by this fallback.
      type = 'object'
      branchResolved = false
      // The wrapper's own branch could not be resolved, so the schema applies
      // none of them. It may still be identifiable: a discriminator present in
      // the data picks one, and the wrapper is then exposed provisionally
      // rather than not at all. Without that, the same schema behaves
      // differently for having declared `type` or not, since the typed path
      // reaches the selector below and this one used to stop here.
      //
      // Only the flag is recorded, deliberately. Assigning the branch to
      // `resolved` erases the difference between what the evaluator resolved
      // and what this projection selected, and the object path reads `resolved`
      // as the former: it would take the branch's `required` as active
      // requiredness, find `nodeActive` false because no branch applies, and
      // report the field as neither required nor provisionally required.
      // Left alone, that path selects the same branch through
      // `selectProvisionalBranch` and attributes it to the right one of the two.
      //
      // Gated on this node already being exposed, for the reason the object
      // path is: selection is local, exposure is the ancestor's to grant.
      wrapperIdentified =
        (active || provisional) &&
        selectProvisionalBranch(
          original,
          typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : undefined,
        ) !== undefined
    }
  }

  /**
   * Whether the absence of a shape here is only the current value's fault.
   *
   * Two conditions, and both are needed. Nothing was merged in from a branch,
   * which is what reducing against a value that satisfies none of them leaves
   * behind; and some branch could have been rendered for a value that did
   * satisfy it, so the composition is not unrenderable in itself.
   *
   * The first condition is what a coarser check missed. Entering the
   * composition path says nothing on its own: a branch can be selected and
   * still supply no shape, as `{ anyOf: [{ minLength: 1 }, { pattern: '^a' }] }`
   * does for `"abc"`, where both branches match and neither describes anything
   * this adapter renders, because scalar shapes are deliberately not inferred.
   * That schema is genuinely unprojectable and has to be reported.
   */
  const isTransientBranchMiss = (): boolean =>
    Object.keys(schema).every((keyword) => keyword === POSITION) && compositionHasRenderableAlternative(original)

  // Last resort, after the oneOf/anyOf branch above has had its chance: that
  // path handles a typeless wrapper whose type only exists once a branch is
  // chosen, and inferring first would take a schema carrying both `properties`
  // and `oneOf` down the object path without ever resolving its branch.
  if (!type) {
    const shape = inferProjectionShape(schema)
    if (shape.kind === 'resolved') {
      type = shape.type
    } else if (shape.kind === 'none' && composedAgainstData && isTransientBranchMiss()) {
      // Deliberately silent, and only for this one case. A projection
      // diagnostic describes a schema this adapter cannot turn into a shape,
      // and a value that matches none of a composition's branches is not that:
      // the same schema renders for a value that does match one. That is
      // validation's subject, it is already reported there, and a form's data
      // is in this state for most of the time someone is filling it in, so a
      // diagnostic here would appear and disappear on each keystroke and train
      // a caller to ignore the channel.
    } else {
      // Reported rather than dropped in silence. The field cannot be drawn
      // without a shape, so the caller is told which pointer was skipped and
      // why, instead of finding out from a form that never collected the
      // value.
      diagnostics.push(shapeDiagnostic(toPointer(pointer), shape, schema.enum !== undefined))
    }
  }

  // Arrays do not pass through the object path that reduces the active schema.
  if (type === 'array' && resolved === original && original.allOf) {
    const reduced = reduceAllOfForProjection(original, data, scope)
    const reducedSchema = reduced?.schema as Record<string, unknown> | undefined
    if (reduced && reducedSchema && typeof reducedSchema === 'object') {
      resolved = reduced
      schema = reducedSchema
    }
  }

  if (!type) return
  const selfLineage: Lineage | undefined = pastData
    ? { key: info.key, pointer, recursive, depth: (lineage?.depth ?? 0) + 1, parent: lineage }
    : undefined

  // Reported at the location it is about, and after the shape gate above: a
  // pointer with no node has nothing to omit an annotation from, and saying
  // that its `default` is undecidable on top of saying it cannot be drawn at
  // all would be the same schema reported twice.
  const ambiguousDefault = disagreeingDefaults(
    collectUnconditionalDefaults(declaredAt.unconditional, ctx.cache),
  )
  if (ambiguousDefault) {
    diagnostics.push({
      pointer: toPointer(pointer),
      code: 'ambiguous-default',
      message:
        `${ambiguousDefault.length} "default" declarations apply here whatever the ` +
        `instance is, and they disagree, so there is no value to report. Declare one ` +
        `of them, or make them equal.`,
      sources: ambiguousDefault.map((declaration) => declaration.source),
    })
  }

  // The node's own answer, which includes whatever branches this instance
  // selects. A superset of the diagnostic's: every unconditional disagreement
  // is also an applicable one, so the node carries both kinds and a consumer
  // reads one place.
  const applicableData =
    type === 'object' && !(typeof data === 'object' && data !== null) ? {} : data
  const applicableDeclarations = collectApplicableDefaults(
    declaredAt.applicable,
    applicableData,
    ctx.cache,
    scope,
    ctx.cache.dynamicReferenceProjection,
    ctx.branchApplicability,
  )
  const applicableConflict = disagreeingDefaults(applicableDeclarations)
  const conflictedDefault = applicableConflict !== undefined || ambiguousDefault !== undefined
  const defaultConflict = (applicableConflict ?? ambiguousDefault)?.map(
    (declaration) => declaration.source,
  )
  const defaultSources =
    !conflictedDefault && applicableDeclarations.length > 0 && info.cyclic
      ? [...new Set(applicableDeclarations.map((declaration) => declaration.source))].sort()
      : undefined
  const defaultOverride = {
    present: applicableDeclarations.length > 0,
    value: applicableDeclarations[0]?.value,
  }

  const nodeActive = active && branchResolved
  // A node the schema applies is never also provisional; the two report
  // different facts and only the second is a choice this projection made. The
  // `!nodeActive` term is belt and braces: `provisional` only ever arrives true
  // from a parent that computed `!childActive`, so no caller can reach here
  // with both, and dropping the term changes no observable behaviour.
  const nodeProvisional = !nodeActive && (provisional || wrapperIdentified) && (branchResolved || wrapperIdentified)
  // Whether a form shows this node at all, which is what a descendant inherits.
  const nodeExposed = nodeActive || nodeProvisional

  if (type === 'object') {
    const dataRecord =
      typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : undefined

    // reduceNode() resolves if/then/else, dependentSchemas (which also covers
    // draft-07 schema-form dependencies), and oneOf/anyOf against `data`, merging the
    // active branch's properties/required into the returned schema. An empty object
    // stands in for "no data yet" so the reducers still run instead of being skipped
    // outright. When no branch can be resolved (e.g. a oneOf with zero or multiple
    // matches), reduceNode reports an error instead of a node; the object's own
    // directly-declared properties are used as the active set in that case, so a
    // discriminator field outside the oneOf branches still projects as active.
    //
    // When `resolved` is already the branch picked out above (typeless oneOf/anyOf
    // wrapper case), it has already been reduced against the real `data` at this
    // pointer; re-reducing it against `dataRecord ?? {}` here would be redundant (and,
    // for a branch with no dynamic keywords of its own, a no-op), so it is skipped.
    let reducedNode =
      resolved === original
        ? requiresReduction(resolved)
          ? original.allOf && hasReferencedAllOf(original)
            ? reduceAllOfForProjection(resolved, dataRecord ?? {}, scope)
            : resolved.reduceNode(dataRecord ?? {}, { path: [...scope] }).node
          : resolved
        : resolved
    if (reducedNode && resolved === original && (!member || data !== undefined)) {
      // Missing child data has no evaluated conditional branch to recover.
      reducedNode = resolveSelectedConditionalReference(
        original,
        reducedNode,
        dataRecord ?? {},
        scope,
        ctx.branchApplicability,
      )
    }
    if (
      reducedNode &&
      resolved === original &&
      !resolveExplicitType(originalSchema) &&
      (original.oneOf || original.anyOf)
    ) {
      reducedNode = resolveSelectedBranch(
        original,
        reducedNode,
        dataRecord ?? {},
        scope,
        ctx.branchApplicability,
      )
    }
    const reducedSchema = reducedNode?.schema as Record<string, unknown> | undefined
    const reducedProperties =
      (reducedSchema?.properties as Record<string, unknown> | undefined) ??
      (schema.properties as Record<string, unknown> | undefined) ??
      {}
    let candidateProps: ReadonlyMap<string, CandidateProperty> = collectCandidateProperties(original, dataRecord)
    const activeKeys = new Set([
      ...Object.keys(reducedProperties),
      ...additionalPropertyKeys(reducedNode, dataRecord),
    ])
    if (!reducedNode) {
      for (const [key, candidate] of candidateProps) {
        if (candidate.direct) activeKeys.add(key)
      }
    }
    const requiredSet = computeRequiredSet(resolved, reducedSchema, dataRecord)
    const dynamicApplicableNodes: SchemaNode[] = []
    if (ctx.cache.dynamicReferenceProjection) {
      eachApplicable([original], data, ctx.branchApplicability, (applicableNode) => {
        dynamicApplicableNodes.push(applicableNode)
        for (const key of Object.keys(applicableNode.properties ?? {})) activeKeys.add(key)
        for (const key of applicableNode.required ?? []) requiredSet.add(key)
      }, undefined, undefined, scope, true)
      const expandedCandidates = new Map(candidateProps)
      const activeCandidateNode = reducedNode ?? resolved
      if (activeCandidateNode !== original) {
        for (const [key, candidate] of collectCandidateProperties(activeCandidateNode, dataRecord)) {
          if (!expandedCandidates.has(key)) expandedCandidates.set(key, candidate)
        }
      }
      for (const applicableNode of dynamicApplicableNodes) {
        for (const [key, propertyNode] of Object.entries(applicableNode.properties ?? {})) {
          if (!expandedCandidates.has(key)) expandedCandidates.set(key, { direct: propertyNode, alternatives: [] })
        }
      }
      candidateProps = expandedCandidates
    }
    if (!reducedNode) {
      for (const key of unconditionalRequiredKeys(declaredAt.unconditional)) requiredSet.add(key)
    }

    // Two conditions, and they are not the same kind of condition.
    //
    // Exposure is load-bearing. Selection is local, but whether this node is
    // shown at all is its ancestors' to decide, and a subtree nothing exposes
    // must not select a branch off data it happens to retain: the compiler
    // collapses `required || provisionalRequired` into the one flag a binding
    // reads, so a hidden field would acquire a requirement.
    //
    // The evaluator having selected nothing is where provisional selection
    // exists to help, and that half is unobservable rather than wrong: a
    // resolved branch is fully valid, so it accepts every present discriminator
    // and the selector would return that same branch, whose keys are already
    // the active set. Kept because doing the work is pointless and the
    // condition states the intent.
    const provisionalBranch =
      nodeExposed && reducedNode === undefined
        ? selectProvisionalBranch(original, dataRecord)
        : undefined
    const provisionalSchema = provisionalBranch?.schema as Record<string, unknown> | undefined
    const provisionalKeys = new Set(
      Object.keys((provisionalSchema?.properties as Record<string, unknown> | undefined) ?? {}),
    )
    for (const key of additionalPropertyKeys(provisionalBranch, dataRecord)) provisionalKeys.add(key)
    const provisionalRequired = new Set(
      Array.isArray(provisionalSchema?.required) ? (provisionalSchema.required as string[]) : [],
    )

    // Candidates are collected from `original`, not `resolved`, so every oneOf/anyOf
    // branch's properties are represented (the matching branch alone, via `resolved`,
    // would only expose its own properties).
    const applicableRequired = applicableRequiredKeys(
      declaredAt.applicable,
      applicableData,
      scope,
      ctx.cache.dynamicReferenceProjection,
      ctx.branchApplicability,
    )
    const provisionalRequiredKeys = provisionalBranch
      ? applicableRequiredKeys(
          [provisionalBranch],
          applicableData,
          scope,
          ctx.cache.dynamicReferenceProjection,
          ctx.branchApplicability,
        )
      : new Set<string>()
    for (const key of candidateProps.keys()) {
      const present = dataRecord !== undefined && Object.hasOwn(dataRecord, key)
      if (
        (present || applicableRequired.has(key)) &&
        applicableAdditionalPropertySchemas(
          declaredAt.applicable,
          key,
          applicableData,
          scope,
          ctx.cache.dynamicReferenceProjection,
          ctx.branchApplicability,
        ).length > 0
      ) {
        activeKeys.add(key)
      }
    }
    if (provisionalBranch) {
      for (const key of candidateProps.keys()) {
        if (
          provisionalRequiredKeys.has(key) &&
          (applicableAdditionalPropertySchemas(
            declaredAt.applicable,
            key,
            applicableData,
            scope,
            ctx.cache.dynamicReferenceProjection,
            ctx.branchApplicability,
          ).length > 0 ||
            applicableAdditionalPropertySchemas(
              [provisionalBranch],
              key,
              applicableData,
              scope,
              ctx.cache.dynamicReferenceProjection,
              ctx.branchApplicability,
            ).length > 0)
        ) {
          provisionalKeys.add(key)
        }
      }
    }
    const propKeys = [...candidateProps.keys()]

    const children: ChildProjection[] | undefined =
      propKeys.length > 0
        ? propKeys.map((key) => {
            // Gated on the node applying at all. A branch that does not apply
            // demands nothing, so reporting its `required` array as a
            // requirement would attribute to the validator something it is not
            // asking for.
            const required = nodeActive && requiredSet.has(key)
            return {
              pointer: toPointer(`${pointer}/${escapeSegment(key)}`),
              key,
              required,
              provisionalRequired: !required && provisionalRequired.has(key) ? true : undefined,
            }
          })
        : undefined

    nodes.set(toPointer(pointer), {
      type,
      format: typeof schema.format === 'string' ? schema.format : undefined,
      constraints: extractConstraints(schema),
      children,
      enumValues: extractEnumValues(schema),
      active: nodeActive,
      provisional: nodeProvisional ? true : undefined,
      defaultConflict,
      annotations: extractAnnotations(schema, conflictedDefault, defaultOverride),
      ...(defaultSources !== undefined ? { defaultSources } : {}),
    })

    for (const [index, key] of propKeys.entries()) {
      const childPointer = `${pointer}/${escapeSegment(key)}`
      const childActive = nodeActive && activeKeys.has(key)
      // A descendant inherits exposure, not activity: under a provisionally
      // selected ancestor its own locally applicable properties are
      // provisional too, while a locally inactive one stays inactive.
      const childProvisional =
        !childActive && nodeExposed && (activeKeys.has(key) || provisionalKeys.has(key))
      const reducedChildNode = memberSchema(reducedNode, key)
      // Precedence matters as much as the selection does. Marking the right
      // branch provisional while taking its shape from `candidatePrototype`,
      // which is first-wins across branches, would render another branch's
      // widget and annotations under the selected branch's name, and would hand
      // ADR-003's pass another branch's `default`.
      const provisionalChildNode = memberSchema(provisionalBranch, key)
      const candidate = candidateProps.get(key)!
      const childData = dataRecord !== undefined && Object.hasOwn(dataRecord, key) ? dataRecord[key] : undefined
      const sourceChildNode = reducedChildNode ?? candidate.direct ?? candidatePrototype(candidate)
      const sourceSchema = sourceChildNode.schema as Record<string, unknown>
      let scopedChildNode: SchemaNode | undefined
      let childScope = scope
      if (ctx.cache.dynamicReferenceProjection && childActive) {
        const nextScope: ValidationPath = [...scope]
        if (
          typeof sourceSchema.$dynamicAnchor === 'string' ||
          typeof sourceSchema.$id === 'string' ||
          sourceSchema.$recursiveAnchor === true
        ) {
          nextScope.push({ pointer: `#${childPointer}`, node: sourceChildNode })
        }
        const result = resolved.getNodeChild(key, dataRecord ?? {}, {
          pointer: `#${childPointer}`,
          path: nextScope,
        })
        if (!result.error && isSchemaNode(result.node)) {
          scopedChildNode = result.node
          if (nextScope[nextScope.length - 1]?.node !== scopedChildNode) {
            nextScope.push({ pointer: `#${childPointer}`, node: scopedChildNode })
          }
          childScope = nextScope
        }
      }
      let applicableChildNode = reducedChildNode
      let scopedApplicableChildNode = scopedChildNode
      const hasScopedReference =
        typeof sourceSchema.$dynamicRef === 'string' || typeof sourceSchema.$recursiveRef === 'string'
      for (const source of applicableAdditionalPropertySchemas(
        declaredAt.applicable,
        key,
        applicableData,
        scope,
        ctx.cache.dynamicReferenceProjection,
        ctx.branchApplicability,
      )) {
        const alreadyApplicable =
          applicableChildNode !== undefined && positionOf(applicableChildNode) === positionOf(source)
        const alreadyScoped =
          scopedApplicableChildNode !== undefined && positionOf(scopedApplicableChildNode) === positionOf(source)
        if (alreadyApplicable && (!scopedApplicableChildNode || alreadyScoped)) continue
        const reduced = reduceAdditionalPropertySchema(source, childData, scope)
        if (!alreadyApplicable) {
          applicableChildNode =
            applicableChildNode === undefined
              ? reduced
              : mergeNode(applicableChildNode, reduced) ?? applicableChildNode
        }
        if (scopedApplicableChildNode && !alreadyScoped) {
          scopedApplicableChildNode = mergeNode(scopedApplicableChildNode, reduced) ?? scopedApplicableChildNode
        }
      }
      // Applicable declarations retain their authored scope here. The parent
      // reducer merges `properties` across `allOf`, which can make an
      // `additionalProperties` schema in a separate branch appear inapplicable.
      // Failing that, use the reducer's child, then the selected branch, then a
      // stable placeholder from the candidate set.
      const childNode =
        (hasScopedReference ? scopedApplicableChildNode : undefined) ??
        applicableChildNode ??
        composeChild(candidate.direct, provisionalChildNode) ??
        candidatePrototype(candidate)
      let positions = childPositions(
        declaredAt,
        key,
        // This node's own data, not the child's: the branches being entered
        // are this location's, so they are decided by the instance here. The
        // child's own conditional edges are entered by the child's walk, with
        // the child's data. `applicableData` is the reducer's object stand-in
        // when this location has no object value yet.
        applicableData,
        childDeclaring(info, key),
        scope,
        ctx.cache.dynamicReferenceProjection,
        ctx.branchApplicability,
      )
      const dynamicChildDeclarations = dynamicApplicableNodes.flatMap((applicableNode) => {
        const dynamicChild = applicableNode.properties?.[key]
        return dynamicChild ? [dynamicChild] : []
      })
      positions = {
        ...positions,
        declaring: extendDeclaring(positions.declaring, dynamicChildDeclarations),
      }
      if (scopedChildNode && hasScopedReference && !positions.declaring.includes(scopedChildNode)) {
        positions = {
          ...positions,
          applicable: [...positions.applicable, scopedChildNode],
          declaring: [...positions.declaring, scopedChildNode],
        }
      }
      const enter = (): void =>
        walk(
          childNode,
          childPointer,
          childData,
          childActive,
          childProvisional,
          nodes,
          diagnostics,
          positions,
          ctx,
          true,
          selfLineage,
          [...path, index],
          childScope,
        )
      // Deferring the children the budget counts, by depth below the anchor, admits it breadth first.
      const counted = selfLineage && (recursive || budgeted(locationInfo(positions.declaring, ctx.cache)))
      if (counted) (ctx.queue[selfLineage.depth] ??= []).push({ path: [...path, index], enter })
      else enter()
    }
    return
  }

  const itemSchema = type === 'array' && resolved.items ? dereference(resolved.items).schema : undefined
  nodes.set(toPointer(pointer), {
    type,
    format: typeof schema.format === 'string' ? schema.format : undefined,
    constraints: extractConstraints(schema),
    children: undefined,
    enumValues: extractEnumValues(schema),
    active: nodeActive,
    provisional: nodeProvisional ? true : undefined,
    defaultConflict,
    annotations: extractAnnotations(schema, conflictedDefault, defaultOverride),
    ...(defaultSources !== undefined ? { defaultSources } : {}),
    // Deliberately not given the flag above. A conflict under `items` belongs
    // to the element locations, and each of those reports its own; this field
    // describes the item schema rather than being one of those locations, so
    // omitting its `default` would be an omission no pointer could report. It
    // is also the only annotation set nothing reads a `default` from, and the
    // only one the other adapter does not produce at all.
    itemAnnotations:
      typeof itemSchema === 'object' && itemSchema !== null
        ? extractAnnotations(itemSchema as Record<string, unknown>)
        : undefined,
  })

  if (type === 'array' && resolved.items && Array.isArray(data)) {
    const elementPositions = itemPositions(
      declaredAt,
      data,
      itemDeclaring(info),
      scope,
      ctx.cache.dynamicReferenceProjection,
      ctx.branchApplicability,
    )
    data.forEach((item, index) => {
      const enteredItem = ctx.cache.dynamicReferenceProjection
        ? enterDynamicScope(resolved.items!, scope)
        : { node: resolved.items!, path: scope }
      walk(
        enteredItem.node,
        `${pointer}/${index}`,
        item,
        nodeActive,
        nodeProvisional,
        nodes,
        diagnostics,
        elementPositions,
        ctx,
        false,
        undefined,
        [...path, index],
        enteredItem.path,
      )
    })
  }
}

/**
 * Maps a compiled json-schema-library root node to a SchemaProjection.
 * Called by adapter.project() on every data change.
 *
 * Object properties are walked statically from the schema, including both branches of
 * if/then/else, every dependentSchemas/dependencies branch, and every oneOf/anyOf branch
 * (so inactive branches are still present in the projection, per the inactive-node
 * contract), while array items are walked from `data` (an array's length is a data-time
 * fact, not a schema-time one). $ref is resolved transparently via node.resolveRef().
 */
export function buildProjection(
  root: SchemaNode,
  data: unknown,
  cache: ProjectionCache,
  limits: ProjectionLimits = DEFAULT_LIMITS,
  options: ProjectionOptions = {},
): SchemaProjection {
  const nodes = new Map<JsonPointer, NodeProjection>()
  const diagnostics: ProjectionDiagnostic[] = []
  const ctx: RecursionContext = {
    cache,
    branchApplicability: cache.memoizeUndefinedBranchResults ? new WeakMap() : undefined,
    limits,
    boundaries: new Map(),
    boundaryTargets: new Map(),
    expandedBoundaryTokens: options.expandedBoundaryTokens ?? new Set(),
    boundaryGeneration: options.boundaryGeneration ?? 0,
    removed: new Set(),
    flagged: new Set(),
    reserved: new Set(),
    queue: [],
    objectsUsed: 0,
    nodesUsed: 0,
  }
  walk(
    root,
    '',
    data,
    true,
    false,
    nodes,
    diagnostics,
    { unconditional: [root], applicable: [root], declaring: [root] },
    ctx,
    false,
    undefined,
    [],
    [{ pointer: '#', node: root }],
  )
  for (const level of ctx.queue) for (const { enter } of (level ?? []).sort((a, b) => walkOrder(a.path, b.path))) enter()
  for (const node of nodes.values()) {
    if (node.children?.some((child) => ctx.removed.has(child.pointer))) {
      ;(node as { children?: NodeProjection['children'] }).children = node.children.filter(
        (child) => !ctx.removed.has(child.pointer),
      )
    }
  }
  for (const pointer of ctx.flagged) {
    const node = nodes.get(toPointer(pointer))
    if (node) (node as { recursiveExpansion?: true }).recursiveExpansion = true
  }
  for (const [pointer, reasons] of ctx.boundaries) {
    const node = nodes.get(toPointer(pointer))
    if (node) {
      ;(node as { boundaries?: readonly ProjectionBoundary[] }).boundaries = (
        ['recursion', 'budget'] as const
      ).filter((reason) => reasons.has(reason))
      const targets = ctx.boundaryTargets.get(pointer)
      if (targets) {
        ;(node as { boundaryTargets?: readonly ProjectionBoundaryTarget[] }).boundaryTargets = [
          ...targets.values(),
        ]
      }
    }
  }
  return { nodes, diagnostics }
}

import type {
  NodeProjection,
  ChildProjection,
  AnnotationSet,
  JsonPointer,
  JsonSchemaType,
  FieldConstraints,
  EnumOption,
} from '@texaryn/core'
import { resolveJsonPointer, schemaFragment, escapeSegment } from './pointer-utils.js'
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

/**
 * Working node used while a projection is under construction. `type` starts
 * unresolved and is filled in by either the data-driven pass or this module's
 * static walk; a pointer whose type never resolves (no schema position ever
 * declares a `type` keyword) is dropped when the projection is finalized,
 * since the port's NodeProjection.type is not optional.
 */
export interface DraftNode {
  type?: JsonSchemaType
  format?: string
  constraints: FieldConstraints
  children?: ChildProjection[]
  enumValues?: EnumOption[]
  active: boolean
  /** Set by a provisionally selected branch; never set alongside `active`. */
  provisional?: boolean
  annotations: AnnotationSet
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

export function finalizeNodes(nodes: Map<string, DraftNode>): Map<JsonPointer, NodeProjection> {
  const result = new Map<JsonPointer, NodeProjection>()
  for (const [pointer, node] of nodes) {
    if (node.type === undefined) continue
    result.set(pointer as JsonPointer, {
      type: node.type,
      format: node.format,
      constraints: node.constraints,
      children: node.children,
      enumValues: node.enumValues,
      active: node.active,
      // Belt and braces: `provisional` is only ever set on the branch that runs
      // when `active` is false, so no walk can reach here with both, and
      // dropping the guard changes no observable behaviour.
      provisional: node.active ? undefined : node.provisional,
      annotations: node.annotations,
    })
  }
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
function applyStaticStructure(node: DraftNode, schema: Record<string, unknown>): void {
  const type = resolveType(schema)
  if (type !== undefined && node.type === undefined) node.type = type
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
): { pointer: string; schema: Record<string, unknown> } | undefined {
  const ref = schema.$ref
  if (typeof ref !== 'string' || !ref.startsWith('#')) return undefined
  const pointer = schemaFragment(ref)
  const target = resolveJsonPointer(rootSchema, pointer)
  if (!isRecord(target)) return undefined
  return { pointer, schema: target }
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

/**
 * Walks the raw schema document statically (no data evaluation) to backfill
 * declared-but-currently-unfilled fields: optional properties nobody has typed
 * into yet, and fields in an if/then/else/oneOf/anyOf/dependentSchemas branch
 * that is currently selected but fired no keyword of its own (an empty object
 * still needs to render its title/description before the user has entered
 * anything).
 *
 * Unlike the data-driven pass, this walk also follows local $ref (including
 * recursive $ref, bounded by the (schemaPointer, instancePointer) pair so the
 * same recursive $ref can still be walked once per instance depth) and
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
): void {
  if (!isRecord(schema)) return

  const ref = resolveRef(schema, rootSchema)
  if (ref) {
    // When data exists at this pointer, key on (schemaPointer, instancePointer) so
    // the same recursive $ref can be walked at each instance depth the data provides.
    // When data is undefined (past the instance boundary), key on schema pointer
    // alone: a recursive $ref is projected one level past the data boundary (so its
    // direct properties appear as unfilled fields), then stopped.
    const cycleKey = data === undefined || data === null
      ? ref.pointer
      : `${ref.pointer}@${pointer}`
    if (visited.has(cycleKey)) return
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
    )
    visited.delete(cycleKey)
    return
  }

  // When an inactive branch encounters a node the base or active branch already
  // created, skip structure and annotation writes entirely so the inactive
  // sibling's metadata (constraints, format, required) cannot leak into the
  // active node. Child traversal still continues so inactive-only sub-nodes
  // (fields unique to the unselected branch) are created for skeleton rendering.
  const existed = nodes.has(pointer)
  const node = ensureNode(nodes, pointer)
  // A provisionally selected branch is shown, so it writes structure and
  // annotations like an active one. The branch order below puts it ahead of any
  // inactive sibling, so the fill-gaps-only policy keeps those from
  // contaminating what it wrote.
  const exposed = active || provisional
  if (exposed || !existed) {
    applyStaticStructure(node, schema)
  } else if (node.type === undefined) {
    // Inactive branch on an existing node that lacks a type: fill only the
    // type gap so finalizeNodes keeps the node alive. Other structural fields
    // (constraints, format, enum) stay suppressed to prevent inactive-branch
    // metadata from contaminating an active node's structure.
    const type = resolveType(schema)
    if (type !== undefined) node.type = type
  }
  if (active) {
    node.active = true
    applyStaticAnnotations(node, schema)
  } else if (provisional) {
    node.provisional = true
    applyStaticAnnotations(node, schema)
  }

  if (isRecord(schema.properties)) {
    const required = new Set<string>(
      Array.isArray(schema.required) ? (schema.required as string[]) : [],
    )
    for (const [key, sub] of Object.entries(schema.properties)) {
      const escaped = escapeSegment(key)
      // Gated on the branch applying. A branch that does not apply demands
      // nothing, and a provisionally selected one demands it of the user
      // without the validator asking yet.
      addChild(
        nodes,
        pointer,
        key,
        active && required.has(key),
        escaped,
        active,
        provisional && required.has(key),
      )
      const childData = isRecord(data) ? data[key] : undefined
      staticWalk(
        sub,
        childData,
        `${pointer}/${escaped}`,
        `${schemaPointer}/properties/${escaped}`,
        active,
        provisional,
        isBranchActive,
        nodes,
        visited,
        rootSchema,
      )
    }
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
      )
    })
  }

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
      })
    }
    if (isRecord(schema.else)) {
      dynamicBranches.push({
        schema: schema.else,
        schemaPointer: `${schemaPointer}/else`,
        active: active && elseLocal,
        provisional: !active && provisional && elseLocal,
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
        active: active && branchLocal,
        provisional: !active && provisional && branchLocal,
      })
    })
  }

  if (isRecord(schema.dependentSchemas)) {
    for (const [key, branch] of Object.entries(schema.dependentSchemas)) {
      const keyPresent = isRecord(data) && key in data
      dynamicBranches.push({
        schema: branch,
        schemaPointer: `${schemaPointer}/dependentSchemas/${escapeSegment(key)}`,
        active: active && keyPresent,
        provisional: !(active && keyPresent) && provisional && keyPresent,
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
      })
    }
  }

  dynamicBranches.sort(
    (a, b) =>
      Number(b.active) - Number(a.active) || Number(b.provisional) - Number(a.provisional),
  )
  for (const db of dynamicBranches) {
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
    )
  }

  // A typeless wrapper (no base-level `type` keyword) whose only type comes from
  // dynamic branches (oneOf/anyOf) is inactive when no branch resolves and no data
  // is present. Typed objects with conditionals (if/then, dependentSchemas) stay
  // active: they are declared optional fields, and the Texaryn contract keeps
  // unfilled-but-reachable optional fields active.
  if (
    resolveType(schema) === undefined &&
    dynamicBranches.length > 0 &&
    (data === undefined || data === null) &&
    !dynamicBranches.some((db) => db.active || db.provisional)
  ) {
    node.active = false
  }

  // `items` is a single subschema in 2019-09+ (paired with `prefixItems` for the tuple
  // positions) but a positional tuple array in its own right in draft-07; both forms are
  // supported so a filled array's existing elements get the same optional-field backfill
  // an object's properties get.
  const prefixItems = Array.isArray(schema.prefixItems) ? schema.prefixItems : undefined
  const tupleItems = Array.isArray(schema.items) ? schema.items : undefined
  const singleItems = !tupleItems && schema.items !== undefined ? schema.items : undefined
  if ((singleItems !== undefined || prefixItems || tupleItems) && Array.isArray(data)) {
    const itemsKeyword = prefixItems ? 'prefixItems' : 'items'
    data.forEach((item: unknown, index: number) => {
      const itemSchema = prefixItems?.[index] ?? tupleItems?.[index] ?? singleItems
      const itemSchemaPointer =
        prefixItems || tupleItems
          ? `${schemaPointer}/${itemsKeyword}/${index}`
          : `${schemaPointer}/${itemsKeyword}`
      if (itemSchema !== undefined) {
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
        )
      }
    })
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
function selectProvisionalBranch(
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

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
): void {
  const node = ensureNode(nodes, pointer)
  node.children ??= []
  const existing = node.children.find((c) => c.key === key)
  if (!existing) {
    const seg = escaped ?? escapeSegment(key)
    node.children.push({ pointer: `${pointer}/${seg}` as JsonPointer, key, required })
  } else if (required) {
    existing.required = true
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
 * directly-declared keywords; never overwrites a value the data-driven pass already
 * set. Applied unconditionally, even for a branch the data does not currently select:
 * a declared field's shape is a fact about the schema, not about the current instance,
 * and every node the walk visits needs a resolved `type` to survive finalization (the
 * port's NodeProjection.type is not optional).
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
 * directly, since each branch is independently evaluated regardless of whether
 * the instance overall satisfies "exactly one"/"at least one".
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
    staticWalk(ref.schema, data, pointer, ref.pointer, active, isBranchActive, nodes, visited, rootSchema)
    visited.delete(cycleKey)
    return
  }

  const node = ensureNode(nodes, pointer)
  applyStaticStructure(node, schema)
  if (active) {
    node.active = true
    applyStaticAnnotations(node, schema)
  }

  if (isRecord(schema.properties)) {
    const required = new Set<string>(
      Array.isArray(schema.required) ? (schema.required as string[]) : [],
    )
    for (const [key, sub] of Object.entries(schema.properties)) {
      const escaped = escapeSegment(key)
      addChild(nodes, pointer, key, required.has(key), escaped)
      const childData = isRecord(data) ? data[key] : undefined
      staticWalk(
        sub,
        childData,
        `${pointer}/${escaped}`,
        `${schemaPointer}/properties/${escaped}`,
        active,
        isBranchActive,
        nodes,
        visited,
        rootSchema,
      )
    }
  }

  if (isRecord(schema.if) && (isRecord(schema.then) || isRecord(schema.else))) {
    const thenActive = active && isBranchActive(schemaPointer, pointer, '/then')
    const elseActive = active && isBranchActive(schemaPointer, pointer, '/else')
    if (isRecord(schema.then)) {
      staticWalk(
        schema.then,
        data,
        pointer,
        `${schemaPointer}/then`,
        thenActive,
        isBranchActive,
        nodes,
        visited,
        rootSchema,
      )
    }
    if (isRecord(schema.else)) {
      staticWalk(
        schema.else,
        data,
        pointer,
        `${schemaPointer}/else`,
        elseActive,
        isBranchActive,
        nodes,
        visited,
        rootSchema,
      )
    }
  }

  if (Array.isArray(schema.oneOf)) {
    schema.oneOf.forEach((branch: unknown, i: number) => {
      staticWalk(
        branch,
        data,
        pointer,
        `${schemaPointer}/oneOf/${i}`,
        active && isBranchActive(schemaPointer, pointer, `/oneOf/${i}`),
        isBranchActive,
        nodes,
        visited,
        rootSchema,
      )
    })
  }
  if (Array.isArray(schema.anyOf)) {
    schema.anyOf.forEach((branch: unknown, i: number) => {
      staticWalk(
        branch,
        data,
        pointer,
        `${schemaPointer}/anyOf/${i}`,
        active && isBranchActive(schemaPointer, pointer, `/anyOf/${i}`),
        isBranchActive,
        nodes,
        visited,
        rootSchema,
      )
    })
  }
  if (Array.isArray(schema.allOf)) {
    schema.allOf.forEach((branch: unknown, i: number) => {
      staticWalk(
        branch,
        data,
        pointer,
        `${schemaPointer}/allOf/${i}`,
        active,
        isBranchActive,
        nodes,
        visited,
        rootSchema,
      )
    })
  }
  if (isRecord(schema.dependentSchemas)) {
    for (const [key, branch] of Object.entries(schema.dependentSchemas)) {
      const keyPresent = isRecord(data) && key in data
      staticWalk(
        branch,
        data,
        pointer,
        `${schemaPointer}/dependentSchemas/${key}`,
        active && keyPresent,
        isBranchActive,
        nodes,
        visited,
        rootSchema,
      )
    }
  }
  // draft-07 schema-form `dependencies`: hyperjump keeps the raw document as authored
  // (unlike json-schema-library, it does not normalize this into dependentSchemas), so
  // draft-07 fixtures still carry the keyword under its original name here. The
  // property-list form (`dependencies: { key: ['a', 'b'] }`) only affects `required`
  // and has no sub-schema to walk, so only object-valued entries apply.
  if (isRecord(schema.dependencies)) {
    for (const [key, branch] of Object.entries(schema.dependencies)) {
      if (isRecord(branch)) {
        const keyPresent = isRecord(data) && key in data
        staticWalk(
          branch,
          data,
          pointer,
          `${schemaPointer}/dependencies/${key}`,
          active && keyPresent,
          isBranchActive,
          nodes,
          visited,
          rootSchema,
        )
      }
    }
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
          isBranchActive,
          nodes,
          visited,
          rootSchema,
        )
      }
    })
  }
}

import type { SchemaNode } from 'json-schema-library'
import type {
  SchemaProjection,
  NodeProjection,
  ChildProjection,
  AnnotationSet,
  JsonPointer,
  JsonSchemaType,
  FieldConstraints,
  EnumOption,
} from '@texaryn/core'

const VALID_TYPES = new Set<JsonSchemaType>([
  'string',
  'number',
  'integer',
  'boolean',
  'object',
  'array',
  'null',
])

function toPointer(value: string): JsonPointer {
  return value as JsonPointer
}

function escapeSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}

function resolveType(schema: Record<string, unknown>): JsonSchemaType | undefined {
  const type = schema.type
  if (Array.isArray(type)) {
    return type.find((t): t is JsonSchemaType => VALID_TYPES.has(t as JsonSchemaType))
  }
  if (typeof type === 'string' && VALID_TYPES.has(type as JsonSchemaType)) {
    return type as JsonSchemaType
  }
  return undefined
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

function extractAnnotations(schema: Record<string, unknown>): AnnotationSet {
  const annotations: AnnotationSet = {}
  if (typeof schema.title === 'string') annotations.title = schema.title
  if (typeof schema.description === 'string') annotations.description = schema.description
  if (typeof schema.readOnly === 'boolean') annotations.readOnly = schema.readOnly
  if (typeof schema.writeOnly === 'boolean') annotations.writeOnly = schema.writeOnly
  if (typeof schema.deprecated === 'boolean') annotations.deprecated = schema.deprecated
  if (Array.isArray(schema.examples)) annotations.examples = schema.examples
  if ('default' in schema) annotations.default = schema.default
  return annotations
}

function extractEnumValues(schema: Record<string, unknown>): EnumOption[] | undefined {
  if (!Array.isArray(schema.enum)) return undefined
  return schema.enum.map((value) => ({ value }))
}

/** Follows a $ref to the node it points at; returns the node unchanged otherwise. */
function dereference(node: SchemaNode): SchemaNode {
  return node.$ref ? node.resolveRef() : node
}

/**
 * Discovers every property key that could ever appear on this node, across every
 * conditional branch (if/then/else, dependentSchemas, oneOf, anyOf). draft-07
 * `dependencies` is normalized by json-schema-library into
 * `dependentSchemas`/`dependentRequired` at parse time, so it needs no separate
 * handling here.
 *
 * This is the "static" half of the inactive-node contract: a branch that is not
 * currently selected for the data still contributes its property pointers, just
 * with `active: false`.
 */
function collectCandidateProperties(node: SchemaNode): Record<string, SchemaNode> {
  const candidates: Record<string, SchemaNode> = {}
  const merge = (props: Record<string, SchemaNode> | undefined) => {
    if (!props) return
    for (const [key, propNode] of Object.entries(props)) {
      if (!(key in candidates)) candidates[key] = propNode
    }
  }
  merge(node.properties)
  merge(node.if?.properties)
  merge(node.then?.properties)
  merge(node.else?.properties)
  if (node.dependentSchemas) {
    for (const dependency of Object.values(node.dependentSchemas)) {
      if (dependency && typeof dependency === 'object') {
        merge((dependency as SchemaNode).properties)
      }
    }
  }
  for (const branch of node.allOf ?? []) merge(branch.properties)
  for (const branch of node.oneOf ?? []) merge(branch.properties)
  for (const branch of node.anyOf ?? []) merge(branch.properties)
  return candidates
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
  nodes: Map<JsonPointer, NodeProjection>,
): void {
  const original = dereference(node)
  const originalSchema = original.schema as Record<string, unknown>
  if (typeof originalSchema !== 'object' || originalSchema === null) return

  let resolved = original
  let schema = originalSchema
  let type = resolveType(schema)
  // Whether this node's own active branch could be determined. Stays true for every
  // node except a typeless oneOf/anyOf wrapper whose branch could not be resolved
  // (see below) — that node's own existence in the projection is itself provisional,
  // not just its children's.
  let branchResolved = true

  // A node whose own schema carries no `type` keyword, only `oneOf`/`anyOf` branches
  // (e.g. a property schema like `{ oneOf: [{ type: 'object', ... }, ...] }`), has no
  // type until its active branch is resolved against `data`. `original` is kept
  // separately so every branch's properties can still be collected below for the
  // inactive-node contract, even though only the matching branch's schema is used here.
  if (!type && (original.oneOf || original.anyOf)) {
    const { node: branchNode } = original.reduceNode(data)
    if (branchNode) {
      resolved = branchNode
      schema = branchNode.schema as Record<string, unknown>
      type = resolveType(schema)
    } else {
      // reduceNode() returned no node at all: this is oneOf's behavior when data
      // matches zero or multiple branches (anyOf instead returns a node with an
      // empty merged schema in that case, which resolveType() also fails to type,
      // but which does not reach this branch). This test suite's oneOf wrappers put
      // an object schema on every branch, so 'object' is a safe stand-in type here:
      // it lets this pointer and every candidate branch property still appear in the
      // projection, all `active: false`, per the inactive-node contract, instead of
      // silently dropping the whole subtree. A oneOf/anyOf wrapper whose branches are
      // primitives (not objects) is not handled by this fallback.
      type = 'object'
      branchResolved = false
    }
  }

  if (!type) return
  const nodeActive = active && branchResolved

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
    const reducedNode =
      resolved === original ? resolved.reduceNode(dataRecord ?? {}).node : resolved
    const reducedSchema = reducedNode?.schema as Record<string, unknown> | undefined
    const reducedProperties =
      (reducedSchema?.properties as Record<string, unknown> | undefined) ??
      (schema.properties as Record<string, unknown> | undefined) ??
      {}
    const activeKeys = new Set(Object.keys(reducedProperties))
    const requiredSet = computeRequiredSet(resolved, reducedSchema, dataRecord)

    // Candidates are collected from `original`, not `resolved`, so every oneOf/anyOf
    // branch's properties are represented (the matching branch alone, via `resolved`,
    // would only expose its own properties).
    const candidateProps = collectCandidateProperties(original)
    const propKeys = Object.keys(candidateProps)

    const children: ChildProjection[] | undefined =
      propKeys.length > 0
        ? propKeys.map((key) => ({
            pointer: toPointer(`${pointer}/${escapeSegment(key)}`),
            key,
            required: requiredSet.has(key),
          }))
        : undefined

    nodes.set(toPointer(pointer), {
      type,
      format: typeof schema.format === 'string' ? schema.format : undefined,
      constraints: extractConstraints(schema),
      children,
      enumValues: extractEnumValues(schema),
      active: nodeActive,
      annotations: extractAnnotations(schema),
    })

    for (const key of propKeys) {
      const childPointer = `${pointer}/${escapeSegment(key)}`
      const childActive = nodeActive && activeKeys.has(key)
      const reducedChildNode = reducedNode?.properties?.[key] as SchemaNode | undefined
      const childNode = reducedChildNode ?? candidateProps[key]
      walk(childNode, childPointer, dataRecord?.[key], childActive, nodes)
    }
    return
  }

  nodes.set(toPointer(pointer), {
    type,
    format: typeof schema.format === 'string' ? schema.format : undefined,
    constraints: extractConstraints(schema),
    children: undefined,
    enumValues: extractEnumValues(schema),
    active: nodeActive,
    annotations: extractAnnotations(schema),
  })

  if (type === 'array' && resolved.items && Array.isArray(data)) {
    data.forEach((item, index) => {
      walk(resolved.items!, `${pointer}/${index}`, item, nodeActive, nodes)
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
export function buildProjection(root: SchemaNode, data: unknown): SchemaProjection {
  const nodes = new Map<JsonPointer, NodeProjection>()
  walk(root, '', data, true, nodes)
  return { nodes }
}

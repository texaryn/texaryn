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
 * Walks the compiled schema statically (via node.properties/node.items), only
 * descending into array items that are actually present in the data, and
 * collects one NodeProjection per JsonPointer into `nodes`.
 *
 * Static (not data-driven) traversal is required for object properties so
 * that fields absent from the current data instance (e.g. an untouched
 * optional field) still produce a NodeProjection a form can render.
 */
function walk(
  node: SchemaNode,
  pointer: string,
  data: unknown,
  nodes: Map<JsonPointer, NodeProjection>,
): void {
  const resolved = dereference(node)
  const schema = resolved.schema as Record<string, unknown>
  if (typeof schema !== 'object' || schema === null) return

  const type = resolveType(schema)
  if (!type) return

  const children: ChildProjection[] | undefined =
    type === 'object' && resolved.properties
      ? Object.keys(resolved.properties).map((key) => ({
          pointer: toPointer(`${pointer}/${escapeSegment(key)}`),
          key,
          required: (resolved.required ?? []).includes(key),
        }))
      : undefined

  nodes.set(toPointer(pointer), {
    type,
    format: typeof schema.format === 'string' ? schema.format : undefined,
    constraints: extractConstraints(schema),
    children,
    enumValues: extractEnumValues(schema),
    active: true,
    annotations: extractAnnotations(schema),
  })

  if (type === 'object' && resolved.properties) {
    const dataRecord =
      typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : undefined
    for (const [key, childNode] of Object.entries(resolved.properties)) {
      const childPointer = `${pointer}/${escapeSegment(key)}`
      walk(childNode, childPointer, dataRecord?.[key], nodes)
    }
  } else if (type === 'array' && resolved.items && Array.isArray(data)) {
    data.forEach((item, index) => {
      walk(resolved.items!, `${pointer}/${index}`, item, nodes)
    })
  }
}

/**
 * Maps a compiled json-schema-library root node to a SchemaProjection.
 * Called by adapter.project() on every data change.
 *
 * Object properties are walked statically from the schema (so fields absent
 * from `data` still project), while array items are walked from `data` (an
 * array's length is a data-time fact, not a schema-time one). $ref is
 * resolved transparently via node.resolveRef(). All nodes are active: true;
 * conditional (if/then/else) and oneOf/anyOf branch selection are out of
 * scope for this adapter (see PR9/PR10).
 */
export function buildProjection(root: SchemaNode, data: unknown): SchemaProjection {
  const nodes = new Map<JsonPointer, NodeProjection>()
  walk(root, '', data, nodes)
  return { nodes }
}

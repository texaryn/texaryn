import type { JsonObject } from '../backstage/extract-schema.js'

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Adds the `type` keyword that `@texaryn/schema-json` requires and Backstage
 * templates do not write.
 *
 * The adapter projects no node at all for a schema node without an explicit
 * `type`, at any depth. `type` is not required by JSON Schema, so no Backstage
 * step declares it, and without this pass every step throws
 * "Schema projection missing root node" and every untyped nested object is
 * dropped from the form in silence. See friction log entry 2.
 *
 * The inference is the narrowest one that makes real templates work:
 * `properties` means object, `items` means array. It does not guess from
 * `enum`, `const` or `format`, because a wrong guess would put a field in the
 * form under the wrong widget, which is harder to notice than a missing one.
 *
 * Applied only to the Texaryn side. RJSF needs no equivalent, and doing it for
 * both would hide the difference this exercise exists to measure.
 */
export function inferTypes<T>(schema: T): T {
  return walk(structuredClone(schema)) as T
}

function walk(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(walk)
  if (!isObject(node)) return node

  if (!('type' in node)) {
    if (isObject(node.properties)) node.type = 'object'
    else if (isObject(node.items) || Array.isArray(node.items)) node.type = 'array'
  }

  for (const key of Object.keys(node)) node[key] = walk(node[key])
  return node
}

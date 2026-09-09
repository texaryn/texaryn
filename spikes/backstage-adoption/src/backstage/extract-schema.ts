export type JsonObject = Record<string, unknown>

/** RJSF's uiSchema: a tree mirroring the schema's shape, holding the `ui:*` keys. */
export type UiSchema = JsonObject

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Splits a Backstage parameter step into the schema and uiSchema that RJSF
 * needs, because Backstage templates write `ui:*` keys inline among the schema
 * keywords and RJSF takes them as a separate prop.
 *
 * A port of `extractSchemaFromStep` from
 * `plugins/scaffolder-react/src/next/lib/schema.ts`, rather than an import:
 * `@backstage/plugin-scaffolder-react` brings Material UI v4 and React 17
 * peers, which cannot coexist with React 19 here. The traversal is kept
 * identical, `ui:` prefix and all, including which composition keywords it
 * descends into: `properties`, `items`, `anyOf`, `oneOf`, `allOf`,
 * `dependencies`, `then` and `else`.
 *
 * This runs for both sides of the comparison. Separating the presentation keys
 * from the schema is Backstage's own preprocessing step and not something
 * either form library is charged with.
 */
export function extractSchemaFromStep(inputStep: JsonObject): {
  schema: JsonObject
  uiSchema: UiSchema
} {
  const uiSchema: UiSchema = {}
  // Upstream round-trips through `flatted` to tolerate cycles. A step parsed
  // from one YAML document has none, so a structured clone is equivalent here
  // and would throw rather than silently differ if that stopped being true.
  const schema = structuredClone(inputStep)
  extractUiSchema(schema, uiSchema)
  return { schema, uiSchema }
}

function extractUiSchema(schema: JsonObject, uiSchema: JsonObject): void {
  if (!isObject(schema)) return

  const { properties, items, anyOf, oneOf, allOf, dependencies, then, else: otherwise } = schema

  for (const propName of Object.keys(schema)) {
    if (propName.startsWith('ui:')) {
      uiSchema[propName] = schema[propName]
      delete schema[propName]
    }
  }

  if (isObject(properties)) {
    for (const propName of Object.keys(properties)) {
      const node = properties[propName]
      if (!isObject(node)) continue
      if (!isObject(uiSchema[propName])) uiSchema[propName] = {}
      extractUiSchema(node, uiSchema[propName] as JsonObject)
    }
  }

  if (isObject(items)) {
    const inner: JsonObject = {}
    uiSchema.items = inner
    extractUiSchema(items, inner)
  }

  // Composition branches contribute to the same uiSchema level, which is why
  // one array item's hints cannot be told apart from another's downstream.
  for (const branch of [anyOf, oneOf, allOf]) {
    if (!Array.isArray(branch)) continue
    for (const node of branch) {
      if (isObject(node)) extractUiSchema(node, uiSchema)
    }
  }

  if (isObject(dependencies)) {
    for (const depName of Object.keys(dependencies)) {
      const node = dependencies[depName]
      if (isObject(node)) extractUiSchema(node, uiSchema)
    }
  }

  if (isObject(then)) extractUiSchema(then, uiSchema)
  if (isObject(otherwise)) extractUiSchema(otherwise, uiSchema)
}

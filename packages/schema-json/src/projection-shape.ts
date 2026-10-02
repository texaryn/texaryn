import type { JsonPointer, JsonSchemaType, ProjectionDiagnostic } from '@texaryn/core'

// Every family takes part in detecting a conflict, but only `object` and `array` are ever inferred:
// a wrong scalar guess selects the wrong widget. `format` is absent because it describes string contents.
const KEYWORD_FAMILIES = {
  object: [
    'properties',
    'patternProperties',
    'additionalProperties',
    'propertyNames',
    'required',
    'minProperties',
    'maxProperties',
    'dependentSchemas',
    'dependentRequired',
    'dependencies',
    'unevaluatedProperties',
  ],
  array: [
    'items',
    'prefixItems',
    'additionalItems',
    'contains',
    'minItems',
    'maxItems',
    'uniqueItems',
    'minContains',
    'maxContains',
    'unevaluatedItems',
  ],
  string: ['minLength', 'maxLength', 'pattern'],
  number: ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'],
} as const satisfies Record<string, readonly string[]>

export type KeywordFamily = keyof typeof KEYWORD_FAMILIES

export type ProjectionShape =
  | { kind: 'resolved'; type: JsonSchemaType }
  | { kind: 'ambiguous'; families: KeywordFamily[] }
  | { kind: 'none' }

export function projectionTypeFamilies(schema: Record<string, unknown>): Set<KeywordFamily> {
  const families = new Set<KeywordFamily>()
  for (const [family, keywords] of Object.entries(KEYWORD_FAMILIES)) {
    if (keywords.some((keyword) => schema[keyword] !== undefined)) {
      families.add(family as KeywordFamily)
    }
  }
  return families
}

export function shapeOfFamilies(families: ReadonlySet<KeywordFamily>): ProjectionShape {
  if (families.size > 1) return { kind: 'ambiguous', families: [...families].sort() }

  if (families.size === 1) {
    const [family] = families
    if (family === 'object' || family === 'array') return { kind: 'resolved', type: family }
  }
  return { kind: 'none' }
}

export function inferProjectionShape(schema: Record<string, unknown>): ProjectionShape {
  return shapeOfFamilies(projectionTypeFamilies(schema))
}

export function shapeDiagnostic(
  pointer: JsonPointer,
  shape: Exclude<ProjectionShape, { kind: 'resolved' }>,
  enumDeclared: boolean,
): ProjectionDiagnostic {
  if (shape.kind === 'ambiguous') {
    return {
      pointer,
      code: 'ambiguous-projection-shape',
      message:
        `No explicit "type", and keywords from more than one type apply ` +
        `(${shape.families.join(', ')}), so the shape to render is undecidable. ` +
        `Declare "type" on this schema to resolve it.`,
    }
  }
  return {
    pointer,
    code: 'unresolved-projection-shape',
    message:
      `No explicit "type", and no keyword that implies one, so there is no ` +
      `shape to render. Declare "type" on this schema.` +
      (enumDeclared
        ? ` An "enum" alone does not imply a type, because its members may be of different types.`
        : ''),
  }
}

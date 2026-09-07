import { getCapability } from './capabilities.js'
import type { CapabilityId, Dialect } from './capabilities.js'

/**
 * The form-projection support matrix, as data rather than a handwritten table.
 *
 * The published guide renders this, so a keyword cannot be documented as
 * supported without a capability declaring it: rows reference capability ids,
 * which TypeScript checks, and the keywords come from the capabilities
 * themselves. That removes the human diff between the guide and the manifest.
 *
 * Only positive form-projection claims belong here. Explanatory prose and the
 * projection's limitations stay handwritten in the guide, because neither is
 * well represented as a capability record.
 *
 * Validation behaviour is deliberately absent. `const`, `not`, `contains` and
 * the rest are delegated to json-schema-library rather than being independent
 * Texaryn guarantees, so they belong in a validation-conformance report, not
 * in a claim about what the form projection supports.
 */
export interface SupportRow {
  /** Row label in the published table. */
  title: string
  capabilities: readonly CapabilityId[]
  /** What the projection does with them, in the guide's own voice. */
  formBehavior: string
}

export const dialects: readonly Dialect[] = ['draft-07', '2019-09', '2020-12']

export const formProjectionSupport: readonly SupportRow[] = [
  {
    title: 'Objects and fields',
    capabilities: ['schema.type.object', 'schema.object.nested', 'schema.field.required'],
    formBehavior: 'Declared properties appear even before data is entered.',
  },
  {
    title: 'Local references',
    capabilities: ['schema.reference.local-ref', 'schema.reference.reused-fragment'],
    formBehavior: 'Referenced field schemas are resolved locally.',
  },
  {
    title: 'Composition',
    capabilities: [
      'schema.composition.allOf',
      'schema.composition.anyOf',
      'schema.composition.oneOf',
    ],
    formBehavior:
      '`allOf` contributes all branches; `anyOf`/`oneOf` selection depends on current data.',
  },
  {
    title: 'Conditionals',
    capabilities: ['schema.conditional.if-then-else'],
    formBehavior: 'Inactive branch fields remain in the projection with `active: false`.',
  },
  {
    title: 'Dependencies',
    capabilities: [
      'schema.dependency.draft07-dependencies',
      'schema.dependency.dependentSchemas',
      'schema.dependency.dependentRequired',
    ],
    formBehavior: 'Present trigger properties activate dependent fields or required flags.',
  },
  {
    title: 'Homogeneous arrays',
    capabilities: ['schema.type.array', 'schema.array.of-objects'],
    formBehavior: 'Item fields are projected for entries present in the data.',
  },
  {
    title: 'Choices',
    capabilities: ['schema.enum.string'],
    formBehavior: 'Enum values become options for the renderer.',
  },
  {
    title: 'String constraints',
    capabilities: [
      'schema.constraint.minLength',
      'schema.constraint.maxLength',
      'schema.constraint.pattern',
    ],
    formBehavior: 'Constraints are exposed to widgets.',
  },
  {
    title: 'Numeric constraints',
    capabilities: [
      'schema.constraint.minimum',
      'schema.constraint.maximum',
      'schema.constraint.exclusiveMinimum',
      'schema.constraint.exclusiveMaximum',
      'schema.constraint.multipleOf',
    ],
    formBehavior: 'Constraints are exposed to widgets.',
  },
  {
    title: 'Array constraints',
    capabilities: [
      'schema.constraint.minItems',
      'schema.constraint.maxItems',
      'schema.constraint.uniqueItems',
    ],
    formBehavior: 'Constraints are exposed in the projection.',
  },
  {
    title: 'Field annotations',
    capabilities: [
      'schema.annotation.title',
      'schema.annotation.description',
      'schema.annotation.default',
      'schema.annotation.examples',
      'schema.annotation.readOnly',
      'schema.annotation.writeOnly',
      'schema.annotation.format',
      'schema.annotation.deprecated',
    ],
    formBehavior:
      'Annotations are passed to the runtime and widgets; none of them guarantees a dedicated control, and `default` is not applied to the data.',
  },
]

/**
 * The keywords a row claims for one dialect, or an empty list when the
 * capability does not exist in that dialect at all.
 */
export function rowKeywords(row: SupportRow, dialect: Dialect): readonly string[] {
  const seen = new Set<string>()
  for (const id of row.capabilities) {
    const capability = getCapability(id)
    if (capability.dialects && !capability.dialects.includes(dialect)) continue
    const keywords = capability.keywordsByDialect?.[dialect] ?? capability.keywords ?? []
    for (const keyword of keywords) seen.add(keyword)
  }
  return [...seen]
}

/** Every capability the published matrix claims, for the coverage check. */
export function matrixCapabilityIds(): readonly CapabilityId[] {
  return formProjectionSupport.flatMap((row) => row.capabilities)
}

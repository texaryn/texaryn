// The capability manifest is the single source of truth for what Texaryn
// claims and demonstrates. `CapabilityId` derives from it, so an example
// covering an identifier that is not declared here fails to compile rather
// than failing a string comparison at test time.
//
// Absence means not yet catalogued, never unsupported. The schema adapter
// already handles more than this declares, and entries arrive with the
// examples that demonstrate them, because declaring a capability with no
// example fails the build. Read it as a floor, not a ceiling.
//
// Identifiers are `domain.category.capability`, with further segments where
// they help, and JSON Schema keywords keep their official casing. Everything
// is namespaced: a flat `string` would eventually collide with some other
// notion of string support.
//
// Only public Texaryn capabilities belong here. How a particular renderer
// implements one is renderer conformance, not a product capability, so
// `accessibility.required` belongs and `mui-select-aria-required` does not.

export type CapabilityCategory =
  | 'schema'
  | 'runtime'
  | 'validation'
  | 'ui-hint'
  | 'accessibility'

export type CapabilityStatus = 'supported' | 'partial' | 'experimental'

export type Dialect = 'draft-07' | '2019-09' | '2020-12'

export interface CapabilityDefinition {
  title: string
  category: CapabilityCategory
  status: CapabilityStatus
  /** Only when the capability's semantics differ per dialect. */
  dialects?: readonly Dialect[]
  /**
   * Supported capabilities require an example by default. Opting out is
   * deliberate and has to say why, so whole categories cannot drift out of
   * coverage silently.
   */
  exampleRequired?: false
  exampleExemptionReason?: string
}

export const capabilities = {
  'schema.type.string': {
    title: 'String fields',
    category: 'schema',
    status: 'supported',
  },
  'schema.type.number': {
    title: 'Number fields',
    category: 'schema',
    status: 'supported',
  },
  'schema.type.integer': {
    title: 'Integer fields',
    category: 'schema',
    status: 'supported',
  },
  'schema.type.boolean': {
    title: 'Boolean fields',
    category: 'schema',
    status: 'supported',
  },
  'schema.type.object': {
    title: 'Object types',
    category: 'schema',
    status: 'supported',
  },
  'schema.type.array': {
    title: 'Array types',
    category: 'schema',
    status: 'supported',
  },
  'schema.object.nested': {
    title: 'Nested objects',
    category: 'schema',
    status: 'supported',
  },
  'schema.array.of-objects': {
    title: 'Arrays of objects',
    category: 'schema',
    status: 'supported',
  },
  'schema.enum.string': {
    title: 'String enums',
    category: 'schema',
    status: 'supported',
  },
  'schema.field.required': {
    title: 'Required and optional fields',
    category: 'schema',
    status: 'supported',
  },

  'schema.constraint.minLength': {
    title: 'minLength',
    category: 'schema',
    status: 'supported',
  },
  'schema.constraint.maxLength': {
    title: 'maxLength',
    category: 'schema',
    status: 'supported',
  },
  'schema.constraint.pattern': {
    title: 'pattern',
    category: 'schema',
    status: 'supported',
  },
  'schema.constraint.minimum': {
    title: 'minimum',
    category: 'schema',
    status: 'supported',
  },
  'schema.constraint.maximum': {
    title: 'maximum',
    category: 'schema',
    status: 'supported',
  },
  'schema.constraint.minItems': {
    title: 'minItems',
    category: 'schema',
    status: 'supported',
  },
  'schema.constraint.maxItems': {
    title: 'maxItems',
    category: 'schema',
    status: 'supported',
  },
  'schema.constraint.uniqueItems': {
    title: 'uniqueItems',
    category: 'schema',
    status: 'supported',
  },

  'schema.reference.local-ref': {
    title: 'Local $ref',
    category: 'schema',
    status: 'supported',
  },
  'schema.reference.reused-fragment': {
    title: 'A $defs fragment reused by several properties',
    category: 'schema',
    status: 'supported',
  },

  'schema.conditional.if-then-else': {
    title: 'if / then / else',
    category: 'schema',
    status: 'supported',
  },

  'schema.composition.oneOf': {
    title: 'oneOf',
    category: 'schema',
    status: 'supported',
  },
  'schema.composition.anyOf': {
    title: 'anyOf',
    category: 'schema',
    status: 'supported',
  },

  'schema.dependency.dependentSchemas': {
    title: 'dependentSchemas',
    category: 'schema',
    status: 'supported',
    dialects: ['2019-09', '2020-12'],
  },
  'schema.dependency.dependentRequired': {
    title: 'dependentRequired',
    category: 'schema',
    status: 'supported',
    dialects: ['2019-09', '2020-12'],
  },
  'schema.dependency.draft07-dependencies': {
    title: 'Draft 7 dependencies',
    category: 'schema',
    status: 'supported',
    dialects: ['draft-07'],
  },

  'schema.dialect.draft-07': {
    title: 'Draft 7',
    category: 'schema',
    status: 'supported',
    dialects: ['draft-07'],
  },
  'schema.dialect.2019-09': {
    title: '2019-09',
    category: 'schema',
    status: 'supported',
    dialects: ['2019-09'],
  },
  'schema.dialect.2020-12': {
    title: '2020-12',
    category: 'schema',
    status: 'supported',
    dialects: ['2020-12'],
  },
} as const satisfies Record<string, CapabilityDefinition>

export type CapabilityId = keyof typeof capabilities

export const capabilityIds = Object.keys(capabilities) as CapabilityId[]

export function isCapabilityId(value: string): value is CapabilityId {
  return Object.prototype.hasOwnProperty.call(capabilities, value)
}

// `as const` narrows each entry to its literal shape, which drops the optional
// fields from the inferred type. Read definitions through here so callers see
// the whole contract rather than one entry's literal type.
export function getCapability(id: CapabilityId): CapabilityDefinition {
  return capabilities[id]
}

export function requiresExample(id: CapabilityId): boolean {
  const capability = getCapability(id)
  return capability.status === 'supported' && capability.exampleRequired !== false
}

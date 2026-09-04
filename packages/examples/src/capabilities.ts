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

/**
 * Which layer the semantic proof belongs to. This says where a capability is
 * proven correct, not which suite proves it: naming a suite would couple the
 * public catalog to test architecture, and the layer is the stable fact.
 *
 * Every capability still requires a data-only example. Example coverage
 * answers "can someone select this in the docs or playground", which is a
 * different question from "is it implemented correctly", and conflating the
 * two would let a renderer concern leak into a renderer-neutral package.
 */
export type VerificationLayer = 'projection' | 'runtime' | 'renderer'

export type Dialect = 'draft-07' | '2019-09' | '2020-12'

export interface CapabilityDefinition {
  title: string
  category: CapabilityCategory
  status: CapabilityStatus
  /** Where the semantic proof lives. See {@link VerificationLayer}. */
  verification: VerificationLayer
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
    verification: 'projection',
  },
  'schema.type.number': {
    title: 'Number fields',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
  },
  'schema.type.integer': {
    title: 'Integer fields',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
  },
  'schema.type.boolean': {
    title: 'Boolean fields',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
  },
  'schema.type.object': {
    title: 'Object types',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
  },
  'schema.type.array': {
    title: 'Array types',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
  },
  'schema.object.nested': {
    title: 'Nested objects',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
  },
  'schema.array.of-objects': {
    title: 'Arrays of objects',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
  },
  'schema.enum.string': {
    title: 'String enums',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
  },
  'schema.field.required': {
    title: 'Required and optional fields',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
  },

  'schema.constraint.minLength': {
    title: 'minLength',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
  },
  'schema.constraint.maxLength': {
    title: 'maxLength',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
  },
  'schema.constraint.pattern': {
    title: 'pattern',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
  },
  'schema.constraint.minimum': {
    title: 'minimum',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
  },
  'schema.constraint.maximum': {
    title: 'maximum',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
  },
  'schema.constraint.minItems': {
    title: 'minItems',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
  },
  'schema.constraint.maxItems': {
    title: 'maxItems',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
  },
  'schema.constraint.uniqueItems': {
    title: 'uniqueItems',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
  },

  'schema.reference.local-ref': {
    title: 'Local $ref',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
  },
  'schema.reference.reused-fragment': {
    title: 'A $defs fragment reused by several properties',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
  },

  'schema.conditional.if-then-else': {
    title: 'if / then / else',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
  },

  'schema.composition.oneOf': {
    title: 'oneOf',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
  },
  'schema.composition.anyOf': {
    title: 'anyOf',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
  },

  'schema.dependency.dependentSchemas': {
    title: 'dependentSchemas',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
    dialects: ['2019-09', '2020-12'],
  },
  'schema.dependency.dependentRequired': {
    title: 'dependentRequired',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
    dialects: ['2019-09', '2020-12'],
  },
  'schema.dependency.draft07-dependencies': {
    title: 'Draft 7 dependencies',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
    dialects: ['draft-07'],
  },

  'schema.dialect.draft-07': {
    title: 'Draft 7',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
    dialects: ['draft-07'],
  },
  'schema.dialect.2019-09': {
    title: '2019-09',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
    dialects: ['2019-09'],
  },
  'schema.dialect.2020-12': {
    title: '2020-12',
    category: 'schema',
    status: 'supported',
    verification: 'projection',
    dialects: ['2020-12'],
  },

  'ui-hint.widget': {
    title: 'Widget selection',
    category: 'ui-hint',
    status: 'supported',
    verification: 'projection',
  },
  'ui-hint.placeholder': {
    title: 'Placeholder',
    category: 'ui-hint',
    status: 'supported',
    verification: 'projection',
  },
  'ui-hint.helpText': {
    title: 'Help text',
    category: 'ui-hint',
    status: 'supported',
    verification: 'projection',
  },
  // `order`, `colSpan` and `hidden` are declared in the hint contract but no
  // compiler or renderer reads them, so they are deliberately absent here
  // rather than declared and left unproven.
  'ui-hint.array.canReorder': {
    title: 'Array reordering',
    category: 'ui-hint',
    status: 'supported',
    verification: 'projection',
  },
  'ui-hint.array.itemKey': {
    title: 'Array item key',
    category: 'ui-hint',
    status: 'supported',
    verification: 'runtime',
  },

  'validation.trigger.change': {
    title: 'Validate on change',
    category: 'validation',
    status: 'supported',
    verification: 'runtime',
  },
  'validation.trigger.blur': {
    title: 'Validate on blur',
    category: 'validation',
    status: 'supported',
    verification: 'runtime',
  },
  'validation.trigger.submit': {
    title: 'Validate on submit',
    category: 'validation',
    status: 'supported',
    verification: 'runtime',
  },

  'runtime.array.add': {
    title: 'Add an array item',
    category: 'runtime',
    status: 'supported',
    verification: 'runtime',
  },
  'runtime.array.remove': {
    title: 'Remove an array item',
    category: 'runtime',
    status: 'supported',
    verification: 'runtime',
  },
  // Partial on purpose. The command handler reconciles identity in
  // `state.identities`, but the compiler rebuilds `arrayMeta.itemIds` from a
  // fresh context on every compile, so what the document exposes is
  // positional and the reconciled identity never reaches a renderer. Promote
  // this to supported once the document carries the reconciled ids.
  'runtime.array.stable-identity': {
    title: 'Stable array item identity',
    category: 'runtime',
    status: 'partial',
    verification: 'runtime',
  },

  'runtime.binding.numeric-coercion': {
    title: 'Numeric coercion',
    category: 'runtime',
    status: 'supported',
    verification: 'runtime',
  },
  'runtime.binding.enum-value-preservation': {
    title: 'Enum value preservation',
    category: 'runtime',
    status: 'supported',
    verification: 'runtime',
  },

  'runtime.submission.lifecycle': {
    title: 'Submission lifecycle',
    category: 'runtime',
    status: 'supported',
    verification: 'runtime',
  },

  'accessibility.required': {
    title: 'Required field semantics',
    category: 'accessibility',
    status: 'supported',
    verification: 'renderer',
  },
  'accessibility.description': {
    title: 'Field description association',
    category: 'accessibility',
    status: 'supported',
    verification: 'renderer',
  },
  'accessibility.error-association': {
    title: 'Error association',
    category: 'accessibility',
    status: 'supported',
    verification: 'renderer',
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

import type { JsonPointer, UIHints } from '@texaryn/core'
import type { CapabilityId, Dialect } from './capabilities.js'

/**
 * `JsonPointer` is a branded string with no exported constructor, so building
 * one needs an assertion. Keeping it in a single named place documents the
 * intent and stops the cast spreading through the example files.
 */
export function pointer(value: string): JsonPointer {
  return value as JsonPointer
}

export type ExampleCategory =
  | 'basics'
  | 'objects'
  | 'arrays'
  | 'validation'
  | 'composition'
  | 'references'
  | 'dependencies'
  | 'ui-hints'
  | 'accessibility'
  | 'dialects'
  | 'real-world'

// Data only, never renderer UI, so the same example drives the playground,
// the documentation and the tests without being rewritten for each.
export interface TexarynExample {
  id: string
  title: string
  description: string
  category: ExampleCategory

  schema: unknown
  initialData?: unknown
  hints?: UIHints

  /** Defaults to 2020-12 where a specific dialect does not matter. */
  dialect?: Dialect

  /**
   * Set when the example deliberately starts in a state its own schema
   * rejects, which is how a validation or error-presentation example shows
   * anything at all. Tests then require the errors to be there, rather than
   * merely tolerating them, so an accidental violation is still caught.
   */
  startsInvalid?: true

  covers: readonly CapabilityId[]
}

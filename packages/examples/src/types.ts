import type { UIHints } from '@texaryn/core'
import type { CapabilityId, Dialect } from './capabilities.js'

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

  covers: readonly CapabilityId[]
}

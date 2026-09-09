/**
 * The three things the comparison looks at, and nothing else. Markup is not
 * compared: these are what the scaffolder backend receives and what the person
 * filling the form can see.
 */
export interface StepObservables {
  /** JSON pointers of the fields with an input in the DOM, sorted. */
  fields: string[]
  /** Whether the step's schema accepts the data, which is what gates the step. */
  valid: boolean
  /** `pointer:keyword` for each violation, sorted. */
  errors: string[]
  /** Whether pressing submit produced a submission. */
  submitted: boolean
  /** What submission handed over, or null if there was none. */
  payload: unknown
}

export interface RawError {
  pointer: string
  keyword: string
}

/**
 * Canonicalises a violation to `pointer:keyword`.
 *
 * Both validators already attribute `required` to the absent property rather
 * than to its parent, measured rather than assumed: for `{ required: ['name'] }`
 * with no `name`, RJSF reports `property: "name"` and Texaryn reports
 * `instancePointer: "/name"`. An earlier version of this appended
 * `params.missingProperty` and produced `/name/name` on the RJSF side, which
 * was a defect in this harness and not a difference between the two.
 */
export function canonicalError({ pointer, keyword }: RawError): string {
  return `${pointer || '/'}:${keyword}`
}

/**
 * RJSF reports a location as a dotted path, and inconsistently: `".website"`
 * for a `format` violation but `"name"` for a `required` one, with no leading
 * separator on the second. Both become a JSON pointer here.
 */
export function pointerFromRjsfProperty(property: string): string {
  const path = property.replace(/^\./, '')
  return path === '' ? '' : `/${path.replace(/\./g, '/')}`
}

export function sortUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort()
}

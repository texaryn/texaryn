/**
 * The differences between the two sides that this exercise found, stated
 * exactly.
 *
 * Recorded here rather than absorbed into a looser assertion, so the
 * comparison stays a real comparison: every step is compared for equality, and
 * a difference passes only if it is exactly the difference written down, with
 * a reason and the friction-log entry that examines it. A divergence that is
 * fixed, widened, or replaced by a different one all make the suite fail,
 * which is the point.
 */
export interface Divergence {
  /** Present on the RJSF side and absent on Texaryn's. */
  rjsfOnly?: string[]
  /** Present on Texaryn's side and absent on RJSF's. */
  texarynOnly?: string[]
  why: string
}

export const fieldDivergences: Record<string, Divergence> = {
  'Selects and groups': {
    rjsfOnly: ['/features'],
    texarynOnly: ['/features/0', '/features/1'],
    why:
      'The step asks for `ui:widget: checkboxes` on an array of enum strings. RJSF renders one ' +
      'control for the whole array. `@texaryn/react-mui` has no checkbox-group widget, so the ' +
      'array falls back to the generic array control and renders one input per element. Both ' +
      'collect the same data; the second cannot express "choose from this fixed set". Entry 5.',
  },
  'Fill in some steps': {
    rjsfOnly: ['/lastName'],
    why:
      'The conditional is validated but never projected, so the field the step requires is not ' +
      'rendered. Entry 3.',
  },
}

export const errorDivergences: Record<string, Divergence> = {
  'Basic widgets, invalid': {
    rjsfOnly: ['/website:format'],
    why: '`json-schema-library` does not assert `format: uri` for any value. Entry 6.',
  },
  'Selects and groups, invalid': {
    rjsfOnly: ['/features:uniqueItems'],
    texarynOnly: ['/features/1:uniqueItems'],
    why:
      'Same violation, attributed differently: ajv reports `uniqueItems` against the array, ' +
      'json-schema-library against the duplicate element. It decides which field shows the ' +
      'message. Entry 6.',
  },
  'Dates and files, invalid': {
    rjsfOnly: ['/readme:format'],
    why:
      "`data-url` is RJSF's own format rather than a standard one. Ignoring an unknown format " +
      'is what the specification requires, so Texaryn is correct and the template loses a ' +
      'check it was relying on. Entry 6.',
  },
  'Fill in some steps, invalid': {
    rjsfOnly: ['/:if'],
    why:
      'Both report `/lastName:required` and both call the data invalid. ajv additionally reports ' +
      'the failing `if` at the root, which RJSF itself does not surface on any field. Reporting ' +
      'noise rather than a difference of opinion. Entry 6.',
  },
}

export function difference(a: readonly string[], b: readonly string[]): string[] {
  return a.filter((entry) => !b.includes(entry))
}

/** Normalises a divergence for comparison, so an absent key and `[]` agree. */
export function expected(divergence: Divergence | undefined): {
  rjsfOnly: string[]
  texarynOnly: string[]
} {
  return {
    rjsfOnly: divergence?.rjsfOnly ?? [],
    texarynOnly: divergence?.texarynOnly ?? [],
  }
}

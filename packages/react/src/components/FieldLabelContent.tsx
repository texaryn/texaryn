import React from 'react'

/** The wording every binding uses, so a custom widget can match it. */
export const REQUIRED_INDICATOR = '(required)'

export interface FieldLabelContentProps {
  label: string
  required: boolean
}

/**
 * Label content for a field: the schema's label, plus a visible required
 * indicator that is kept out of the accessible name.
 *
 * Three separate channels carry one fact, and they must not be collapsed. The
 * sighted user reads "(required)". The accessible name stays the label alone,
 * because `aria-required` already reports the state and putting it in the name
 * as well makes some screen readers say it twice. The indicator says the word
 * rather than an asterisk, so nobody has to be told elsewhere what a marker
 * means.
 *
 * Shared by the three React widget sets so they cannot drift on it.
 */
export function FieldLabelContent({ label, required }: FieldLabelContentProps) {
  return (
    <>
      {label}
      {required ? <span aria-hidden="true"> {REQUIRED_INDICATOR}</span> : null}
    </>
  )
}

import React from 'react'
import { useFormMessages } from '../messages.js'

export interface FieldLabelContentProps {
  label: string
  required: boolean
}

/**
 * Label content for a field: the schema's label, plus a visible required
 * indicator that is kept out of the accessible name.
 *
 * Three separate channels carry one fact, and they must not be collapsed. The
 * sighted user reads the indicator. The accessible name stays the label alone,
 * because `aria-required` already reports the state and putting it in the name
 * as well makes some screen readers say it twice. The message decides the
 * wording and which side of the label it sits on; this component decides that
 * it is `aria-hidden`.
 *
 * Shared by the three React widget sets so they cannot drift on it.
 */
export function FieldLabelContent({ label, required }: FieldLabelContentProps) {
  const messages = useFormMessages()
  if (!required) return <>{label}</>
  const indicator = messages.requiredIndicator()
  const marker = (
    <span aria-hidden="true">
      {indicator.placement === 'after' ? ` ${indicator.text}` : `${indicator.text} `}
    </span>
  )
  return indicator.placement === 'after' ? (
    <>
      {label}
      {marker}
    </>
  ) : (
    <>
      {marker}
      {label}
    </>
  )
}

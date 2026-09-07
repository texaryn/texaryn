import React from 'react'
import type { FieldBinding } from '@texaryn/react'

/**
 * MUI's helper line doubles as description and error, and it renders nothing
 * when helperText is empty, so the live region has to be a stable child of it
 * rather than the line itself. Only the error goes inside the region: the
 * description is not news and should not be re-announced.
 *
 * Always returning an element keeps the line mounted without reserving it with
 * a blank string, which would change layout to prime the announcement.
 */
export function helperContent(field: FieldBinding): React.ReactNode {
  return (
    <>
      <span aria-live="polite" aria-atomic="true">
        {field.error ?? ''}
      </span>
      {field.invalid ? null : field.description}
    </>
  )
}

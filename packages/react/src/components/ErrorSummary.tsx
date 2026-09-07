import type { VisibleError } from '@texaryn/core'
import { useFormContext } from '../context.js'
import { useStore } from '../hooks/use-store.js'
import { useFormIdPrefix } from '../id-prefix.js'
import { makeId } from '../props/field-props.js'

/**
 * Deliberately not a live region. The fields already announce their own
 * errors, so an aggregate one would speak the same validation event twice.
 * What this needs instead is to become a focus destination after a failed
 * submit, which is separate work.
 */
export function ErrorSummary() {
  const runtime = useFormContext()
  const idPrefix = useFormIdPrefix()
  const visibleErrors = useStore(runtime.visibleErrors)

  if (visibleErrors.length === 0) {
    return null
  }

  return (
    <div>
      <ul>
        {visibleErrors.map((entry: VisibleError) => (
          <li key={entry.nodeId}>
            <a href={`#${makeId(idPrefix, entry.nodeId, 'input')}`}>
              {entry.fieldTitle ?? entry.pointer ?? entry.nodeId}
            </a>
            {': '}
            {entry.errors.map((error) => error.message ?? error.keyword).join(', ')}
          </li>
        ))}
      </ul>
    </div>
  )
}

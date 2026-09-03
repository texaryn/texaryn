import type { VisibleError } from '@texaryn/core'
import { useFormContext } from '../context.js'
import { useStore } from '../hooks/use-store.js'
import { makeId } from '../props/field-props.js'

export function ErrorSummary() {
  const runtime = useFormContext()
  const visibleErrors = useStore(runtime.visibleErrors)

  if (visibleErrors.length === 0) {
    return null
  }

  return (
    <div role="alert">
      <ul>
        {visibleErrors.map((entry: VisibleError) => (
          <li key={entry.nodeId}>
            <a href={`#${makeId(entry.nodeId, 'input')}`}>
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

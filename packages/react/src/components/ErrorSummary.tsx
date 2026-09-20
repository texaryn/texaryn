import { useEffect, useRef } from 'react'
import { createFailedSubmitTracker, visibleErrorLabel, visibleErrorMessages } from '@texaryn/core'
import type { FailedSubmitTracker, VisibleError } from '@texaryn/core'
import { useFormContext } from '../context.js'
import { useStore } from '../hooks/use-store.js'
import { useFormIdPrefix } from '../id-prefix.js'
import { useFormMessages } from '../messages.js'
import { makeId } from '../props/field-props.js'

export interface ErrorSummaryProps {
  /** Off for all but one summary when one runtime is rendered twice. */
  focus?: boolean
}

/** Not a live region: the fields announce their own errors, so the focus move after a failed submit is what speaks the heading. */
export function ErrorSummary({ focus = true }: ErrorSummaryProps) {
  const runtime = useFormContext()
  const idPrefix = useFormIdPrefix()
  const messages = useFormMessages()
  const visibleErrors = useStore(runtime.visibleErrors)
  const submission = useStore(runtime.submission)
  const container = useRef<HTMLDivElement>(null)
  const tracker = useRef<FailedSubmitTracker | null>(null)
  tracker.current ??= createFailedSubmitTracker(submission)

  useEffect(() => {
    if (!tracker.current!.settle(submission, visibleErrors)) return
    if (focus && container.current?.isConnected) container.current.focus()
  }, [submission, visibleErrors, focus])

  if (visibleErrors.length === 0) {
    return null
  }

  const headingId = makeId(idPrefix, 'error-summary', 'heading')
  return (
    <div role="group" tabIndex={-1} aria-labelledby={headingId} ref={container}>
      <h2 id={headingId}>{messages.errorSummaryHeading({ count: visibleErrors.length })}</h2>
      <ul>
        {visibleErrors.map((entry: VisibleError) => (
          <li key={entry.nodeId}>
            <a href={`#${makeId(idPrefix, entry.nodeId, 'input')}`}>{visibleErrorLabel(entry)}</a>
            {messages.errorSummaryDetail({ messages: visibleErrorMessages(entry) })}
          </li>
        ))}
      </ul>
    </div>
  )
}

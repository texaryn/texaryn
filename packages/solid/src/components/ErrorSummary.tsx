import { createEffect, createMemo, For, Show } from 'solid-js'
import { createFailedSubmitTracker, visibleErrorLabel, visibleErrorMessages } from '@texaryn/core'
import type { VisibleError } from '@texaryn/core'
import { useFormContext } from '../context.js'
import { useStore } from '../store.js'

function makeId(prefix: string, nodeId: string, suffix: string): string {
  return `${prefix}-${nodeId}-${suffix}`
}

export function ErrorSummary(props: { focus?: boolean }) {
  const context = useFormContext()
  const errors = useStore(() => context.form().visibleErrors)
  const submission = useStore(() => context.form().submission)
  const tracker = createFailedSubmitTracker(context.form().submission.getSnapshot())
  const headingId = createMemo(() => makeId(context.idPrefix(), 'error-summary', 'heading'))
  let container: HTMLDivElement | undefined

  createEffect(() => {
    const visible = errors()
    if (visible.length > 0 && tracker.settle(submission(), visible) && props.focus !== false) {
      queueMicrotask(() => container?.isConnected && container.focus())
    }
  })

  const details = (entry: VisibleError) => context.messages().errorSummaryDetail({ messages: visibleErrorMessages(entry) })
  return (
    <Show when={errors().length > 0}>
      <div ref={container} role="group" tabIndex={-1} aria-labelledby={headingId()}>
        <h2 id={headingId()}>{context.messages().errorSummaryHeading({ count: errors().length })}</h2>
        <ul>
          <For each={errors()}>{(entry) => (
            <li>
              <a href={`#${makeId(context.idPrefix(), entry.nodeId, 'input')}`}>{visibleErrorLabel(entry)}</a>
              {details(entry)}
            </li>
          )}</For>
        </ul>
      </div>
    </Show>
  )
}

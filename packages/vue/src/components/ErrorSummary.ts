import { defineComponent, h, ref, watch } from 'vue'
import { createFailedSubmitTracker, visibleErrorLabel, visibleErrorMessages } from '@texaryn/core'
import type { VisibleError } from '@texaryn/core'
import { useFormMessages, useFormRuntime } from '../context.js'
import { makeId } from '../field-props.js'
import { useFormIdPrefix } from '../id-prefix.js'
import { useStore } from '../use-store.js'

const NONE: VisibleError[] = []

/** Not a live region: the fields announce their own errors, so the focus move after a failed submit is what speaks the heading. */
export const ErrorSummary = defineComponent({
  name: 'ErrorSummary',
  props: {
    /** Off for all but one summary when one runtime is rendered twice. */
    focus: { type: Boolean, default: true },
  },
  setup(props) {
    const runtime = useFormRuntime()
    const idPrefix = useFormIdPrefix()
    const messages = useFormMessages()
    const visibleErrors = useStore(runtime.visibleErrors, NONE)
    const submission = useStore(runtime.submission, runtime.submission.getSnapshot())
    const container = ref<HTMLElement | null>(null)
    const tracker = createFailedSubmitTracker(runtime.submission.getSnapshot())
    const headingId = makeId(idPrefix, 'error-summary', 'heading')

    watch(
      [submission, visibleErrors],
      ([current, errors]) => {
        if (!tracker.settle(current, errors)) return
        if (props.focus && container.value?.isConnected) container.value.focus()
      },
      { flush: 'post' },
    )

    return () =>
      visibleErrors.value.length === 0
        ? null
        : h('div', { role: 'group', tabindex: -1, 'aria-labelledby': headingId, ref: container }, [
            h('h2', { id: headingId }, messages.value.errorSummaryHeading({ count: visibleErrors.value.length })),
            h(
              'ul',
              visibleErrors.value.map((entry) =>
                h('li', { key: entry.nodeId }, [
                  h('a', { href: `#${makeId(idPrefix, entry.nodeId, 'input')}` }, visibleErrorLabel(entry)),
                  messages.value.errorSummaryDetail({ messages: visibleErrorMessages(entry) }),
                ]),
              ),
            ),
          ])
  },
})

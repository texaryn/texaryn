import { defineComponent, h } from 'vue'
import { visibleErrorLabel, visibleErrorMessages } from '@texaryn/core'
import type { VisibleError } from '@texaryn/core'
import { useFormRuntime } from '../context.js'
import { makeId } from '../field-props.js'
import { useFormIdPrefix } from '../id-prefix.js'
import { useStore } from '../use-store.js'

const NONE: VisibleError[] = []

/** Not a live region: each field announces its own errors, so an aggregate one would speak the same event twice. */
export const ErrorSummary = defineComponent({
  name: 'ErrorSummary',
  setup() {
    const runtime = useFormRuntime()
    const idPrefix = useFormIdPrefix()
    const visibleErrors = useStore(runtime.visibleErrors, NONE)

    return () =>
      visibleErrors.value.length === 0
        ? null
        : h('div', [
            h(
              'ul',
              visibleErrors.value.map((entry) =>
                h('li', { key: entry.nodeId }, [
                  h('a', { href: `#${makeId(idPrefix, entry.nodeId, 'input')}` }, visibleErrorLabel(entry)),
                  `: ${visibleErrorMessages(entry).join(', ')}`,
                ]),
              ),
            ),
          ])
  },
})

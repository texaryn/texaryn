import { defineComponent, h } from 'vue'
import type { PropType } from 'vue'
import type { ValidationError } from '@texaryn/core'

export const FieldErrors = defineComponent({
  name: 'FieldErrors',
  props: {
    id: { type: String, required: true },
    errors: { type: Array as PropType<readonly ValidationError[]>, required: true },
  },
  setup(props) {
    // Always rendered, and empty while valid. A region inserted with its
    // content already in place is not reliably announced, and polite rather
    // than alert because validation runs on change, blur and submit.
    return () =>
      h(
        'div',
        { id: props.id, 'aria-live': 'polite', 'aria-atomic': 'true' },
        props.errors.map((error, index) =>
          h('div', { key: `${error.instancePointer}:${error.keyword}:${index}` },
            error.message ?? error.keyword),
        ),
      )
  },
})

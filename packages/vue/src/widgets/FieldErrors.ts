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
    return () => {
      if (props.errors.length === 0) return null
      return h(
        'div',
        { id: props.id, role: 'alert' },
        props.errors.map((error, index) =>
          h('div', { key: `${error.instancePointer}:${error.keyword}:${index}` },
            error.message ?? error.keyword),
        ),
      )
    }
  },
})

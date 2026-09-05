import { computed, defineComponent, h } from 'vue'
import type { PropType } from 'vue'
import type { UINode } from '@texaryn/core'
import { useRendererRegistry } from '../context.js'

/**
 * Compiling a schema with `active: false` produces a node with
 * `visible: false`. That is the source of truth for hiding a node, so it is
 * read off the node rather than through useField, which would cost a
 * subscription for a subtree that never renders.
 */
export const NodeRenderer = defineComponent({
  name: 'NodeRenderer',
  props: {
    node: { type: Object as PropType<UINode>, required: true },
  },
  setup(props) {
    const registry = useRendererRegistry()
    const widget = computed(() => registry.value.resolve(props.node))

    return () => {
      if (!props.node.visible || !widget.value) return null
      return h(widget.value, { node: props.node })
    }
  },
})

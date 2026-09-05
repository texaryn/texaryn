import { computed, defineComponent, h } from 'vue'
import type { PropType } from 'vue'
import type { RendererRegistry } from '@texaryn/core'
import { provideRendererRegistry, useFormRuntime } from '../context.js'
import { useStore } from '../use-store.js'
import type { WidgetComponent } from '../widget.js'
import { NodeRenderer } from './NodeRenderer.js'

export const FormRoot = defineComponent({
  name: 'FormRoot',
  props: {
    registry: {
      type: Object as PropType<RendererRegistry<WidgetComponent>>,
      required: true,
    },
  },
  setup(props) {
    const runtime = useFormRuntime()
    // Provided once here rather than at every node: inject walks the parent
    // chain, so one provide reaches the whole tree.
    provideRendererRegistry(props.registry)

    const document = useStore(runtime.document, runtime.document.getSnapshot())
    const rootNode = computed(() => document.value.nodes[document.value.rootId])

    return () => (rootNode.value ? h(NodeRenderer, { node: rootNode.value }) : null)
  },
})

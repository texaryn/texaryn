import { computed, defineComponent, h } from 'vue'
import type { PropType } from 'vue'
import type { ContainerNode, UINode } from '@texaryn/core'
import { useFormRuntime } from '../context.js'
import { useStore } from '../use-store.js'
import { useFieldArray } from '../use-field-array.js'
import { NodeRenderer } from '../components/NodeRenderer.js'

const nodeProp = { node: { type: Object as PropType<UINode>, required: true } } as const

export const ObjectLayout = defineComponent({
  name: 'ObjectLayout',
  props: nodeProp,
  setup(props) {
    const runtime = useFormRuntime()
    const document = useStore(runtime.document, runtime.document.getSnapshot())
    const children = computed(() =>
      (props.node as ContainerNode).children
        .map((id) => document.value.nodes[id])
        .filter((child): child is UINode => child != null),
    )

    return () =>
      h(
        'div',
        children.value.map((child) => h(NodeRenderer, { key: child.id, node: child })),
      )
  },
})

export const ArrayControl = defineComponent({
  name: 'ArrayControl',
  props: nodeProp,
  setup(props) {
    const runtime = useFormRuntime()
    const document = useStore(runtime.document, runtime.document.getSnapshot())
    const array = useFieldArray(() => props.node.id)

    return () =>
      h('div', [
        ...array.items.value.map((item, index) => {
          const child = item.nodeId ? document.value.nodes[item.nodeId] : undefined
          return h(
            'div',
            // Keyed by the stable item id, never the positional node id. That
            // is what makes a move preserve the row's component instance and
            // its DOM, and it is also what hands the surviving instance a
            // different node than the one it mounted with.
            { key: item.id },
            [
              child ? h(NodeRenderer, { node: child }) : null,
              array.canRemove.value
                ? h('button', { type: 'button', onClick: () => array.remove(index) }, 'Remove')
                : null,
              array.canReorder.value && index > 0
                ? h('button', { type: 'button', onClick: () => array.move(index, index - 1) }, 'Up')
                : null,
            ],
          )
        }),
        array.canAdd.value
          ? h('button', { type: 'button', onClick: () => array.add() }, 'Add')
          : null,
      ])
  },
})

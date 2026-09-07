import { computed, defineComponent, h } from 'vue'
import type { PropType } from 'vue'
import type { ContainerNode, UINode } from '@texaryn/core'
import { useFormRuntime } from '../context.js'
import { useStore } from '../use-store.js'
import { useFieldArray } from '../use-field-array.js'
import { NodeRenderer } from '../components/NodeRenderer.js'
import { addActionName, moveUpActionName, removeActionName } from '../action-names.js'

const nodeProp = { node: { type: Object as PropType<UINode>, required: true } } as const

export const ObjectLayout = defineComponent({
  name: 'ObjectLayout',
  props: nodeProp,
  setup(props) {
    const runtime = useFormRuntime()
    const document = useStore(runtime.document, runtime.document.getSnapshot())
    // Whether a node is nested is fixed for its lifetime, but its title is
    // not: a conditional subschema can add or drop one on any recompile.
    // Choosing the element once and re-deriving only the grouping semantics
    // keeps the subtree mounted, because swapping div for fieldset would
    // remount it and drop focus.
    const nested = props.node.parentId !== null
    const current = computed(
      () => (document.value.nodes[props.node.id] ?? props.node) as ContainerNode,
    )
    const title = computed(() => current.value.annotations.title)
    const children = computed(() =>
      current.value.children
        .map((id) => document.value.nodes[id])
        .filter((child): child is UINode => child != null),
    )

    return () => {
      const rendered = children.value.map((child) => h(NodeRenderer, { key: child.id, node: child }))
      if (!nested) return h('div', rendered)
      // The root object is the form itself, so only a nested titled object
      // names a group. An unnamed group is noise, so the fieldset stops being
      // one. Children sit in their own element so the legend is never a
      // candidate for reorder.
      return h(
        'fieldset',
        { role: title.value === undefined ? 'none' : undefined },
        [
          ...(title.value === undefined ? [] : [h('legend', title.value)]),
          h('div', rendered),
        ],
      )
    }
  },
})

export const ArrayControl = defineComponent({
  name: 'ArrayControl',
  props: nodeProp,
  setup(props) {
    const runtime = useFormRuntime()
    const document = useStore(runtime.document, runtime.document.getSnapshot())
    const array = useFieldArray(() => props.node.id)
    // Read from the document so a title added by a recompile reaches the name.
    const currentArray = computed(
      () => (document.value.nodes[props.node.id] ?? props.node) as ContainerNode,
    )
    const arrayTitle = computed(() => currentArray.value.annotations.title)
    const itemTemplateTitle = computed(() => currentArray.value.arrayMeta?.itemTitle)

    return () =>
      h('div', [
        ...array.items.value.map((item, index) => {
          const child = item.nodeId ? document.value.nodes[item.nodeId] : undefined
          const itemTitle = child?.annotations.title
          return h(
            'div',
            // Keyed by the stable item id, never the positional node id. That
            // is what makes a move preserve the row's component instance and
            // its DOM, and it is also what hands the surviving instance a
            // different node than the one it mounted with.
            { key: item.id },
            [
              child ? h(NodeRenderer, { node: child }) : null,
              // The visible word stays short; the distinguishing name goes in
              // aria-label, which contains it so speech input still works.
              array.canRemove.value
                ? h(
                    'button',
                    {
                      type: 'button',
                      'aria-label': removeActionName(index + 1, itemTitle, arrayTitle.value),
                      onClick: () => array.remove(index),
                    },
                    'Remove',
                  )
                : null,
              array.canReorder.value && index > 0
                ? h(
                    'button',
                    {
                      type: 'button',
                      'aria-label': moveUpActionName(index + 1, itemTitle, arrayTitle.value),
                      onClick: () => array.move(index, index - 1),
                    },
                    'Up',
                  )
                : null,
            ],
          )
        }),
        array.canAdd.value
          ? h(
              'button',
              {
                type: 'button',
                // The item template's title, not the first row's: a row may
                // not exist yet, which is when naming this matters most.
                'aria-label': addActionName(itemTemplateTitle.value, arrayTitle.value),
                onClick: () => array.add(),
              },
              'Add',
            )
          : null,
      ])
  },
})

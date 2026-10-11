import { computed, defineComponent, h, inject, provide, toRef } from 'vue'
import type { Component, PropType, Ref } from 'vue'
import type {
  DocumentCollectionRow,
  DocumentNode,
  DocumentRuntime,
  RendererRegistry,
  UIDocumentV2,
} from '@texaryn/core'
import type { NodeId } from '@texaryn/core'
import { useStore } from '../use-store.js'

export type DocumentWidgetComponent = Component

export interface DocumentRootProps {
  runtime: DocumentRuntime
  registry?: RendererRegistry<DocumentWidgetComponent, DocumentNode>
  onActionError?: (error: unknown) => void
}

interface DocumentContextValue {
  runtime: Ref<DocumentRuntime>
  document: Ref<UIDocumentV2>
  registry: Ref<RendererRegistry<DocumentWidgetComponent, DocumentNode> | undefined>
  onActionError: Ref<((error: unknown) => void) | undefined>
}

const DOCUMENT_CONTEXT = Symbol('texaryn.vue.document')
const emptyRows: readonly DocumentCollectionRow[] = Object.freeze([])

function useDocumentContext(): DocumentContextValue {
  const context = inject<DocumentContextValue | undefined>(DOCUMENT_CONTEXT)
  if (!context) throw new Error('Display nodes must be rendered below DocumentRoot')
  return context
}

let DisplayNodeView: ReturnType<typeof defineComponent>
DisplayNodeView = defineComponent({
  name: 'DisplayNodeView',
  props: { nodeId: { type: String, required: true } },
  setup(props) {
    const context = useDocumentContext()
    const node = computed(() => context.document.value.nodes[props.nodeId as NodeId])

    return () => {
      const current = node.value
      if (!current) return null
      const widget = context.registry.value?.resolve(current)
      if (widget) return h(widget, { node: current, runtime: context.runtime.value })

      if (current.type === 'container') {
        const children = current.children.map((childId) => h(DisplayNodeView, { key: childId, nodeId: childId }))
        if (current.containerType === 'group') {
          return h('fieldset', [h('legend', current.annotations.title), ...children])
        }
        return h('div', { 'data-texaryn-layout': '' }, children)
      }
      if (current.type === 'text') {
        if (current.textRole === 'heading') return h('h2', current.content)
        if (current.textRole === 'help') return h('p', { role: 'note' }, current.content)
        return h('p', current.content)
      }
      if (current.type === 'list') return h(DisplayList, { node: current })
      if (current.type === 'table') return h(DisplayTable, { node: current })
      return h('button', {
        type: 'button',
        disabled: !context.runtime.value.hasActionHandler(current.actionType),
        onClick: () => {
          void context.runtime.value.invokeAction(current.id).catch((error: unknown) => {
            if (context.onActionError.value) context.onActionError.value(error)
            else console.error(error)
          })
        },
      }, current.label)
    }
  },
})

const DisplayList = defineComponent({
  name: 'DisplayList',
  props: { node: { type: Object as PropType<Extract<DocumentNode, { type: 'list' }>>, required: true } },
  setup(props) {
    const context = useDocumentContext()
    const rows = useStore(() => context.runtime.value.getCollection(props.node.id), emptyRows)
    return () => h('ul', rows.value.map((row) => h('li', { key: row.id }, row.value === null ? '' : String(row.value))))
  },
})

const DisplayTable = defineComponent({
  name: 'DisplayTable',
  props: { node: { type: Object as PropType<Extract<DocumentNode, { type: 'table' }>>, required: true } },
  setup(props) {
    const context = useDocumentContext()
    const rows = useStore(() => context.runtime.value.getCollection(props.node.id), emptyRows)
    return () => h('table', [
      h('thead', [h('tr', props.node.columns.map((column) => h('th', { key: column.id, scope: 'col' }, column.label)))]),
      h('tbody', rows.value.map((row) => h('tr', { key: row.id }, props.node.columns.map((column, index) => {
        const value = row.cells[index] ?? null
        return h('td', { key: column.id }, value === null ? '' : String(value))
      })))),
    ])
  },
})

export const DocumentRoot = defineComponent({
  name: 'DocumentRoot',
  props: {
    runtime: { type: Object as PropType<DocumentRuntime>, required: true },
    registry: { type: Object as PropType<RendererRegistry<DocumentWidgetComponent, DocumentNode> | undefined> },
    onActionError: { type: Function as PropType<(error: unknown) => void> },
  },
  setup(props) {
    const document = useStore(() => props.runtime.document, props.runtime.document.getSnapshot())
    provide<DocumentContextValue>(DOCUMENT_CONTEXT, {
      runtime: toRef(props, 'runtime'),
      document,
      registry: toRef(props, 'registry'),
      onActionError: toRef(props, 'onActionError'),
    })
    return () => document.value.nodes[document.value.rootId]
      ? h(DisplayNodeView, { nodeId: document.value.rootId })
      : null
  },
})

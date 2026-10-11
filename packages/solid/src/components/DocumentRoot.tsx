import { createContext, createMemo, For, Show, useContext } from 'solid-js'
import type { Accessor, Component, JSX } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import type {
  DisplayContainerNode,
  DisplayTextNode,
  DocumentCollectionRow,
  DocumentNode,
  DocumentRuntime,
  ListNode,
  RendererRegistry,
  TableNode,
  UIDocumentV2,
} from '@texaryn/core'
import type { NodeId } from '@texaryn/core'
import { useStore } from '../store.js'

export type DocumentWidgetComponent = Component<{ node: DocumentNode; runtime: DocumentRuntime }>

export interface DocumentRootProps {
  runtime: DocumentRuntime
  registry?: RendererRegistry<DocumentWidgetComponent, DocumentNode>
  onActionError?: (error: unknown) => void
  children?: JSX.Element
}

interface DocumentContextValue {
  runtime: Accessor<DocumentRuntime>
  document: Accessor<UIDocumentV2>
  registry: Accessor<RendererRegistry<DocumentWidgetComponent, DocumentNode> | undefined>
  onActionError: Accessor<((error: unknown) => void) | undefined>
}

const DocumentContext = createContext<DocumentContextValue>()

function useDocumentContext(): DocumentContextValue {
  const context = useContext(DocumentContext)
  if (!context) throw new Error('Display nodes must be rendered below DocumentRoot')
  return context
}

function useRows(nodeId: NodeId): Accessor<readonly DocumentCollectionRow[]> {
  const context = useDocumentContext()
  return useStore(() => {
    const store = context.runtime().getCollection(nodeId)
    if (!store) throw new Error(`Node ${nodeId} is not a collection`)
    return store
  })
}

function DisplayNodeView(props: { nodeId: NodeId }) {
  const context = useDocumentContext()
  const node = createMemo(() => context.document().nodes[props.nodeId])
  const kind = createMemo(() => {
    const current = node()
    if (!current) return undefined
    if (current.type === 'container') return `container:${current.containerType}`
    if (current.type === 'text') return `text:${current.textRole}`
    return current.type
  })
  const widget = createMemo(() => {
    const current = node()
    return current ? context.registry()?.resolve(current) : undefined
  })
  const container = (): DisplayContainerNode | undefined => {
    const current = node()
    return current?.type === 'container' ? current : undefined
  }
  const text = (): DisplayTextNode | undefined => {
    const current = node()
    return current?.type === 'text' ? current : undefined
  }
  const list = (): ListNode | undefined => {
    const current = node()
    return current?.type === 'list' ? current : undefined
  }
  const table = (): TableNode | undefined => {
    const current = node()
    return current?.type === 'table' ? current : undefined
  }
  const action = () => {
    const current = node()
    return current?.type === 'action' ? current : undefined
  }

  return (
    <Show when={kind()} keyed>
      {(selectedKind) => {
        let fallback: JSX.Element = null
        if (selectedKind.startsWith('container:')) {
          const children = () => container()?.children ?? []
          fallback = selectedKind === 'container:group'
            ? <fieldset><legend>{container()?.annotations.title}</legend><For each={children()}>{(childId) => <DisplayNodeView nodeId={childId} />}</For></fieldset>
            : <div data-texaryn-layout=""><For each={children()}>{(childId) => <DisplayNodeView nodeId={childId} />}</For></div>
        } else if (selectedKind === 'text:heading') {
          fallback = <h2>{text()?.content}</h2>
        } else if (selectedKind === 'text:help') {
          fallback = <p role="note">{text()?.content}</p>
        } else if (selectedKind === 'text:paragraph') {
          fallback = <p>{text()?.content}</p>
        } else if (selectedKind === 'list') {
          fallback = <Show when={list()}><DisplayList nodeId={props.nodeId} /></Show>
        } else if (selectedKind === 'table') {
          fallback = <Show when={table()}><DisplayTable nodeId={props.nodeId} /></Show>
        } else if (selectedKind === 'action') {
          fallback = (
            <button
              type="button"
              onClick={() => {
                const current = node()
                if (current?.type !== 'action') return
                void context.runtime().invokeAction(current.id).catch((error) => {
                  const onError = context.onActionError()
                  if (onError) onError(error)
                  else console.error(error)
                })
              }}
            >
              {action()?.label ?? ''}
            </button>
          )
        }

        return (
          <Show when={widget()} fallback={fallback}>
            <Dynamic component={widget()!} node={node()!} runtime={context.runtime()} />
          </Show>
        )
      }}
    </Show>
  )
}

function DisplayList(props: { nodeId: NodeId }) {
  const rows = useRows(props.nodeId)
  return (
    <ul>
      <For each={rows().map((row) => row.id)}>{(rowId) => {
        const row = () => rows().find((candidate) => candidate.id === rowId)
        return <li>{row()?.value == null ? '' : String(row()?.value)}</li>
      }}</For>
    </ul>
  )
}

function DisplayTable(props: { nodeId: NodeId }) {
  const context = useDocumentContext()
  const rows = useRows(props.nodeId)
  const node = createMemo(() => {
    const current = context.document().nodes[props.nodeId]
    return current?.type === 'table' ? current : undefined
  })
  return (
    <table>
      <thead><tr><For each={node()?.columns ?? []}>{(column) => <th scope="col">{column.label}</th>}</For></tr></thead>
      <tbody>
        <For each={rows().map((row) => row.id)}>{(rowId) => {
          const row = () => rows().find((candidate) => candidate.id === rowId)
          return (
          <tr>
            <For each={node()?.columns ?? []}>{(column, index) => {
              const value = () => row()?.cells[index()] ?? null
              return <td>{value() === null ? '' : String(value())}</td>
            }}</For>
          </tr>
          )
        }}</For>
      </tbody>
    </table>
  )
}

export function DocumentRoot(props: DocumentRootProps) {
  const document = useStore(() => props.runtime.document)
  const context: DocumentContextValue = {
    runtime: () => props.runtime,
    document,
    registry: () => props.registry,
    onActionError: () => props.onActionError,
  }

  return (
    <DocumentContext.Provider value={context}>
      <Show when={document().rootId} keyed>
        {(rootId) => <DisplayNodeView nodeId={rootId} />}
      </Show>
      {props.children}
    </DocumentContext.Provider>
  )
}

import { createContext, useContext } from 'react'
import type { ComponentType, ReactNode } from 'react'
import type {
  DocumentNode,
  DocumentRuntime,
  DocumentCollectionRow,
  RendererRegistry,
  UIDocumentV2,
} from '@texaryn/core'
import { useStore } from '../hooks/use-store.js'

export type DocumentWidgetComponent = ComponentType<{
  node: DocumentNode
  runtime: DocumentRuntime
}>

export interface DocumentRootProps {
  runtime: DocumentRuntime
  registry?: RendererRegistry<DocumentWidgetComponent, DocumentNode>
  onActionError?: (error: unknown) => void
}

interface DocumentContextValue {
  runtime: DocumentRuntime
  document: UIDocumentV2
  registry: RendererRegistry<DocumentWidgetComponent, DocumentNode> | undefined
  onActionError: (error: unknown) => void
}

const DocumentContext = createContext<DocumentContextValue | null>(null)

function useDocumentContext(): DocumentContextValue {
  const context = useContext(DocumentContext)
  if (!context) throw new Error('DocumentRoot must contain every display node')
  return context
}

function useRows(nodeId: DocumentNode['id']): readonly DocumentCollectionRow[] {
  const { runtime } = useDocumentContext()
  const store = runtime.getCollection(nodeId)
  if (!store) throw new Error(`Node ${nodeId} is not a collection`)
  return useStore(store)
}

function DisplayNodeView({ nodeId }: { nodeId: DocumentNode['id'] }): ReactNode {
  const { runtime, document, registry, onActionError } = useDocumentContext()
  const node = document.nodes[nodeId]
  if (!node) return null
  const Widget = registry?.resolve(node)
  if (Widget) return <Widget node={node} runtime={runtime} />

  if (node.type === 'container') {
    const children = node.children.map((childId) => <DisplayNodeView key={childId} nodeId={childId} />)
    if (node.containerType === 'group') {
      return <fieldset><legend>{node.annotations.title}</legend>{children}</fieldset>
    }
    return <div data-texaryn-layout="">{children}</div>
  }
  if (node.type === 'text') {
    if (node.textRole === 'heading') return <h2>{node.content}</h2>
    if (node.textRole === 'help') return <p role="note">{node.content}</p>
    return <p>{node.content}</p>
  }
  if (node.type === 'list') return <DisplayList node={node} />
  if (node.type === 'table') return <DisplayTable node={node} />
  if (node.type === 'action') {
    return (
      <button
        type="button"
        disabled={!runtime.hasActionHandler(node.actionType)}
        onClick={() => {
          void runtime.invokeAction(node.id).catch(onActionError)
        }}
      >
        {node.label}
      </button>
    )
  }
  return null
}

function DisplayList({ node }: { node: Extract<DocumentNode, { type: 'list' }> }) {
  const rows = useRows(node.id)
  return <ul>{rows.map((row) => <li key={row.id}>{row.value === null ? '' : String(row.value)}</li>)}</ul>
}

function DisplayTable({ node }: { node: Extract<DocumentNode, { type: 'table' }> }) {
  const rows = useRows(node.id)
  return (
    <table>
      <thead>
        <tr>{node.columns.map((column) => <th key={column.id} scope="col">{column.label}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            {node.columns.map((column, index) => {
              const value = row.cells[index] ?? null
              return <td key={column.id}>{value === null ? '' : String(value)}</td>
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function DocumentRoot({ runtime, registry, onActionError = console.error }: DocumentRootProps) {
  const document = useStore(runtime.document)
  const context: DocumentContextValue = { runtime, document, registry, onActionError }
  if (!document.nodes[document.rootId]) return null
  return (
    <DocumentContext.Provider value={context}>
      <DisplayNodeView nodeId={document.rootId} />
    </DocumentContext.Provider>
  )
}

import type {
  DocumentNode,
  DocumentRuntime,
  ListNode,
  RendererRegistry,
  TableNode,
} from '@texaryn/core'
import type { DocumentCollectionRow } from '@texaryn/core'

export interface DocumentDomWidget {
  element: HTMLElement
  destroy(): void
}

export interface DocumentRenderContext {
  runtime: DocumentRuntime
  registry?: RendererRegistry<DocumentWidgetFactory, DocumentNode>
  onActionError: (error: unknown) => void
  mountChild(node: DocumentNode): DocumentNodeBinding
}

export type DocumentWidgetFactory = (node: DocumentNode, context: DocumentRenderContext) => DocumentDomWidget

export interface DocumentNodeBinding {
  readonly element: HTMLElement
  destroy(): void
}

interface InternalDocumentNodeBinding extends DocumentNodeBinding {
  readonly node: DocumentNode
  readonly renderer: 'builtin' | 'widget'
  readonly children?: readonly InternalDocumentNodeBinding[]
  canUpdate(node: DocumentNode): boolean
  update(node: DocumentNode): void
  setChildren?(children: readonly InternalDocumentNodeBinding[], removeMissing?: boolean): void
}

interface InternalDocumentRenderContext extends Omit<DocumentRenderContext, 'mountChild'> {
  mountChild(node: DocumentNode): InternalDocumentNodeBinding
}

export interface DocumentMountOptions {
  registry?: RendererRegistry<DocumentWidgetFactory, DocumentNode>
  onActionError?: (error: unknown) => void
}

export interface DocumentMount {
  readonly runtime: DocumentRuntime
  unmount(): void
}

function displayValue(value: string | number | boolean | null): string {
  return value === null ? '' : String(value)
}

function createBinding(
  node: DocumentNode,
  element: HTMLElement,
  canUpdate: (next: DocumentNode) => boolean,
  update: (next: DocumentNode) => void,
  destroy: () => void,
  renderer: InternalDocumentNodeBinding['renderer'] = 'builtin',
): InternalDocumentNodeBinding {
  let currentNode = node
  return {
    get node() { return currentNode },
    renderer,
    element,
    canUpdate(next) {
      return currentNode.id === next.id && canUpdate(next)
    },
    update(next) {
      update(next)
      currentNode = next
    },
    destroy,
  }
}

function sameCollectionSource(
  current: ListNode | TableNode,
  next: ListNode | TableNode,
): boolean {
  return current.id === next.id && current.type === next.type &&
    current.collectionId === next.collectionId &&
    current.dataPointer === next.dataPointer &&
    current.rowKeyPointer === next.rowKeyPointer
}

function mountList(node: ListNode, context: InternalDocumentRenderContext): InternalDocumentNodeBinding {
  const element = document.createElement('ul')
  const rows = context.runtime.getCollection(node.id)
  if (!rows) throw new Error(`Node ${node.id} has no collection store`)
  const rendered = new Map<string, HTMLLIElement>()
  let currentNode = node

  function update(snapshot: readonly DocumentCollectionRow[]): void {
    const active = new Set<string>(snapshot.map((row) => row.id))
    for (const [rowId, item] of rendered) {
      if (active.has(rowId)) continue
      item.remove()
      rendered.delete(rowId)
    }
    for (const row of snapshot) {
      let item = rendered.get(row.id)
      if (!item) {
        item = document.createElement('li')
        rendered.set(row.id, item)
      }
      item.textContent = displayValue(row.value)
      element.append(item)
    }
  }

  update(rows.getSnapshot())
  const unsubscribe = rows.subscribe(() => update(rows.getSnapshot()))
  return createBinding(
    node,
    element,
    (next) => next.type === 'list' && sameCollectionSource(currentNode, next),
    (next) => {
      if (next.type !== 'list') return
      currentNode = next
      update(rows.getSnapshot())
    },
    unsubscribe,
  )
}

interface RenderedTableRow {
  element: HTMLTableRowElement
  cells: Map<string, HTMLTableCellElement>
}

function mountTable(node: TableNode, context: InternalDocumentRenderContext): InternalDocumentNodeBinding {
  const table = document.createElement('table')
  const head = document.createElement('thead')
  const headerRow = document.createElement('tr')
  const body = document.createElement('tbody')
  const headers = new Map<string, HTMLTableCellElement>()
  const rows = context.runtime.getCollection(node.id)
  if (!rows) throw new Error(`Node ${node.id} has no collection store`)
  const rendered = new Map<string, RenderedTableRow>()
  let currentNode = node
  head.append(headerRow)
  table.append(head, body)

  function update(snapshot: readonly DocumentCollectionRow[]): void {
    const columns = currentNode.columns
    const activeColumns = new Set(columns.map((column) => column.id))
    for (const [columnId, header] of headers) {
      if (activeColumns.has(columnId)) continue
      header.remove()
      headers.delete(columnId)
    }
    for (const column of columns) {
      let header = headers.get(column.id)
      if (!header) {
        header = document.createElement('th')
        header.scope = 'col'
        headers.set(column.id, header)
      }
      header.textContent = column.label
      headerRow.append(header)
    }

    const activeRows = new Set<string>(snapshot.map((row) => row.id))
    for (const [rowId, row] of rendered) {
      if (activeRows.has(rowId)) continue
      row.element.remove()
      rendered.delete(rowId)
    }
    for (const row of snapshot) {
      let renderedRow = rendered.get(row.id)
      if (!renderedRow) {
        renderedRow = { element: document.createElement('tr'), cells: new Map() }
        rendered.set(row.id, renderedRow)
      }
      const activeCells = new Set(columns.map((column) => column.id))
      for (const [columnId, cell] of renderedRow.cells) {
        if (activeCells.has(columnId)) continue
        cell.remove()
        renderedRow.cells.delete(columnId)
      }
      columns.forEach((column, index) => {
        let cell = renderedRow!.cells.get(column.id)
        if (!cell) {
          cell = document.createElement('td')
          cell.dataset.columnId = column.id
          renderedRow!.cells.set(column.id, cell)
        }
        cell.textContent = displayValue(row.cells[index] ?? null)
        renderedRow!.element.append(cell)
      })
      body.append(renderedRow.element)
    }
  }

  update(rows.getSnapshot())
  const unsubscribe = rows.subscribe(() => update(rows.getSnapshot()))
  return createBinding(
    node,
    table,
    (next) => next.type === 'table' && sameCollectionSource(currentNode, next),
    (next) => {
      if (next.type !== 'table') return
      currentNode = next
      update(rows.getSnapshot())
    },
    unsubscribe,
  )
}

function mountNode(node: DocumentNode, context: InternalDocumentRenderContext): InternalDocumentNodeBinding {
  const factory = context.registry?.resolve(node)
  if (factory) {
    const mountedChildren: InternalDocumentNodeBinding[] = []
    const widgetContext: DocumentRenderContext = {
      ...context,
      mountChild(child) {
        const binding = context.mountChild(child)
        mountedChildren.push(binding)
        return binding
      },
    }
    let widget: DocumentDomWidget
    try {
      widget = factory(node, widgetContext)
    } catch (error) {
      for (const child of mountedChildren) child.destroy()
      throw error
    }
    return createBinding(
      node,
      widget.element,
      () => false,
      () => {},
      () => {
        widget.destroy()
        for (const child of mountedChildren) child.destroy()
      },
      'widget',
    )
  }

  if (node.type === 'container') {
    const group = node.containerType === 'group'
    const element = document.createElement(group ? 'fieldset' : 'div')
    let children: readonly InternalDocumentNodeBinding[] = []
    let legend: HTMLLegendElement | undefined
    if (group) {
      legend = document.createElement('legend')
      legend.textContent = node.annotations.title ?? ''
    } else {
      element.dataset.texarynLayout = ''
    }

    function setChildren(nextChildren: readonly InternalDocumentNodeBinding[], removeMissing = true): void {
      const nextElements = new Set(nextChildren.map((child) => child.element))
      if (removeMissing) {
        for (const child of children) {
          if (!nextElements.has(child.element)) child.element.remove()
        }
      }
      if (legend && legend.parentElement !== element) element.prepend(legend)
      let position: ChildNode | null = legend ? legend.nextSibling : element.firstChild
      for (const child of nextChildren) {
        if (child.element !== position) element.insertBefore(child.element, position)
        position = child.element.nextSibling
      }
      children = [...nextChildren]
    }

    const mounted: InternalDocumentNodeBinding[] = []
    try {
      for (const childId of node.children) {
        const child = context.runtime.document.getSnapshot().nodes[childId]
        if (!child) throw new Error(`Container ${node.id} references missing node ${childId}`)
        mounted.push(context.mountChild(child))
      }
      setChildren(mounted)
    } catch (error) {
      for (const child of mounted) child.destroy()
      throw error
    }

    const binding = createBinding(
      node,
      element,
      (next) => next.type === 'container' && next.containerType === node.containerType,
      (next) => {
        if (next.type !== 'container') return
        if (legend) legend.textContent = next.annotations.title ?? ''
        if (!group) element.dataset.texarynLayout = ''
      },
      () => {
        for (const child of children) child.destroy()
      },
    )
    Object.defineProperties(binding, {
      children: { get: () => children },
      setChildren: { value: setChildren },
    })
    return binding
  }

  if (node.type === 'text') {
    const tag = node.textRole === 'heading' ? 'h2' : 'p'
    const element = document.createElement(tag)
    if (node.textRole === 'help') element.setAttribute('role', 'note')
    element.textContent = node.content
    return createBinding(
      node,
      element,
      (next) => next.type === 'text' && next.textRole === node.textRole,
      (next) => {
        if (next.type === 'text') element.textContent = next.content
      },
      () => {},
    )
  }
  if (node.type === 'list') return mountList(node, context)
  if (node.type === 'table') return mountTable(node, context)

  const element = document.createElement('button')
  element.type = 'button'
  element.textContent = node.label
  const onClick = (): void => {
    void context.runtime.invokeAction(node.id).catch(context.onActionError)
  }
  element.addEventListener('click', onClick)
  return createBinding(
    node,
    element,
    (next) => next.type === 'action',
    (next) => {
      if (next.type === 'action') element.textContent = next.label
    },
    () => element.removeEventListener('click', onClick),
  )
}

function reconcileBindings(previous: InternalDocumentNodeBinding, next: InternalDocumentNodeBinding): InternalDocumentNodeBinding {
  if (previous.renderer !== next.renderer || !previous.canUpdate(next.node)) {
    previous.destroy()
    return next
  }

  if (previous.children && next.children && previous.setChildren && next.setChildren) {
    const previousById = new Map(previous.children.map((child) => [child.node.id, child]))
    const children = next.children.map((child) => {
      const oldChild = previousById.get(child.node.id)
      if (!oldChild) return child
      previousById.delete(child.node.id)
      return reconcileBindings(oldChild, child)
    })
    for (const child of previousById.values()) child.destroy()
    previous.update(next.node)
    previous.setChildren(children)
    next.setChildren([], false)
    next.destroy()
    return previous
  }

  previous.update(next.node)
  next.destroy()
  return previous
}

export function mountDocument(
  container: HTMLElement,
  runtime: DocumentRuntime,
  options: DocumentMountOptions = {},
): DocumentMount {
  const context: InternalDocumentRenderContext = {
    runtime,
    registry: options.registry,
    onActionError: options.onActionError ?? console.error,
    mountChild: (node) => mountNode(node, context),
  }
  const initialDocument = runtime.document.getSnapshot()
  let root = mountNode(initialDocument.nodes[initialDocument.rootId]!, context)
  container.append(root.element)
  let live = true

  const unsubscribe = runtime.document.subscribe(() => {
    if (!live) return
    const nextDocument = runtime.document.getSnapshot()
    const nextRoot = nextDocument.nodes[nextDocument.rootId]
    if (!nextRoot) throw new Error('Display document root is missing')
    const replacement = mountNode(nextRoot, context)
    const previous = root
    const reconciled = reconcileBindings(previous, replacement)
    if (reconciled.element !== previous.element) previous.element.replaceWith(reconciled.element)
    root = reconciled
  })

  return {
    runtime,
    unmount() {
      if (!live) return
      live = false
      unsubscribe()
      root.destroy()
      root.element.remove()
    },
  }
}

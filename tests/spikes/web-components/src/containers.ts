import type { ContainerNode, StableItemId, UINode } from '@texaryn/core'
import type { DomWidget, NodeBinding, RenderContext } from './widget.js'

function currentNodes(ctx: RenderContext): Record<string, UINode> {
  return ctx.runtime.document.getSnapshot().nodes
}

type Movable = HTMLElement & { moveBefore?: (node: Node, child: Node | null) => void }

/**
 * Moves `el` before `ref` inside `parent`. `insertBefore` on a connected node
 * is a remove and an insert, and the removal runs the focus fixup, so a
 * focused row blurs. `moveBefore` is the atomic move that keeps focus and
 * selection; it exists in current Chromium and Firefox, and the fallback is
 * plain `insertBefore`.
 */
function place(parent: Movable, el: HTMLElement, ref: Node | null): void {
  if (el.parentNode === parent && typeof parent.moveBefore === 'function') {
    parent.moveBefore(el, ref)
  } else {
    parent.insertBefore(el, ref)
  }
}

/**
 * Puts `wanted` in order under `parent` without ever moving the element that
 * contains the focused control. Every other element is placed relative to
 * that anchor, so the result is the same order and the focus never leaves
 * the document. Elements that are not wanted must already be gone.
 */
function reorder(parent: HTMLElement, wanted: HTMLElement[]): void {
  const active = document.activeElement
  const anchorIndex = active ? wanted.findIndex((el) => el.contains(active)) : -1
  if (anchorIndex < 0) {
    wanted.forEach((el, index) => {
      const at = parent.children[index] ?? null
      if (at !== el) place(parent, el, at)
    })
    return
  }
  const anchor = wanted[anchorIndex]
  let ref: Node = anchor
  for (let i = anchorIndex - 1; i >= 0; i--) {
    const el = wanted[i]
    if (el.nextSibling !== ref) place(parent, el, ref)
    ref = el
  }
  let prev: Element = anchor
  for (let i = anchorIndex + 1; i < wanted.length; i++) {
    const el = wanted[i]
    if (prev.nextSibling !== el) place(parent, el, prev.nextSibling)
    prev = el
  }
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.textContent = label
  element.addEventListener('click', onClick)
  return element
}

/**
 * Object children are keyed by their property name, the last pointer
 * segment, never by node id. Node ids are positional, so when the row that
 * contains this object moves, every child arrives with a new id; the property
 * name is what still says "this is the same field", and keeping the binding
 * is what keeps its input element and the focus on it.
 */
function childKey(node: UINode): string {
  const pointer = node.dataPointer
  if (pointer == null) return node.id
  const index = pointer.lastIndexOf('/')
  return index >= 0 ? pointer.slice(index + 1) : pointer
}

export function objectLayout(initial: UINode, ctx: RenderContext): DomWidget {
  const root = document.createElement('div')
  root.className = 'texaryn-object'
  const bindings = new Map<string, NodeBinding>()

  function reconcile(node: ContainerNode): void {
    const nodes = currentNodes(ctx)
    const wanted = node.children.map((id) => nodes[id]).filter((n): n is UINode => n != null)
    const keep = new Set<string>()
    const elements: HTMLElement[] = []
    for (const child of wanted) {
      const key = childKey(child)
      keep.add(key)
      let binding = bindings.get(key)
      if (binding) {
        binding.update(child)
      } else {
        binding = ctx.mountChild(child)
        bindings.set(key, binding)
      }
      elements.push(binding.element)
    }
    for (const [key, binding] of bindings) {
      if (keep.has(key)) continue
      binding.destroy()
      binding.element.remove()
      bindings.delete(key)
    }
    reorder(root, elements)
  }

  reconcile(initial as ContainerNode)

  return {
    element: root,
    update(node) {
      reconcile(node as ContainerNode)
    },
    destroy() {
      for (const binding of bindings.values()) binding.destroy()
      bindings.clear()
    },
  }
}

interface Row {
  element: HTMLElement
  slot: HTMLElement
  binding: NodeBinding | null
  up: HTMLButtonElement
  remove: HTMLButtonElement
}

/**
 * Rows are keyed by `StableItemId`, which survives insert, remove and move,
 * and each row's binding is re-pointed at whatever positional node now sits
 * at its index. Buttons resolve their index at click time for the same
 * reason: an index captured at render time is stale after any mutation.
 */
export function arrayControl(initial: UINode, ctx: RenderContext): DomWidget {
  let node = initial as ContainerNode
  const root = document.createElement('div')
  root.className = 'texaryn-array'
  const list = document.createElement('div')
  const add = button('Add', () => {
    ctx.runtime.dispatch({
      type: 'InsertItem',
      containerId: node.id,
      index: node.arrayMeta?.itemIds.length ?? 0,
    })
  })
  root.append(list, add)
  const rows = new Map<StableItemId, Row>()

  function indexOf(itemId: StableItemId): number {
    return node.arrayMeta?.itemIds.indexOf(itemId) ?? -1
  }

  function createRow(itemId: StableItemId): Row {
    const element = document.createElement('div')
    element.className = 'texaryn-array-item'
    element.dataset.itemId = itemId
    const slot = document.createElement('div')
    const up = button('Up', () => {
      const index = indexOf(itemId)
      if (index > 0) {
        ctx.runtime.dispatch({ type: 'MoveItem', containerId: node.id, from: index, to: index - 1 })
      }
    })
    const remove = button('Remove', () => {
      const index = indexOf(itemId)
      if (index >= 0) ctx.runtime.dispatch({ type: 'RemoveItem', containerId: node.id, index })
    })
    element.append(slot, up, remove)
    return { element, slot, binding: null, up, remove }
  }

  function reconcile(next: ContainerNode): void {
    node = next
    const meta = node.arrayMeta
    const nodes = currentNodes(ctx)
    const itemIds = meta?.itemIds ?? []
    const keep = new Set<StableItemId>()
    const elements: HTMLElement[] = []
    itemIds.forEach((itemId, index) => {
      keep.add(itemId)
      let row = rows.get(itemId)
      if (!row) {
        row = createRow(itemId)
        rows.set(itemId, row)
      }
      const child = nodes[node.children[index]]
      if (child) {
        if (row.binding) {
          row.binding.update(child)
        } else {
          row.binding = ctx.mountChild(child)
          row.slot.append(row.binding.element)
        }
      } else if (row.binding) {
        row.binding.destroy()
        row.binding.element.remove()
        row.binding = null
      }
      row.remove.hidden = !(meta?.canRemove ?? false)
      row.up.hidden = !(meta?.canReorder ?? false) || index === 0
      elements.push(row.element)
    })
    for (const [itemId, row] of rows) {
      if (keep.has(itemId)) continue
      row.binding?.destroy()
      row.element.remove()
      rows.delete(itemId)
    }
    reorder(list, elements)
    add.hidden = !(meta?.canAdd ?? false)
  }

  reconcile(node)

  return {
    element: root,
    update(next) {
      reconcile(next as ContainerNode)
    },
    destroy() {
      for (const row of rows.values()) row.binding?.destroy()
      rows.clear()
    },
  }
}

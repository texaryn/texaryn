import { englishMessages, objectChildKey } from '@texaryn/core'
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
 * selection where the browser has it; the fallback is plain `insertBefore`,
 * made safe by the anchor rule in `reorder`.
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

interface BoundaryAction {
  element: HTMLButtonElement
  target: { containerId: ContainerNode['id']; targetToken: string }
}

export function objectLayout(initial: UINode, ctx: RenderContext): DomWidget {
  // Whether a node is nested is fixed for its lifetime, but its title is not:
  // a conditional subschema can add or drop one on any recompile, and this
  // widget survives that. So the element is chosen once and the grouping
  // semantics are re-derived from the node on every reconcile.
  const nested = initial.parentId !== null
  const root = document.createElement(nested ? 'fieldset' : 'div')
  root.className = 'texaryn-object'
  const legend = nested ? document.createElement('legend') : null
  // Children live in their own element so the legend is never a candidate for reorder.
  const body = nested ? document.createElement('div') : root
  if (body !== root) root.append(body)
  const actions = document.createElement('div')
  actions.className = 'texaryn-boundary-actions'
  const bindings = new Map<string, NodeBinding>()
  const boundaryActions = new Map<string, BoundaryAction>()

  /** The root object is the form itself, so only a nested titled object names a group. */
  function applyGrouping(node: UINode): void {
    if (!legend) return
    const title = node.annotations.title
    if (title === undefined) {
      legend.remove()
      // An unnamed group is noise, so the fieldset stops being one.
      root.setAttribute('role', 'none')
      return
    }
    legend.textContent = title
    // A legend names its fieldset only as the first child.
    if (root.firstChild !== legend) root.prepend(legend)
    root.removeAttribute('role')
  }

  function reconcile(node: ContainerNode): void {
    applyGrouping(node)
    const nodes = currentNodes(ctx)
    const wanted = node.children.map((id) => nodes[id]).filter((n): n is UINode => n != null)
    const keep = new Set<string>()
    const elements: HTMLElement[] = []
    for (const child of wanted) {
      const key = objectChildKey(child)
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
    reorder(body, elements)
    const boundaryTargets = node.boundaryTargets ?? []
    if (boundaryTargets.length === 0) {
      actions.remove()
      boundaryActions.clear()
      return
    }
    if (actions.parentNode !== root) root.append(actions)
    const firstTargetByReason = new Map<string, (typeof boundaryTargets)[number]>()
    for (const target of boundaryTargets) {
      if (!firstTargetByReason.has(target.reason)) firstTargetByReason.set(target.reason, target)
    }
    const wantedActions: HTMLButtonElement[] = []
    for (const [reason, target] of firstTargetByReason) {
      const message = (ctx.messages.expandBoundary ?? englishMessages.expandBoundary)({
        boundary: target.reason,
        containerTitle: node.annotations.title,
        position: 1,
        count: 1,
      })
      let action = boundaryActions.get(reason)
      if (!action) {
        const targetRef = { containerId: node.id, targetToken: target.token }
        const element = button(message.label, () =>
          ctx.runtime.dispatch({
            type: 'ExpandBoundary',
            containerId: targetRef.containerId,
            targetToken: targetRef.targetToken,
          }),
        )
        action = { element, target: targetRef }
        boundaryActions.set(reason, action)
      }
      action.target.containerId = node.id
      action.target.targetToken = target.token
      action.element.textContent = message.label
      action.element.setAttribute('aria-label', message.accessibleName)
      wantedActions.push(action.element)
    }
    for (const [reason, action] of boundaryActions) {
      if (firstTargetByReason.has(reason)) continue
      action.element.remove()
      boundaryActions.delete(reason)
    }
    reorder(actions, wantedActions)
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
  down: HTMLButtonElement
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
  const add = button('', () => {
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
    element.dataset.arrayRow = ''
    const slot = document.createElement('div')
    let row: Row
    const up = button('', () => {
      const index = indexOf(itemId)
      if (index > 0) {
        const wasFocused = document.activeElement === up
        ctx.runtime.dispatch({ type: 'MoveItem', containerId: node.id, from: index, to: index - 1 })
        if (wasFocused && index === 1) {
          queueMicrotask(() => { if (!row.down.hidden) row.down.focus() })
        }
      }
    })
    up.dataset.reorderDirection = 'up'
    const down = button('', () => {
      const index = indexOf(itemId)
      const length = node.arrayMeta?.itemIds.length ?? 0
      if (index >= 0 && index < length - 1) {
        const wasFocused = document.activeElement === down
        ctx.runtime.dispatch({ type: 'MoveItem', containerId: node.id, from: index, to: index + 1 })
        if (wasFocused && index === length - 2) {
          queueMicrotask(() => { if (!row.up.hidden) row.up.focus() })
        }
      }
    })
    down.dataset.reorderDirection = 'down'
    const remove = button('', () => {
      const index = indexOf(itemId)
      if (index >= 0) ctx.runtime.dispatch({ type: 'RemoveItem', containerId: node.id, index })
    })
    element.append(slot, up, down, remove)
    row = { element, slot, binding: null, up, down, remove }
    return row
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
      row.down.hidden = !(meta?.canReorder ?? false) || index === itemIds.length - 1
      // Named here rather than in createRow: a row survives a move, so the
      // position in its name is only correct if it is rewritten every pass,
      // the same reason the click handlers resolve their index at click time.
      const context = {
        position: index + 1,
        itemTitle: child?.annotations.title,
        containerTitle: node.annotations.title,
      }
      const remove = ctx.messages.removeItem(context)
      row.remove.textContent = remove.label
      row.remove.setAttribute('aria-label', remove.accessibleName)
      const up = ctx.messages.moveItemUp(context)
      row.up.textContent = up.label
      row.up.setAttribute('aria-label', up.accessibleName)
      const down = ctx.messages.moveItemDown(context)
      row.down.textContent = down.label
      row.down.setAttribute('aria-label', down.accessibleName)
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
    // The item template's title, not the first row's: a row may not exist yet,
    // which is when naming this matters most.
    const addMessage = ctx.messages.addItem({
      itemTemplateTitle: meta?.itemTitle,
      containerTitle: node.annotations.title,
    })
    add.textContent = addMessage.label
    add.setAttribute('aria-label', addMessage.accessibleName)
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

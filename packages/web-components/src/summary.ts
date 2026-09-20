import { visibleErrorLabel, visibleErrorMessages } from '@texaryn/core'
import type { NodeId, VisibleError } from '@texaryn/core'
import { makeId } from './ids.js'
import type { Mount } from './mount.js'

export interface ErrorSummaryMount {
  unmount(): void
}

function updateItem(li: HTMLLIElement, entry: VisibleError, idPrefix: string): void {
  const link = li.firstChild as HTMLAnchorElement
  link.href = `#${makeId(idPrefix, entry.nodeId, 'input')}`
  link.textContent = visibleErrorLabel(entry)
  li.lastChild!.textContent = `: ${visibleErrorMessages(entry).join(', ')}`
}

function item(entry: VisibleError, idPrefix: string): HTMLLIElement {
  const li = document.createElement('li')
  li.append(document.createElement('a'), document.createTextNode(''))
  updateItem(li, entry, idPrefix)
  return li
}

/** Takes the Mount, not a runtime and a prefix, so the links cannot name a namespace the form was not mounted under. */
export function mountErrorSummary(container: HTMLElement, form: Mount): ErrorSummaryMount {
  const { runtime, idPrefix } = form
  const root = document.createElement('div')
  const list = document.createElement('ul')
  root.append(list)
  const items = new Map<NodeId, HTMLLIElement>()

  const render = (): void => {
    const errors = runtime.visibleErrors.getSnapshot()
    if (errors.length === 0) {
      root.remove()
      return
    }
    const seen = new Set<NodeId>()
    const ordered = errors.map((entry) => {
      seen.add(entry.nodeId)
      const existing = items.get(entry.nodeId)
      if (existing) {
        updateItem(existing, entry, idPrefix)
        return existing
      }
      const li = item(entry, idPrefix)
      items.set(entry.nodeId, li)
      return li
    })
    for (const [nodeId, li] of items) {
      if (seen.has(nodeId)) continue
      li.remove()
      items.delete(nodeId)
    }
    let anchor = list.firstChild
    for (const li of ordered) {
      if (li === anchor) {
        anchor = anchor.nextSibling
      } else {
        list.insertBefore(li, anchor)
      }
    }
    if (root.parentNode !== container) container.prepend(root)
  }

  render()
  const unsubscribe = runtime.visibleErrors.subscribe(render)

  return {
    unmount() {
      unsubscribe()
      root.remove()
    },
  }
}

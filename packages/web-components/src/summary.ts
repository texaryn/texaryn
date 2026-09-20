import { createFailedSubmitTracker, visibleErrorLabel, visibleErrorMessages } from '@texaryn/core'
import type { FormMessages, NodeId, VisibleError } from '@texaryn/core'
import { makeId } from './ids.js'
import type { Mount } from './mount.js'

export interface ErrorSummaryOptions {
  /** Off for all but one summary when one runtime is rendered twice. */
  focus?: boolean
}

export interface ErrorSummaryMount {
  setMessages(messages: FormMessages): void
  unmount(): void
}

function updateItem(li: HTMLLIElement, entry: VisibleError, idPrefix: string, messages: FormMessages): void {
  const link = li.firstChild as HTMLAnchorElement
  link.href = `#${makeId(idPrefix, entry.nodeId, 'input')}`
  link.textContent = visibleErrorLabel(entry)
  li.lastChild!.textContent = messages.errorSummaryDetail({ messages: visibleErrorMessages(entry) })
}

function item(entry: VisibleError, idPrefix: string, messages: FormMessages): HTMLLIElement {
  const li = document.createElement('li')
  li.append(document.createElement('a'), document.createTextNode(''))
  updateItem(li, entry, idPrefix, messages)
  return li
}

/** Takes the Mount, not a runtime and a prefix, so the links cannot name a namespace the form was not mounted under. */
export function mountErrorSummary(
  container: HTMLElement,
  form: Mount,
  options: ErrorSummaryOptions = {},
): ErrorSummaryMount {
  const { runtime, idPrefix } = form
  const { focus = true } = options
  let messages = form.messages
  const root = document.createElement('div')
  root.setAttribute('role', 'group')
  root.tabIndex = -1
  const heading = document.createElement('h2')
  heading.id = makeId(idPrefix, 'error-summary', 'heading')
  root.setAttribute('aria-labelledby', heading.id)
  const list = document.createElement('ul')
  root.append(heading, list)
  const items = new Map<NodeId, HTMLLIElement>()
  const tracker = createFailedSubmitTracker(runtime.submission.getSnapshot())

  const render = (errors: readonly VisibleError[]): void => {
    if (errors.length === 0) {
      root.remove()
      return
    }
    heading.textContent = messages.errorSummaryHeading({ count: errors.length })
    const seen = new Set<NodeId>()
    const ordered = errors.map((entry) => {
      seen.add(entry.nodeId)
      const existing = items.get(entry.nodeId)
      if (existing) {
        updateItem(existing, entry, idPrefix, messages)
        return existing
      }
      const li = item(entry, idPrefix, messages)
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

  const reconcile = (): void => {
    const errors = runtime.visibleErrors.getSnapshot()
    render(errors)
    if (!tracker.settle(runtime.submission.getSnapshot(), errors)) return
    if (focus && root.isConnected) root.focus()
  }

  reconcile()
  const unsubscribe = [runtime.visibleErrors.subscribe(reconcile), runtime.submission.subscribe(reconcile)]

  return {
    setMessages(next) {
      if (next === messages) return
      messages = next
      render(runtime.visibleErrors.getSnapshot())
    },
    unmount() {
      for (const off of unsubscribe) off()
      root.remove()
    },
  }
}

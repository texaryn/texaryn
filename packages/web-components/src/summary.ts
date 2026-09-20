import { visibleErrorLabel, visibleErrorMessages } from '@texaryn/core'
import type { VisibleError } from '@texaryn/core'
import { makeId } from './ids.js'
import type { Mount } from './mount.js'

export interface ErrorSummaryMount {
  unmount(): void
}

function item(entry: VisibleError, idPrefix: string): HTMLLIElement {
  const li = document.createElement('li')
  const link = document.createElement('a')
  link.href = `#${makeId(idPrefix, entry.nodeId, 'input')}`
  link.textContent = visibleErrorLabel(entry)
  li.append(link, `: ${visibleErrorMessages(entry).join(', ')}`)
  return li
}

/** Takes the Mount, not a runtime and a prefix, so the links cannot name a namespace the form was not mounted under. */
export function mountErrorSummary(container: HTMLElement, form: Mount): ErrorSummaryMount {
  const { runtime, idPrefix } = form
  const root = document.createElement('div')
  const list = document.createElement('ul')
  root.append(list)

  const render = (): void => {
    const errors = runtime.visibleErrors.getSnapshot()
    if (errors.length === 0) {
      root.remove()
      return
    }
    list.replaceChildren(...errors.map((entry) => item(entry, idPrefix)))
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

import type { RendererRegistry } from '@texaryn/core'
import { defineTexarynForm } from '@texaryn/web-components'
import type { TexarynFormElement, WidgetFactory } from '@texaryn/web-components'
import type { DomAccessibilityAdapter } from '../renderer-dom-accessibility-contract.js'

/**
 * Mounts a `<texaryn-form>` over a runtime the contract owns. `runtime` is set
 * and `port` never is, so the element borrows it and removal disposes only what
 * the element built. Both properties are set before the element is appended, so
 * it renders once with a complete configuration.
 */
export function webComponentsAdapter(
  name: string,
  createRegistry: () => RendererRegistry<WidgetFactory>,
): DomAccessibilityAdapter {
  const registry = createRegistry()
  defineTexarynForm()
  return {
    name,
    mount({ runtime, host }) {
      const element = document.createElement('texaryn-form') as TexarynFormElement
      element.registry = registry
      element.runtime = runtime
      host.append(element)
      return {
        root: host,
        async act(run) {
          run()
          // The element renders from store subscriptions, and disposal is
          // deferred to a microtask, so a macrotask covers both.
          await new Promise((resolve) => setTimeout(resolve, 0))
        },
        unmount() {
          element.remove()
        },
      }
    },
  }
}

import { useEffect, useRef } from 'react'
import type { FormRuntime, RendererRegistry } from '@texaryn/core'
import {
  createDefaultRegistry as createWcRegistry,
  defineTexarynForm,
} from '@texaryn/web-components'
import type { TexarynFormElement, WidgetFactory } from '@texaryn/web-components'

export const wcRegistry: RendererRegistry<WidgetFactory> = createWcRegistry()

// Registering a custom element is global and happens once per page, not once
// per mount, so it is not the effect's business. The call is idempotent.
defineTexarynForm()

/**
 * Renders a `<texaryn-form>` over a runtime the React shell owns.
 *
 * The element is given `runtime` and never `port`. Those are its two ownership
 * modes: a runtime it is handed is borrowed and never destroyed, while a port
 * would make the element build one of its own and destroy it on removal. A
 * second runtime here would make switching renderers preserve data only by
 * copying it, which proves nothing about the runtime being framework neutral.
 *
 * Both properties are set before the element is appended. The element only
 * renders once it is connected, so it mounts once with its full configuration
 * rather than incrementally.
 */
export function WcHost({ runtime }: { runtime: FormRuntime }) {
  const mountRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const element = document.createElement('texaryn-form') as TexarynFormElement
    element.registry = wcRegistry
    element.runtime = runtime
    mount.append(element)

    return () => {
      // Removing the element is the whole cleanup. It disposes what it created
      // and nothing else, so the borrowed runtime survives for the next
      // surface.
      element.remove()
    }
  }, [runtime])

  return <div ref={mountRef} data-testid="wc-host" />
}

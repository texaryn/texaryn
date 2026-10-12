import { useEffect, useRef } from 'react'
import type { FormRuntime, RendererRegistry } from '@texaryn/core'
import { createDefaultRegistry as createWcRegistry, mountErrorSummary, mountForm } from '@texaryn/web-components'
import type { WidgetFactory } from '@texaryn/web-components'

export const wcRegistry: RendererRegistry<WidgetFactory> = createWcRegistry()

/** Mounts the tree only Web Components renderer over the shared runtime. */
export function WcHost({ runtime }: { runtime: FormRuntime }) {
  const mountRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const mounted = mountForm(mount, runtime, {
      registry: wcRegistry,
      idPrefix: 'playground-web-components',
    })
    const summary = mountErrorSummary(mount, mounted)
    return () => {
      summary.unmount()
      mounted.unmount()
    }
  }, [runtime])

  return <div ref={mountRef} data-testid="wc-host" />
}

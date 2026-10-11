import { useEffect, useRef } from 'react'
import { createComponent } from 'solid-js'
import { render } from 'solid-js/web'
import type { FormRuntime, RendererRegistry } from '@texaryn/core'
import { createDefaultRegistry, FormRoot as SolidFormRoot } from '@texaryn/solid'
import type { WidgetComponent } from '@texaryn/solid'

export const solidRegistry: RendererRegistry<WidgetComponent> = createDefaultRegistry()

export function SolidHost({ runtime }: { runtime: FormRuntime }) {
  const mountRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const target = mountRef.current
    if (!target) return
    return render(() => createComponent(SolidFormRoot, {
      form: runtime,
      registry: solidRegistry,
      destroyOnUnmount: false,
      showErrorSummary: true,
    }), target)
  }, [runtime])

  return <div ref={mountRef} data-testid="solid-host" />
}

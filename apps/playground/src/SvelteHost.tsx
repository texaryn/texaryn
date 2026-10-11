import { useEffect, useRef } from 'react'
import { mount, unmount } from 'svelte'
import type { FormRuntime, RendererRegistry } from '@texaryn/core'
import {
  bindFormRuntime,
  createDefaultRegistry,
  FormRoot as SvelteFormRoot,
} from '@texaryn/svelte'
import type { WidgetComponent } from '@texaryn/svelte'

export const svelteRegistry: RendererRegistry<WidgetComponent> = createDefaultRegistry()

/** Renders a Svelte form over the runtime owned by the React shell. */
export function SvelteHost({ runtime }: { runtime: FormRuntime }) {
  const mountRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const target = mountRef.current
    if (!target) return

    const component = mount(SvelteFormRoot, {
      target,
      props: {
        form: bindFormRuntime(runtime),
        registry: svelteRegistry,
        destroyOnUnmount: false,
      },
    })

    return () => {
      void unmount(component)
    }
  }, [runtime])

  return <div ref={mountRef} data-testid="svelte-host" />
}

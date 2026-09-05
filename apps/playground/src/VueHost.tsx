import { useEffect, useRef } from 'react'
import { createApp, defineComponent, h } from 'vue'
import type { FormRuntime, RendererRegistry } from '@texaryn/core'
import {
  FormRoot as VueFormRoot,
  createDefaultRegistry as createVueRegistry,
  provideFormRuntime,
} from '@texaryn/vue'
import type { WidgetComponent as VueWidgetComponent } from '@texaryn/vue'

export const vueRegistry: RendererRegistry<VueWidgetComponent> = createVueRegistry()

/**
 * Renders a Vue form over a runtime the React shell owns.
 *
 * `useForm` is deliberately not used here. That composable creates a runtime
 * and destroys it with its scope, which is right for an application whose
 * form is its own and wrong here. The whole point of this host is that both
 * frameworks render the same runtime instance: a second runtime would make
 * switching renderers preserve data only by copying it, which proves nothing
 * about the runtime being framework neutral.
 *
 * `provideFormRuntime` is the lower seam that makes that possible. The Vue
 * application is created, handed the existing runtime, and unmounted when the
 * renderer changes. The runtime outlives it; only the React shell destroys it.
 */
export function VueHost({ runtime }: { runtime: FormRuntime }) {
  const mountRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const element = mountRef.current
    if (!element) return

    const app = createApp(
      defineComponent({
        setup() {
          provideFormRuntime(runtime)
          return () => h(VueFormRoot, { registry: vueRegistry })
        },
      }),
    )
    app.mount(element)

    return () => {
      // Unmounts the Vue application only. The runtime belongs to the React
      // shell and has to survive, or switching renderer would lose the form.
      app.unmount()
    }
  }, [runtime])

  return <div ref={mountRef} data-testid="vue-host" />
}

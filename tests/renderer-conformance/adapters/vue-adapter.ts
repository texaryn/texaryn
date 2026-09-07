import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { RendererRegistry } from '@texaryn/core'
import { FormRoot, provideFormRuntime } from '@texaryn/vue'
import type { WidgetComponent } from '@texaryn/vue'
import type { DomAccessibilityAdapter } from '../renderer-dom-accessibility-contract.js'

/**
 * Mounts Vue over a runtime the contract owns. A parent component provides it,
 * because a component cannot inject what it provided itself, and the wrapper is
 * attached to the host rather than left detached: two detached forms could not
 * collide on ids, which is exactly what the contract has to be able to see.
 */
export function vueAdapter(
  name: string,
  createRegistry: () => RendererRegistry<WidgetComponent>,
): DomAccessibilityAdapter {
  const registry = createRegistry()
  return {
    name,
    async mount({ runtime, host }) {
      const wrapper = mount(
        defineComponent({
          setup() {
            provideFormRuntime(runtime)
            return () => h(FormRoot, { registry })
          },
        }),
        { attachTo: host },
      )
      await nextTick()
      return {
        root: host,
        async act(run) {
          run()
          await nextTick()
          await new Promise((resolve) => setTimeout(resolve, 0))
          await nextTick()
        },
        unmount() {
          wrapper.unmount()
        },
      }
    },
  }
}

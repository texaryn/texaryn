// Vue's half of the matrix, making exactly the same two claims as React's.
//
// The mounting is genuinely different rather than differently spelled: Vue
// needs a parent that owns the runtime and provides it, because a component
// cannot inject what it provided itself, and @vue/test-utils replaces React
// Testing Library. What both share is in matrix-shared.
import { describe, it, expect, afterEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { RendererRegistry } from '@texaryn/core'
import { FormRoot, provideFormRuntime, useForm } from '@texaryn/vue'
import type { WidgetComponent } from '@texaryn/vue'
import {
  adapterFor,
  captureConsole,
  catalog,
  consoleMessage,
  emptyRenderMessage,
  widgetResolutionSuite,
} from './matrix-shared.js'

export interface VueExampleMatrixOptions {
  name: string
  createRegistry: () => RendererRegistry<WidgetComponent>
}

export function vueExampleRendererMatrix({
  name,
  createRegistry,
}: VueExampleMatrixOptions): void {
  const registry = createRegistry()

  describe(`Example matrix (${name})`, () => {
    const logs = captureConsole()
    const mounted: { unmount: () => void }[] = []

    afterEach(() => {
      // Vue reports teardown problems through the console too, so unmounting
      // has to happen while the spies are still in place.
      while (mounted.length > 0) mounted.pop()!.unmount()
    })

    widgetResolutionSuite(name, (node) => registry.resolve(node))

    describe.each(catalog)('%s', (_id, example) => {
      it('renders without throwing and without console errors', async () => {
        const port = await adapterFor(example)

        const wrapper = mount(
          defineComponent({
            setup() {
              const form = useForm(port, {
                initialData: example.initialData,
                hints: example.hints,
              })
              provideFormRuntime(form.runtime)
              return () => h(FormRoot, { registry })
            },
          }),
        )
        mounted.push(wrapper)
        await nextTick()

        expect(wrapper.element.firstChild, emptyRenderMessage(example.id)).not.toBeNull()

        // Vue routes render errors and every reactivity or prop complaint
        // through console.error and console.warn rather than throwing.
        expect(logs.errors(), consoleMessage(name, example.id, 'error')).toEqual([])
        expect(logs.warnings(), consoleMessage(name, example.id, 'warning')).toEqual([])
      })
    })
  })
}

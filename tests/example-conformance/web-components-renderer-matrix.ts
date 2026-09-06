// The Web Components half of the matrix, making exactly the same two claims
// as React's and Vue's. Mounting is genuinely different again: a custom
// element with a borrowed runtime, so the runtime is created and destroyed
// here rather than by the element. What all three share is in matrix-shared.
import { describe, it, expect, afterEach } from 'vitest'
import { createFormRuntime } from '@texaryn/core'
import type { FormRuntime, RendererRegistry } from '@texaryn/core'
import { defineTexarynForm } from '@texaryn/web-components'
import type { TexarynFormElement, WidgetFactory } from '@texaryn/web-components'
import {
  adapterFor,
  captureConsole,
  catalog,
  consoleMessage,
  emptyRenderMessage,
  widgetResolutionSuite,
} from './matrix-shared.js'

export interface WebComponentsExampleMatrixOptions {
  name: string
  createRegistry: () => RendererRegistry<WidgetFactory>
}

export function webComponentsExampleRendererMatrix({
  name,
  createRegistry,
}: WebComponentsExampleMatrixOptions): void {
  const registry = createRegistry()
  defineTexarynForm()

  describe(`Example matrix (${name})`, () => {
    const logs = captureConsole()
    const runtimes: FormRuntime[] = []

    afterEach(() => {
      document.body.replaceChildren()
      while (runtimes.length > 0) runtimes.pop()!.destroy()
    })

    widgetResolutionSuite(name, (node) => registry.resolve(node))

    describe.each(catalog)('%s', (_id, example) => {
      it('renders without throwing and without console errors', async () => {
        const port = await adapterFor(example)
        const runtime = createFormRuntime(port, {
          initialData: example.initialData,
          hints: example.hints,
        })
        runtimes.push(runtime)

        const element = document.createElement('texaryn-form') as TexarynFormElement
        element.registry = registry
        element.runtime = runtime
        document.body.append(element)

        const form = element.querySelector('form')
        expect(form?.firstChild, emptyRenderMessage(example.id)).not.toBeNull()

        // The element itself says nothing through the console, so anything
        // here is a widget or the runtime speaking and the matrix still has
        // to hear it.
        expect(logs.errors(), consoleMessage(name, example.id, 'error')).toEqual([])
        expect(logs.warnings(), consoleMessage(name, example.id, 'warning')).toEqual([])
      })
    })
  })
}

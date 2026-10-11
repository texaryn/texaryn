import { afterEach, describe, it, expect } from 'vitest'
import type { RendererRegistry } from '@texaryn/core'
import { createDefaultRegistry } from '@texaryn/svelte'
import type { WidgetComponent } from '@texaryn/svelte'
import type { TexarynExample } from '@texaryn/examples'
import {
  captureConsole,
  catalog,
  consoleMessage,
  emptyRenderMessage,
  widgetResolutionSuite,
} from './matrix-shared.js'

export interface SvelteExampleMatrixOptions {
  name: string
  createRegistry: () => RendererRegistry<WidgetComponent>
  renderExample: (
    example: TexarynExample,
    registry: RendererRegistry<WidgetComponent>,
  ) => Promise<{
    firstChild: Node | null
    unmount: () => void
  }>
}

export function svelteExampleRendererMatrix({
  name,
  createRegistry,
  renderExample,
}: SvelteExampleMatrixOptions): void {
  const registry = createRegistry()

  describe(`Example matrix (${name})`, () => {
    const logs = captureConsole()
    const mounted: { unmount: () => void }[] = []

    afterEach(() => {
      while (mounted.length > 0) mounted.pop()!.unmount()
    })

    widgetResolutionSuite(name, (node) => registry.resolve(node))

    describe.each(catalog)('%s', (_id, example) => {
      it('renders without throwing and without console errors', async () => {
        const rendered = await renderExample(example, registry)
        mounted.push(rendered)

        expect(rendered.firstChild, emptyRenderMessage(example.id)).not.toBeNull()
        expect(logs.errors(), consoleMessage(name, example.id, 'error')).toEqual([])
        expect(logs.warnings(), consoleMessage(name, example.id, 'warning')).toEqual([])
      })
    })
  })
}

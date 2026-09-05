// React's half of the matrix: mounting, and the render claim that depends on
// it. Everything framework-neutral is in matrix-shared.
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import React from 'react'
import type { RendererRegistry, SchemaEvaluationPort } from '@texaryn/core'
import { useForm, FormContext, FormRoot } from '@texaryn/react'
import type { WidgetComponent } from '@texaryn/react'
import type { TexarynExample } from '@texaryn/examples'
import {
  adapterFor,
  captureConsole,
  catalog,
  consoleMessage,
  emptyRenderMessage,
  widgetResolutionSuite,
} from './matrix-shared.js'

export interface ExampleMatrixOptions {
  name: string
  createRegistry: () => RendererRegistry<WidgetComponent>
  /** Wraps the form, for a renderer that needs a provider around it. */
  wrap?: (children: React.ReactNode) => React.ReactElement
}

function Form({
  port,
  example,
  registry,
}: {
  port: SchemaEvaluationPort
  example: TexarynExample
  registry: RendererRegistry<WidgetComponent>
}) {
  const form = useForm(port, { initialData: example.initialData, hints: example.hints })
  return (
    <FormContext.Provider value={form.runtime}>
      <FormRoot registry={registry} />
    </FormContext.Provider>
  )
}

export function exampleRendererMatrix({
  name,
  createRegistry,
  wrap = (children) => <>{children}</>,
}: ExampleMatrixOptions): void {
  const registry = createRegistry()

  describe(`Example matrix (${name})`, () => {
    const logs = captureConsole()
    afterEach(cleanup)

    widgetResolutionSuite(name, (node) => registry.resolve(node))

    describe.each(catalog)('%s', (_id, example) => {
      it('renders without throwing and without console errors', async () => {
        const port = await adapterFor(example)
        const { container } = render(
          wrap(<Form port={port} example={example} registry={registry} />),
        )

        await waitFor(() => {
          expect(container.firstChild, emptyRenderMessage(example.id)).not.toBeNull()
        })

        // React reports invalid DOM nesting, bad props and failed renders
        // through console.error, so a silent render is part of the claim.
        expect(logs.errors(), consoleMessage(name, example.id, 'error')).toEqual([])
        expect(logs.warnings(), consoleMessage(name, example.id, 'warning')).toEqual([])
      })
    })
  })
}

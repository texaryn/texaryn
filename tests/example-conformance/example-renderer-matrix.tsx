// Compatibility matrix: every advertised example against every supported
// React renderer.
//
// This asks one question the per-layer proofs do not: can every scenario the
// catalog advertises actually make it through each renderer? The semantic
// proofs live where each capability's `verification` field says they do, and
// are not repeated here.
//
// It lives outside `@texaryn/examples` on purpose. The examples package stays
// renderer-neutral data; this is a matrix over that data, so importing React
// and three design systems belongs here.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, cleanup, waitFor } from '@testing-library/react'
import React from 'react'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createFormRuntime } from '@texaryn/core'
import type { RendererRegistry, SchemaEvaluationPort, UIDocument } from '@texaryn/core'
import { useForm, FormContext, FormRoot } from '@texaryn/react'
import type { WidgetComponent } from '@texaryn/react'
import { examples } from '@texaryn/examples'
import type { TexarynExample } from '@texaryn/examples'

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
    let consoleError: ReturnType<typeof vi.spyOn>
    let consoleWarn: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
      consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    afterEach(() => {
      cleanup()
      consoleError.mockRestore()
      consoleWarn.mockRestore()
    })

    it('covers every registered example', () => {
      expect(examples.length).toBeGreaterThan(0)
    })

    describe.each(examples.map((example) => [example.id, example] as const))(
      '%s',
      (_id, example) => {
        it('renders without throwing and without console errors', async () => {
          const port = await createJsonSchemaAdapter(example.schema, {
            defaultDialect: example.dialect,
          })

          const { container } = render(wrap(<Form port={port} example={example} registry={registry} />))

          await waitFor(() => {
            expect(container.firstChild, `${example.id} rendered nothing`).not.toBeNull()
          })

          // React reports invalid DOM nesting, bad props and failed renders
          // through console.error, so a silent render is part of the claim.
          expect(
            consoleError.mock.calls.map((call) => String(call[0])),
            `${example.id} logged a console error under ${name}`,
          ).toEqual([])
          expect(
            consoleWarn.mock.calls.map((call) => String(call[0])),
            `${example.id} logged a console warning under ${name}`,
          ).toEqual([])
        })

        it('resolves a widget for every active node', async () => {
          const port = await createJsonSchemaAdapter(example.schema, {
            defaultDialect: example.dialect,
          })
          const runtime = createFormRuntime(port, {
            initialData: example.initialData,
            hints: example.hints,
          })

          const document: UIDocument = runtime.document.getSnapshot()
          const unresolved = Object.values(document.nodes)
            .filter((node) => node.visible)
            .filter((node) => registry.resolve(node) === undefined)
            .map((node) => `${node.type}:${node.dataPointer ?? 'root'}`)

          expect(
            unresolved,
            `${name} has no widget for these active nodes in ${example.id}`,
          ).toEqual([])

          runtime.destroy()
        })
      },
    )
  })
}

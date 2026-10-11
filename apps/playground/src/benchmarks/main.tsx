import { createRoot, type Root } from 'react-dom/client'
import { createFormRuntime, type FormRuntime } from '@texaryn/core'
import { FormProvider, FormRoot, createDefaultRegistry } from '@texaryn/react'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'

declare global {
  interface Window {
    __texarynBenchReady?: boolean
    __texarynBenchError?: string
    __texarynBench?: {
      mount(): Promise<number>
      unmount(): void
      data(): unknown
    }
    __texarynInputSamples?: number[]
    __texarynInputMismatches?: number
  }
}

function schemaFor(fieldCount: number) {
  const properties = Object.fromEntries(
    Array.from({ length: fieldCount }, (_, index) => [
      `field_${index}`,
      { type: 'string', title: `Field ${index}` },
    ]),
  )

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: {
      ...properties,
      enabled: { type: 'boolean', title: 'Enabled' },
    },
    allOf: [{
      if: { properties: { enabled: { const: true } } },
      then: { properties: { extra: { type: 'string', title: 'Extra' } } },
    }],
  }
}

function dataFor(fieldCount: number): Record<string, unknown> {
  return {
    ...Object.fromEntries(Array.from({ length: fieldCount }, (_, index) => [
      `field_${index}`,
      '',
    ])),
    enabled: false,
  }
}

const fieldCount = Number(new URLSearchParams(window.location.search).get('fields') ?? 50)

async function start(): Promise<void> {
  const port = await createJsonSchemaAdapter(schemaFor(fieldCount))
  const registry = createDefaultRegistry()
  const host = document.getElementById('root')
  if (!host) throw new Error('Benchmark root element is missing.')

  let runtime: FormRuntime | null = null
  let root: Root | null = null

  window.__texarynBench = {
    async mount(): Promise<number> {
      if (runtime || root) throw new Error('Benchmark form is already mounted.')
      runtime = createFormRuntime(port, { initialData: dataFor(fieldCount) })
      root = createRoot(host)
      root.render(
        <FormProvider value={runtime}>
          <FormRoot registry={registry} />
        </FormProvider>,
      )
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      return Object.keys(runtime.document.getSnapshot().nodes).length
    },
    unmount(): void {
      root?.unmount()
      runtime?.destroy()
      root = null
      runtime = null
    },
    data(): unknown {
      return runtime?.data.getSnapshot()
    },
  }

  window.__texarynBenchReady = true
}

void start().catch((error: unknown) => {
  window.__texarynBenchError = error instanceof Error ? error.stack ?? error.message : String(error)
})

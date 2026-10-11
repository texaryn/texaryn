import {
  createComponent as createAngularComponent,
  enableProdMode,
  isDevMode,
  provideZonelessChangeDetection,
  runInInjectionContext,
} from '@angular/core'
import { createApplication } from '@angular/platform-browser'
import { createRoot } from 'react-dom/client'
import { createElement } from 'react'
import { createApp, defineComponent, h } from 'vue'
import { mount as mountSvelte, unmount as unmountSvelte } from 'svelte'
import { createComponent as createSolidComponent } from 'solid-js'
import { render as renderSolid } from 'solid-js/web'
import { createFormRuntime, type FormRuntime } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import {
  FormProvider,
  FormRoot as ReactFormRoot,
  createDefaultRegistry as createReactRegistry,
} from '@texaryn/react'
import {
  FormRoot as VueFormRoot,
  createDefaultRegistry as createVueRegistry,
  provideFormRuntime,
} from '@texaryn/vue'
import {
  FormRoot as SvelteFormRoot,
  bindFormRuntime as bindSvelteFormRuntime,
  createDefaultRegistry as createSvelteRegistry,
} from '@texaryn/svelte'
import {
  FormRoot as SolidFormRoot,
  createDefaultRegistry as createSolidRegistry,
} from '@texaryn/solid'
import {
  defineTexarynForm,
  createDefaultRegistry as createWebComponentRegistry,
} from '@texaryn/web-components'
import type { TexarynFormElement } from '@texaryn/web-components'
import {
  bindFormRuntime as bindAngularFormRuntime,
  createDefaultRegistry as createAngularRegistry,
  FormRoot as AngularFormRoot,
} from '@texaryn/angular'

type Renderer = 'react' | 'vue' | 'svelte' | 'solid' | 'web-components' | 'angular'

declare global {
  interface Window {
    __texarynBenchReady?: boolean
    __texarynBenchError?: string
    __texarynBench?: {
      prepare(renderer: Renderer): void
      mount(): Promise<number>
      unmount(): Promise<void>
      data(): unknown
      startInputMeasurement(): void
    }
    __texarynInputSamples?: Array<{ enabled: boolean; elapsedMs: number }>
    __texarynInputMismatches?: number
    __texarynInputCompleted?: number
  }
}

const renderers = new Set<Renderer>([
  'react',
  'vue',
  'svelte',
  'solid',
  'web-components',
  'angular',
])

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

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

async function afterTwoFrames(): Promise<void> {
  await nextFrame()
  await nextFrame()
}

const fieldCount = Number(new URLSearchParams(window.location.search).get('fields') ?? 50)

async function start(): Promise<void> {
  if (import.meta.env.PROD) {
    enableProdMode()
    if (isDevMode()) throw new Error('Angular benchmark must run with development mode disabled.')
  }

  const port = await createJsonSchemaAdapter(schemaFor(fieldCount))
  const rootElement = document.getElementById('root')
  if (!rootElement) throw new Error('Benchmark root element is missing.')
  const host = rootElement as HTMLElement

  const registries = {
    react: createReactRegistry(),
    vue: createVueRegistry(),
    svelte: createSvelteRegistry(),
    solid: createSolidRegistry(),
    'web-components': createWebComponentRegistry(),
    angular: createAngularRegistry(),
  }

  defineTexarynForm()

  let runtime: FormRuntime | null = null
  let currentRenderer: Renderer | null = null
  let cleanupRenderer: (() => void | Promise<void>) | null = null
  let inputObserver: ((event: Event) => void) | null = null

  function hasExtraControl(): boolean {
    return Array.from(host.querySelectorAll('label')).some((label) => {
      if (!label.textContent?.trim().includes('Extra')) return false
      const control = (label as HTMLLabelElement).control
      return control !== null
        && label.closest('[hidden]') === null
        && control.closest('[hidden]') === null
    })
  }

  function stopInputMeasurement(): void {
    if (inputObserver) document.removeEventListener('input', inputObserver, true)
    inputObserver = null
  }

  window.__texarynBench = {
    prepare(renderer): void {
      if (runtime || cleanupRenderer) throw new Error('Unmount the current benchmark before preparing another.')
      if (!renderers.has(renderer)) throw new Error(`Unknown renderer: ${renderer}`)
      currentRenderer = renderer
      runtime = createFormRuntime(port, { initialData: dataFor(fieldCount) })
      host.replaceChildren()
    },

    async mount(): Promise<number> {
      if (!runtime || !currentRenderer || cleanupRenderer) {
        throw new Error('Prepare one renderer before mounting the benchmark form.')
      }

      const currentRuntime = runtime
      switch (currentRenderer) {
        case 'react': {
          const root = createRoot(host)
          root.render(createElement(
            FormProvider,
            { value: currentRuntime },
            createElement(ReactFormRoot, { registry: registries.react }),
          ))
          cleanupRenderer = () => root.unmount()
          break
        }
        case 'vue': {
          const app = createApp(defineComponent({
            setup() {
              provideFormRuntime(currentRuntime)
              return () => h(VueFormRoot, { registry: registries.vue })
            },
          }))
          app.mount(host)
          cleanupRenderer = () => app.unmount()
          break
        }
        case 'svelte': {
          const component = mountSvelte(SvelteFormRoot, {
            target: host,
            props: {
              form: bindSvelteFormRuntime(currentRuntime),
              registry: registries.svelte,
              destroyOnUnmount: false,
              showErrorSummary: false,
            },
          })
          cleanupRenderer = () => unmountSvelte(component)
          break
        }
        case 'solid': {
          cleanupRenderer = renderSolid(() => createSolidComponent(SolidFormRoot, {
            form: currentRuntime,
            registry: registries.solid,
            destroyOnUnmount: false,
            showErrorSummary: false,
          }), host)
          break
        }
        case 'web-components': {
          const element = document.createElement('texaryn-form') as TexarynFormElement
          element.registry = registries['web-components']
          element.runtime = currentRuntime
          host.append(element)
          cleanupRenderer = () => element.remove()
          break
        }
        case 'angular': {
          const application = await createApplication({
            providers: [provideZonelessChangeDetection()],
          })
          const form = runInInjectionContext(
            application.injector,
            () => bindAngularFormRuntime(currentRuntime),
          )
          const component = createAngularComponent(AngularFormRoot, {
            environmentInjector: application.injector,
            hostElement: document.createElement('texaryn-form-root'),
          })
          component.setInput('form', form)
          component.setInput('registry', registries.angular)
          component.setInput('idPrefix', 'texaryn-benchmark')
          host.append(component.location.nativeElement)
          application.attachView(component.hostView)
          cleanupRenderer = () => {
            application.detachView(component.hostView)
            component.destroy()
            application.destroy()
          }
          break
        }
      }

      await afterTwoFrames()

      const inputs = Array.from(host.querySelectorAll('input'))
      const visibleInputs = inputs.filter((input) => input.closest('[hidden]') === null)
      const checkboxes = visibleInputs.filter((input) => input.type === 'checkbox')
      if (visibleInputs.length !== fieldCount + 1 || checkboxes.length !== 1) {
        const details = inputs.map((input) =>
          `${input.type}:${input.name}:${input.labels?.[0]?.textContent?.trim() ?? ''}${input.closest('[hidden]') ? ' (hidden)' : ''}`,
        ).join(', ')
        throw new Error(`${currentRenderer} rendered ${visibleInputs.length} visible controls and ${checkboxes.length} checkboxes: ${details}`)
      }
      if (hasExtraControl()) throw new Error(`${currentRenderer} rendered the conditional control before activation.`)

      return Object.keys(currentRuntime.document.getSnapshot().nodes).length
    },

    async unmount(): Promise<void> {
      stopInputMeasurement()
      await cleanupRenderer?.()
      cleanupRenderer = null
      runtime?.destroy()
      runtime = null
      currentRenderer = null
      host.replaceChildren()
    },

    data(): unknown {
      return runtime?.data.getSnapshot()
    },

    startInputMeasurement(): void {
      if (!runtime || !currentRenderer) throw new Error('Mount a form before measuring input transitions.')
      const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]')
      if (!checkbox) throw new Error(`${currentRenderer} has no checkbox for the transition benchmark.`)

      stopInputMeasurement()
      window.__texarynInputSamples = []
      window.__texarynInputMismatches = 0
      window.__texarynInputCompleted = 0

      inputObserver = (event: Event) => {
        if (!(event.target instanceof HTMLInputElement) || !host.contains(event.target)) return
        const target = event.target
        if (target.type !== 'checkbox') return

        const startedAt = event.timeStamp
        const expected = target.checked
        let frames = 0
        const observe = () => {
          const currentData = runtime?.data.getSnapshot() as { enabled?: unknown } | undefined
          if (currentData?.enabled === expected && hasExtraControl() === expected) {
            window.__texarynInputSamples?.push({
              enabled: expected,
              elapsedMs: performance.now() - startedAt,
            })
            window.__texarynInputCompleted = (window.__texarynInputCompleted ?? 0) + 1
            return
          }
          frames++
          if (frames >= 120) {
            window.__texarynInputMismatches = (window.__texarynInputMismatches ?? 0) + 1
            window.__texarynInputCompleted = (window.__texarynInputCompleted ?? 0) + 1
            return
          }
          requestAnimationFrame(observe)
        }
        requestAnimationFrame(observe)
      }

      document.addEventListener('input', inputObserver, true)
    },
  }

  window.__texarynBenchReady = true
}

void start().catch((error: unknown) => {
  window.__texarynBenchError = error instanceof Error ? error.stack ?? error.message : String(error)
})

import {
  createComponent as createAngularComponent,
  enableProdMode,
  isDevMode,
  provideZonelessChangeDetection,
  runInInjectionContext,
} from '@angular/core'
import { createApplication } from '@angular/platform-browser'
import { createRoot } from 'react-dom/client'
import { createElement, Fragment } from 'react'
import { createApp, defineComponent, h } from 'vue'
import { mount as mountSvelte, unmount as unmountSvelte } from 'svelte'
import { createComponent as createSolidComponent } from 'solid-js'
import { render as renderSolid } from 'solid-js/web'
import RjsfForm, { type FormProps as RjsfFormProps } from '@rjsf/core'
import rjsfValidator from '@rjsf/validator-ajv8'
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
type BenchmarkTarget = Renderer | 'rjsf'

declare global {
  interface Window {
    __texarynBenchReady?: boolean
    __texarynBenchError?: string
    __texarynBench?: {
      prepare(renderer: BenchmarkTarget): Promise<void>
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

function schemaFor(fieldCount: number, draft: '2020-12' | 'draft-07' = '2020-12') {
  const properties = Object.fromEntries(
    Array.from({ length: fieldCount }, (_, index) => [
      `field_${index}`,
      { type: 'string', title: `Field ${index}` },
    ]),
  )

  return {
    $schema: draft === 'draft-07'
      ? 'http://json-schema.org/draft-07/schema#'
      : 'https://json-schema.org/draft/2020-12/schema',
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
const libraryComparison = new URLSearchParams(window.location.search).get('suite') === 'library'

async function start(): Promise<void> {
  if (import.meta.env.PROD) {
    enableProdMode()
    if (isDevMode()) throw new Error('Angular benchmark must run with development mode disabled.')
  }

  const schema = schemaFor(fieldCount, libraryComparison ? 'draft-07' : '2020-12')
  const port = libraryComparison ? null : await createJsonSchemaAdapter(schema)
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
  let currentRenderer: BenchmarkTarget | null = null
  let rjsfData: unknown = null
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

  function formRuntimeForMount(): FormRuntime {
    if (!runtime) throw new Error('Texaryn runtime is missing.')
    return runtime
  }

  function mountRjsf(): void {
    const root = createRoot(host)
    root.render(createElement(RjsfForm, {
      schema: schema as RjsfFormProps['schema'],
      validator: rjsfValidator,
      formData: rjsfData,
      idPrefix: 'texaryn-benchmark',
      tagName: 'div',
      liveValidate: false,
      onChange: (event) => { rjsfData = event.formData },
    }, createElement(Fragment)))
    cleanupRenderer = () => root.unmount()
  }

  function mountReact(): void {
    const root = createRoot(host)
    root.render(createElement(
      FormProvider,
      { value: formRuntimeForMount() },
      createElement(ReactFormRoot, { registry: registries.react }),
    ))
    cleanupRenderer = () => root.unmount()
  }

  function mountVue(): void {
    const currentRuntime = formRuntimeForMount()
    const app = createApp(defineComponent({
      setup() {
        provideFormRuntime(currentRuntime)
        return () => h(VueFormRoot, { registry: registries.vue })
      },
    }))
    app.mount(host)
    cleanupRenderer = () => app.unmount()
  }

  function mountSvelteRenderer(): void {
    const component = mountSvelte(SvelteFormRoot, {
      target: host,
      props: {
        form: bindSvelteFormRuntime(formRuntimeForMount()),
        registry: registries.svelte,
        destroyOnUnmount: false,
        showErrorSummary: false,
      },
    })
    cleanupRenderer = () => unmountSvelte(component)
  }

  function mountSolid(): void {
    cleanupRenderer = renderSolid(() => createSolidComponent(SolidFormRoot, {
      form: formRuntimeForMount(),
      registry: registries.solid,
      destroyOnUnmount: false,
      showErrorSummary: false,
    }), host)
  }

  function mountWebComponents(): void {
    const element = document.createElement('texaryn-form') as TexarynFormElement
    element.registry = registries['web-components']
    element.runtime = formRuntimeForMount()
    host.append(element)
    cleanupRenderer = () => element.remove()
  }

  async function mountAngular(): Promise<void> {
    const currentRuntime = formRuntimeForMount()
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
  }

  const mountRenderers: Record<BenchmarkTarget, () => void | Promise<void>> = {
    rjsf: mountRjsf,
    react: mountReact,
    vue: mountVue,
    svelte: mountSvelteRenderer,
    solid: mountSolid,
    'web-components': mountWebComponents,
    angular: mountAngular,
  }

  window.__texarynBench = {
    async prepare(renderer): Promise<void> {
      if (runtime || cleanupRenderer) throw new Error('Unmount the current benchmark before preparing another.')
      if (renderer !== 'rjsf' && !renderers.has(renderer)) throw new Error(`Unknown renderer: ${renderer}`)
      currentRenderer = renderer
      if (renderer === 'rjsf') {
        runtime = null
        rjsfData = dataFor(fieldCount)
      } else {
        const rendererPort = libraryComparison ? await createJsonSchemaAdapter(schema) : port
        if (!rendererPort) throw new Error('Texaryn schema adapter is missing.')
        runtime = createFormRuntime(rendererPort, { initialData: dataFor(fieldCount) })
        rjsfData = null
      }
      host.replaceChildren()
    },

    async mount(): Promise<number> {
      const renderer = currentRenderer
      if (!renderer || cleanupRenderer || (renderer !== 'rjsf' && !runtime)) {
        throw new Error('Prepare one renderer before mounting the benchmark form.')
      }

      await mountRenderers[renderer]()

      await afterTwoFrames()

      const inputs = Array.from(host.querySelectorAll('input'))
      const visibleInputs = inputs.filter((input) => input.closest('[hidden]') === null)
      const checkboxes = visibleInputs.filter((input) => input.type === 'checkbox')
      if (visibleInputs.length !== fieldCount + 1 || checkboxes.length !== 1) {
        const details = inputs.map((input) =>
          `${input.type}:${input.name}:${input.labels?.[0]?.textContent?.trim() ?? ''}${input.closest('[hidden]') ? ' (hidden)' : ''}`,
        ).join(', ')
        throw new Error(`${renderer} rendered ${visibleInputs.length} visible controls and ${checkboxes.length} checkboxes: ${details}`)
      }
      if (hasExtraControl()) throw new Error(`${renderer} rendered the conditional control before activation.`)

      return runtime
        ? Object.keys(runtime.document.getSnapshot().nodes).length
        : visibleInputs.length
    },

    async unmount(): Promise<void> {
      stopInputMeasurement()
      await cleanupRenderer?.()
      cleanupRenderer = null
      runtime?.destroy()
      runtime = null
      rjsfData = null
      currentRenderer = null
      host.replaceChildren()
    },

    data(): unknown {
      return runtime?.data.getSnapshot() ?? rjsfData
    },

    startInputMeasurement(): void {
      if (!currentRenderer || (currentRenderer !== 'rjsf' && !runtime)) {
        throw new Error('Mount a form before measuring input transitions.')
      }
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
          const currentData = (runtime?.data.getSnapshot() ?? rjsfData) as { enabled?: unknown } | undefined
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

try {
  await start()
} catch (error: unknown) {
  window.__texarynBenchError = error instanceof Error ? error.stack ?? error.message : String(error)
}

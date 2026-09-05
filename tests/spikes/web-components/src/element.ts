import { createFormRuntime } from '@texaryn/core'
import type { FormRuntime, FormRuntimeOptions, RendererRegistry, SchemaEvaluationPort } from '@texaryn/core'
import { nextInstancePrefix } from './ids.js'
import { mountForm } from './mount.js'
import type { Mount } from './mount.js'
import type { WidgetFactory } from './widget.js'

/**
 * `runtime` is the primitive input: an external runtime the element renders
 * and never destroys. `port` plus `options` is the managed mode, where the
 * element creates a runtime of its own and destroys it on removal. The two
 * sources are mutually exclusive.
 */
export class TexarynFormElement extends HTMLElement {
  #external: FormRuntime | null = null
  #owned: FormRuntime | null = null
  #port: SchemaEvaluationPort | null = null
  #options: FormRuntimeOptions = {}
  #registry: RendererRegistry<WidgetFactory> | null = null
  #form: HTMLFormElement | null = null
  #mount: Mount | null = null
  #mountedRuntime: FormRuntime | null = null
  #mountedRegistry: RendererRegistry<WidgetFactory> | null = null
  #unsubscribe: Array<() => void> = []
  readonly idPrefix = nextInstancePrefix()

  get runtime(): FormRuntime | null {
    return this.#external ?? this.#owned
  }
  set runtime(runtime: FormRuntime | null) {
    if (runtime && this.#port) {
      throw new Error('<texaryn-form>: runtime and port are mutually exclusive; clear port first')
    }
    this.#external = runtime
    this.#render()
  }

  get port(): SchemaEvaluationPort | null {
    return this.#port
  }
  set port(port: SchemaEvaluationPort | null) {
    if (port && this.#external) {
      throw new Error('<texaryn-form>: runtime and port are mutually exclusive; clear runtime first')
    }
    if (this.#owned) {
      this.#unmount()
      this.#owned.destroy()
      this.#owned = null
    }
    this.#port = port
    this.#render()
  }

  get options(): FormRuntimeOptions {
    return this.#options
  }
  /** Read when the managed runtime is created, so set it before `port`. */
  set options(options: FormRuntimeOptions) {
    this.#options = options ?? {}
  }

  get registry(): RendererRegistry<WidgetFactory> | null {
    return this.#registry
  }
  set registry(registry: RendererRegistry<WidgetFactory> | null) {
    this.#registry = registry
    this.#render()
  }

  connectedCallback(): void {
    this.#render()
  }

  disconnectedCallback(): void {
    // A reparent fires disconnected then connected in the same task. Only an
    // element still detached afterwards was removed.
    queueMicrotask(() => {
      if (!this.isConnected) this.#dispose()
    })
  }

  #render(): void {
    if (!this.isConnected) return
    if (!this.#owned && this.#port && !this.#external) {
      this.#owned = createFormRuntime(this.#port, this.#options)
    }
    const runtime = this.runtime
    if (!runtime || !this.#registry) return
    if (this.#mount && this.#mountedRuntime === runtime && this.#mountedRegistry === this.#registry) {
      return
    }
    this.#unmount()
    const form = this.#ensureForm()
    this.#mount = mountForm(form, runtime, this.#registry, this.idPrefix)
    this.#mountedRuntime = runtime
    this.#mountedRegistry = this.#registry
    this.#unsubscribe.push(
      runtime.data.subscribe(() => {
        this.dispatchEvent(
          new CustomEvent('texaryn-data-change', { detail: runtime.data.getSnapshot(), bubbles: true }),
        )
      }),
      runtime.submission.subscribe(() => {
        this.dispatchEvent(
          new CustomEvent('texaryn-submission-change', {
            detail: runtime.submission.getSnapshot(),
            bubbles: true,
          }),
        )
      }),
    )
  }

  #ensureForm(): HTMLFormElement {
    if (this.#form) return this.#form
    const form = document.createElement('form')
    form.noValidate = true
    form.addEventListener('submit', (event) => {
      event.preventDefault()
      this.runtime?.dispatch({ type: 'Submit' })
    })
    this.append(form)
    this.#form = form
    return form
  }

  #unmount(): void {
    for (const off of this.#unsubscribe) off()
    this.#unsubscribe = []
    this.#mount?.unmount()
    this.#mount = null
    this.#mountedRuntime = null
    this.#mountedRegistry = null
  }

  #dispose(): void {
    this.#unmount()
    if (this.#owned) {
      this.#owned.destroy()
      this.#owned = null
    }
  }
}

export function defineTexarynForm(tagName = 'texaryn-form'): typeof TexarynFormElement {
  if (!customElements.get(tagName)) customElements.define(tagName, TexarynFormElement)
  return TexarynFormElement
}

import { createFormRuntime, englishMessages } from '@texaryn/core'
import type {
  FormMessages,
  FormRuntime,
  FormRuntimeOptions,
  RendererRegistry,
  SchemaEvaluationPort,
} from '@texaryn/core'
import { nextInstancePrefix } from './ids.js'
import { mountForm } from './mount.js'
import type { Mount } from './mount.js'
import { mountErrorSummary } from './summary.js'
import type { ErrorSummaryMount } from './summary.js'
import type { WidgetFactory } from './widget.js'

/**
 * `runtime` is the primitive input: an external runtime the element renders
 * and never destroys. `port` plus `options` is the managed mode, where the
 * element creates a runtime of its own and destroys it on removal. The two
 * sources are mutually exclusive.
 */
export interface TexarynFormElement extends HTMLElement {
  /** Borrowed: assigned from outside, rendered, and never destroyed by the element. */
  runtime: FormRuntime | null
  /** Managed: the element builds a runtime from this and destroys it on removal. */
  port: SchemaEvaluationPort | null
  /** Read when the managed runtime is created, so set it before `port`. */
  options: FormRuntimeOptions
  registry: RendererRegistry<WidgetFactory> | null
  /** The whole set, or English. Setting it on a mounted element switches the copy in place. */
  messages: FormMessages
  readonly idPrefix: string
  /** Reflected to the `error-summary` attribute. While true, the summary is the first child of the element's form. */
  errorSummary: boolean
  /** Reflected as the `error-summary` value `no-focus`. Off for all but one summary when one runtime is rendered twice. */
  errorSummaryFocus: boolean
}

let elementClass: CustomElementConstructor | null = null

/**
 * Builds the class on first use rather than at module load. It extends
 * `HTMLElement`, which does not exist outside a browser, and a package that
 * throws on import cannot be loaded by a server rendered application or by any
 * tool that merely resolves it.
 */
export function texarynFormElementClass(): CustomElementConstructor {
  if (elementClass) return elementClass

  class TexarynForm extends HTMLElement {
    static get observedAttributes(): string[] {
      return ['error-summary']
    }

    #external: FormRuntime | null = null
    #owned: FormRuntime | null = null
    #port: SchemaEvaluationPort | null = null
    #options: FormRuntimeOptions = {}
    #registry: RendererRegistry<WidgetFactory> | null = null
    #messages: FormMessages = englishMessages
    #form: HTMLFormElement | null = null
    #mount: Mount | null = null
    #mountedRuntime: FormRuntime | null = null
    #mountedRegistry: RendererRegistry<WidgetFactory> | null = null
    #unsubscribe: Array<() => void> = []
    #prefix: string | null = null
    #errorSummary = false
    #summary: ErrorSummaryMount | null = null
    #errorSummaryFocus = true

    /** The element's own id when it has one on first use, else an allocated `texaryn-<n>`; fixed for the element's lifetime. */
    get idPrefix(): string {
      this.#prefix ??= this.id || nextInstancePrefix()
      return this.#prefix
    }

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
    /** Read when the managed runtime is created; setting it afterwards changes nothing until `port` is set again. */
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

    get messages(): FormMessages {
      return this.#messages
    }
    set messages(messages: FormMessages) {
      this.#messages = messages ?? englishMessages
      this.#mount?.setMessages(this.#messages)
      this.#summary?.setMessages(this.#messages)
    }

    get errorSummary(): boolean {
      return this.#errorSummary
    }
    set errorSummary(on: boolean) {
      const next = Boolean(on)
      if (next === this.#errorSummary) return
      this.#errorSummary = next
      if (next) this.setAttribute('error-summary', this.#errorSummaryFocus ? '' : 'no-focus')
      else this.removeAttribute('error-summary')
      this.#reconcileSummary()
    }

    get errorSummaryFocus(): boolean {
      return this.#errorSummaryFocus
    }
    set errorSummaryFocus(on: boolean) {
      const next = Boolean(on)
      if (next === this.#errorSummaryFocus) return
      this.#errorSummaryFocus = next
      if (this.#errorSummary) this.setAttribute('error-summary', next ? '' : 'no-focus')
      if (this.#summary) {
        this.#summary.unmount()
        this.#summary = null
        this.#reconcileSummary()
      }
    }

    attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
      if (name !== 'error-summary') return
      this.errorSummary = value !== null
      if (value !== null) this.errorSummaryFocus = value !== 'no-focus'
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
      this.#mount = mountForm(form, runtime, {
        registry: this.#registry,
        idPrefix: this.idPrefix,
        messages: this.#messages,
      })
      this.#mountedRuntime = runtime
      this.#mountedRegistry = this.#registry
      this.#reconcileSummary()
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
      this.#summary?.unmount()
      this.#summary = null
      this.#mount?.unmount()
      this.#mount = null
      this.#mountedRuntime = null
      this.#mountedRegistry = null
    }

    #reconcileSummary(): void {
      const wanted = this.#errorSummary && this.#mount !== null && this.#form !== null
      if (wanted && !this.#summary) {
        this.#summary = mountErrorSummary(this.#form!, this.#mount!, { focus: this.#errorSummaryFocus })
      }
      if (!wanted && this.#summary) {
        this.#summary.unmount()
        this.#summary = null
      }
    }

    #dispose(): void {
      this.#unmount()
      if (this.#owned) {
        this.#owned.destroy()
        this.#owned = null
      }
    }
  }

  elementClass = TexarynForm
  return elementClass
}

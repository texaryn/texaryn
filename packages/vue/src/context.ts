import { inject, provide } from 'vue'
import type { InjectionKey } from 'vue'
import type { FormRuntime, RendererRegistry } from '@texaryn/core'
import type { WidgetComponent } from './widget.js'

export const FormRuntimeKey: InjectionKey<FormRuntime> = Symbol('texaryn.runtime')
export const RendererRegistryKey: InjectionKey<RendererRegistry<WidgetComponent>> =
  Symbol('texaryn.registry')

export function provideFormRuntime(runtime: FormRuntime): void {
  provide(FormRuntimeKey, runtime)
}

export function useFormRuntime(): FormRuntime {
  const runtime = inject(FormRuntimeKey, null)
  if (!runtime) {
    throw new Error('useFormRuntime must be used under a component that called provideFormRuntime')
  }
  return runtime
}

export function provideRendererRegistry(registry: RendererRegistry<WidgetComponent>): void {
  provide(RendererRegistryKey, registry)
}

/**
 * Provided once by FormRoot rather than per node.
 *
 * React re-provides it at every NodeRenderer because a context value has to
 * sit above the component that reads it in the element tree it builds. Vue's
 * inject walks the component parent chain, so one provide at the root reaches
 * every widget however deeply nested, and repeating it per node would create
 * an injection scope per node for no gain.
 */
export function useRendererRegistry(): RendererRegistry<WidgetComponent> {
  const registry = inject(RendererRegistryKey, null)
  if (!registry) {
    throw new Error('useRendererRegistry must be used inside a FormRoot tree')
  }
  return registry
}

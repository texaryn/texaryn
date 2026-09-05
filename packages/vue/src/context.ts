import { computed, inject, provide, toValue } from 'vue'
import type { ComputedRef, InjectionKey, MaybeRefOrGetter } from 'vue'
import type { FormRuntime, RendererRegistry } from '@texaryn/core'
import type { WidgetComponent } from './widget.js'

export const FormRuntimeKey: InjectionKey<FormRuntime> = Symbol('texaryn.runtime')
export const RendererRegistryKey: InjectionKey<ComputedRef<RendererRegistry<WidgetComponent>>> =
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

/**
 * The registry is provided as a computed rather than a value, so a caller
 * that swaps renderers re-resolves the tree it already has.
 *
 * Providing the value itself would freeze the tree on whichever renderer was
 * selected when it mounted. React gets this free by re-providing on every
 * render; Vue provides once, so the reactivity has to be in what is provided.
 * The playground switches renderer without remounting the form, because the
 * runtime belongs to the example rather than to the presentation over it.
 */
export function provideRendererRegistry(
  registry: MaybeRefOrGetter<RendererRegistry<WidgetComponent>>,
): void {
  provide(RendererRegistryKey, computed(() => toValue(registry)))
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
export function useRendererRegistry(): ComputedRef<RendererRegistry<WidgetComponent>> {
  const registry = inject(RendererRegistryKey, null)
  if (!registry) {
    throw new Error('useRendererRegistry must be used inside a FormRoot tree')
  }
  return registry
}

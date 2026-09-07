import { inject, provide, useId } from 'vue'
import type { InjectionKey } from 'vue'

export const IdPrefixKey: InjectionKey<string> = Symbol('texaryn.idPrefix')

/**
 * Vue's useId output format is not part of its contract, so encoding each code
 * point to base 36 keeps the seed injective and identical between a server and
 * a client render while restricting it to characters that need no escaping in
 * a selector or a stylesheet.
 */
function encodeSeed(seed: string): string {
  return Array.from(seed, (char) => char.codePointAt(0)!.toString(36)).join('_')
}

/**
 * Called from provideFormRuntime, so the namespace covers the whole
 * provisioning scope rather than only what FormRoot renders.
 *
 * Uniqueness is per Vue application, not per page: independent apps need
 * distinct `app.config.idPrefix` values to stay disjoint.
 */
export function provideIdPrefix(): void {
  provide(IdPrefixKey, `texaryn-${encodeSeed(useId())}`)
}

export function useFormIdPrefix(): string {
  const prefix = inject(IdPrefixKey, null)
  if (!prefix) {
    throw new Error(
      'No id prefix in scope. Call provideFormRuntime in the component that owns the form; ' +
        'without it two forms on one page share ids.',
    )
  }
  return prefix
}

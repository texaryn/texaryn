import { createContext, useContext, useId } from 'react'

const IdPrefixContext = createContext<string | null>(null)

export const IdPrefixProvider = IdPrefixContext.Provider

/**
 * React's useId output format is not part of its contract, and React 18 emits
 * colons, which are legal in an id but must be escaped before they reach
 * querySelector or a stylesheet. Encoding each code point to base 36 keeps the
 * seed injective and server/client deterministic while restricting it to
 * characters that need no escaping, so a generated id stays usable as written.
 */
function encodeSeed(seed: string): string {
  return Array.from(seed, (char) => char.codePointAt(0)!.toString(36)).join('_')
}

export function useGeneratedIdPrefix(): string {
  return `texaryn-${encodeSeed(useId())}`
}

/**
 * The DOM namespace of one rendering surface.
 *
 * Uniqueness is per React application, not per page: two independent roots
 * need distinct `identifierPrefix` options to stay disjoint.
 */
export function useFormIdPrefix(): string {
  const prefix = useContext(IdPrefixContext)
  if (!prefix) {
    throw new Error(
      'No id prefix in scope. Render the form under <FormProvider value={runtime}>; ' +
        'FormContext.Provider alone cannot namespace ids, which is what makes two forms collide.',
    )
  }
  return prefix
}

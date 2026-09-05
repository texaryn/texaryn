// URL state for the playground, kept pure so it can be tested without a DOM.
//
// The example lives in the path and the renderer in the query, so a shared
// link reproduces what someone was looking at. Form data stays out of the URL.
//
// `base` is where the application is mounted, and everything after it is the
// example id. The mount point is configuration: `/playground/` in development
// and `/texaryn/playground/` on Pages. This parser does not know the word
// "playground", so moving the mount is a config change rather than a code
// change.

export const RENDERER_KEYS = ['default', 'bootstrap', 'mui', 'vue'] as const
export type RendererKey = (typeof RENDERER_KEYS)[number]

export const DEFAULT_RENDERER: RendererKey = 'default'

export interface PlaygroundLocation {
  exampleId: string | null
  renderer: RendererKey
}

function isRendererKey(value: string | null): value is RendererKey {
  return value !== null && (RENDERER_KEYS as readonly string[]).includes(value)
}

function stripBase(pathname: string, base: string): string {
  const normalisedBase = base.endsWith('/') ? base : `${base}/`
  const withLeadingSlash = pathname.startsWith('/') ? pathname : `/${pathname}`
  if (withLeadingSlash.startsWith(normalisedBase)) {
    return withLeadingSlash.slice(normalisedBase.length)
  }
  return withLeadingSlash.replace(/^\//, '')
}

/** An unknown renderer falls back rather than leaving the app in a broken state. */
export function parseLocation(
  pathname: string,
  search: string,
  base = '/',
): PlaygroundLocation {
  const rest = stripBase(pathname, base).replace(/\/$/, '')
  const rawRenderer = new URLSearchParams(search).get('renderer')

  return {
    exampleId: rest === '' ? null : decodeURIComponent(rest),
    renderer: isRendererKey(rawRenderer) ? rawRenderer : DEFAULT_RENDERER,
  }
}

export function formatLocation(
  { exampleId, renderer }: PlaygroundLocation,
  base = '/',
): string {
  const normalisedBase = base.endsWith('/') ? base : `${base}/`
  const path = exampleId
    ? `${normalisedBase}${encodeURIComponent(exampleId)}`
    : normalisedBase
  // The default renderer is the absence of the parameter, so the common URL
  // stays clean and a shared link only carries a deliberate choice.
  return renderer === DEFAULT_RENDERER ? path : `${path}?renderer=${renderer}`
}

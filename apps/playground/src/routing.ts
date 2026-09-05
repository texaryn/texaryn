// URL state for the playground, kept pure so it can be tested without a DOM.
//
// The example lives in the path and the renderer in the query, so a shared
// link reproduces what someone was looking at. Form data stays out of the URL.
//
// Paths are relative to Vite's base, because Pages serves the app from
// /texaryn/ rather than the origin root.

export const RENDERER_KEYS = ['default', 'bootstrap', 'mui'] as const
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
  const rest = stripBase(pathname, base)
  const match = /^playground\/(.+?)\/?$/.exec(rest)
  const rawRenderer = new URLSearchParams(search).get('renderer')

  return {
    exampleId: match ? decodeURIComponent(match[1]) : null,
    renderer: isRendererKey(rawRenderer) ? rawRenderer : DEFAULT_RENDERER,
  }
}

export function formatLocation(
  { exampleId, renderer }: PlaygroundLocation,
  base = '/',
): string {
  const normalisedBase = base.endsWith('/') ? base : `${base}/`
  const path = exampleId
    ? `${normalisedBase}playground/${encodeURIComponent(exampleId)}`
    : normalisedBase
  // The default renderer is the absence of the parameter, so the common URL
  // stays clean and a shared link only carries a deliberate choice.
  return renderer === DEFAULT_RENDERER ? path : `${path}?renderer=${renderer}`
}

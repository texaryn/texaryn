// The theme preference, as one contract shared by the two applications in the
// deployed artifact: the documentation site at the base and the playground
// under it. Same origin, so one `localStorage` key reaches both, and neither
// carries its own copy of the key, the attribute or the resolution rule.
//
// The preference is not the mode. `auto` is a preference; the attribute always
// carries a resolved `light` or `dark`. That split is deliberate: a
// `prefers-color-scheme` block in CSS would be a second authority, and it
// would win over an explicit Light choice whenever the two disagreed. The
// only thing that resolves `auto` is the script, and the only thing a
// stylesheet ever sees is the answer.
//
// Texaryn's key rather than Starlight's. Starlight stores its own preference
// under `starlight-theme` and writes an empty string for auto, so reading it
// would make an implementation detail of a documentation theme into the
// contract between two applications, with a value whose meaning is not
// guessable from its shape.

/** @typedef {'auto' | 'light' | 'dark'} ThemePreference */
/** @typedef {'light' | 'dark'} ResolvedTheme */

export const THEME_STORAGE_KEY = 'texaryn-theme'
export const THEME_ATTRIBUTE = 'data-theme'
export const DARK_QUERY = '(prefers-color-scheme: dark)'

/** @type {readonly ThemePreference[]} */
export const THEME_PREFERENCES = ['auto', 'light', 'dark']

/** @type {ThemePreference} */
export const DEFAULT_THEME_PREFERENCE = 'auto'

/**
 * Anything unrecognised is the default rather than an error. A stored value
 * can come from an older release or another tab, and a preference is not
 * worth failing a page load over.
 *
 * @param {unknown} value
 * @returns {ThemePreference}
 */
export function parseThemePreference(value) {
  return /** @type {readonly unknown[]} */ (THEME_PREFERENCES).includes(value)
    ? /** @type {ThemePreference} */ (value)
    : DEFAULT_THEME_PREFERENCE
}

/**
 * @param {ThemePreference} preference
 * @param {boolean} prefersDark
 * @returns {ResolvedTheme}
 */
export function resolveTheme(preference, prefersDark) {
  if (preference === 'light' || preference === 'dark') return preference
  return prefersDark ? 'dark' : 'light'
}

/**
 * The inline script both applications run in `<head>`, before the first paint.
 * It cannot import, so it carries the resolution rule in its own source; a
 * test runs it against every input and compares it with `resolveTheme`, which
 * is what keeps the two from drifting apart.
 *
 * Wrapped in try/catch because reading `localStorage` throws outright in some
 * privacy modes, and a boot script that throws leaves the document with no
 * theme attribute at all.
 *
 * @returns {string}
 */
export function themeBootScript() {
  const key = JSON.stringify(THEME_STORAGE_KEY)
  const attribute = JSON.stringify(THEME_ATTRIBUTE)
  const query = JSON.stringify(DARK_QUERY)
  const preferences = JSON.stringify(THEME_PREFERENCES)
  const fallback = JSON.stringify(DEFAULT_THEME_PREFERENCE)

  return (
    '(function(){try{' +
    `var p=localStorage.getItem(${key});` +
    `if(${preferences}.indexOf(p)<0){p=${fallback}}` +
    `var m=(p==="light"||p==="dark")?p:(window.matchMedia(${query}).matches?"dark":"light");` +
    `document.documentElement.setAttribute(${attribute},m);` +
    '}catch(e){}})();'
  )
}

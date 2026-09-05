// The one place that resolves a theme. Nothing else in the playground reads
// `localStorage` or `matchMedia`: renderers receive an already resolved
// `light` or `dark` through their own adapter, so there is a single authority
// and adding a fifth renderer cannot introduce a second one.
import { useCallback, useEffect, useState } from 'react'
import {
  DARK_QUERY,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  parseThemePreference,
  resolveTheme,
} from '../../../theme.config.mjs'

export type ThemePreference = 'auto' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

export interface ThemeState {
  preference: ThemePreference
  resolved: ResolvedTheme
  setPreference: (preference: ThemePreference) => void
}

function readPreference(): ThemePreference {
  try {
    return parseThemePreference(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    // Reading storage throws outright in some privacy modes. A preference
    // nobody can persist is still a preference for this page.
    return parseThemePreference(null)
  }
}

export function useTheme(): ThemeState {
  const [preference, setStoredPreference] = useState<ThemePreference>(readPreference)
  const [prefersDark, setPrefersDark] = useState(
    () => window.matchMedia(DARK_QUERY).matches,
  )

  // Subscribed whatever the preference is. `resolveTheme` ignores the system
  // answer unless the preference is `auto`, so an explicit choice is unmoved
  // by the OS changing, and switching back to `auto` is already up to date
  // rather than waiting for the next change.
  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY)
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches)
    setPrefersDark(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolved: ResolvedTheme = resolveTheme(preference, prefersDark)

  // The boot script stamped this before the first paint; keeping it in sync is
  // this effect's only job. The attribute carries the resolved mode, never the
  // preference, so no stylesheet ever has to know what `auto` means.
  useEffect(() => {
    document.documentElement.setAttribute(THEME_ATTRIBUTE, resolved)
  }, [resolved])

  const setPreference = useCallback((next: ThemePreference) => {
    setStoredPreference(next)
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Same as reading: the choice still applies to this page.
    }
  }, [])

  return { preference, resolved, setPreference }
}

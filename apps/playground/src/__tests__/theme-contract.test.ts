// The boot script cannot import the resolver, so the resolution rule exists
// twice: once as `resolveTheme` and once inside a string. This is where the
// two are held to the same answer, over every input there is.
import { describe, it, expect, afterEach } from 'vitest'
import {
  DARK_QUERY,
  DEFAULT_THEME_PREFERENCE,
  THEME_ATTRIBUTE,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  parseThemePreference,
  resolveTheme,
  themeBootScript,
} from '../../../../theme.config.mjs'

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute(THEME_ATTRIBUTE)
})

/** Runs the generated source the way a browser would, and reports the result. */
function boot({ stored, prefersDark }: { stored?: string; prefersDark: boolean }): string | null {
  if (stored === undefined) {
    localStorage.removeItem(THEME_STORAGE_KEY)
  } else {
    localStorage.setItem(THEME_STORAGE_KEY, stored)
  }
  const previous = window.matchMedia
  window.matchMedia = ((query: string) => ({
    matches: query === DARK_QUERY ? prefersDark : false,
    media: query,
  })) as unknown as typeof window.matchMedia
  try {
    new Function(themeBootScript())()
  } finally {
    window.matchMedia = previous
  }
  return document.documentElement.getAttribute(THEME_ATTRIBUTE)
}

describe('resolveTheme', () => {
  it('lets an explicit preference override the system', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('follows the system only for auto', () => {
    expect(resolveTheme('auto', true)).toBe('dark')
    expect(resolveTheme('auto', false)).toBe('light')
  })
})

describe('parseThemePreference', () => {
  it('defaults anything it does not recognise', () => {
    expect(parseThemePreference(null)).toBe(DEFAULT_THEME_PREFERENCE)
    expect(parseThemePreference('')).toBe(DEFAULT_THEME_PREFERENCE)
    expect(parseThemePreference('system')).toBe(DEFAULT_THEME_PREFERENCE)
    // Starlight writes an empty string for auto. Reading its key would land
    // here, which is one reason the key is not shared.
    expect(parseThemePreference(undefined)).toBe(DEFAULT_THEME_PREFERENCE)
  })

  it('keeps every preference it does recognise', () => {
    for (const preference of THEME_PREFERENCES) {
      expect(parseThemePreference(preference)).toBe(preference)
    }
  })
})

describe('the boot script agrees with the resolver', () => {
  it('stamps the resolved theme for every stored value and system preference', () => {
    for (const stored of [...THEME_PREFERENCES, 'nonsense', '']) {
      for (const prefersDark of [true, false]) {
        expect(
          boot({ stored, prefersDark }),
          `stored ${JSON.stringify(stored)} with prefersDark ${prefersDark}`,
        ).toBe(resolveTheme(parseThemePreference(stored), prefersDark))
      }
    }
  })

  it('stamps the default when nothing is stored', () => {
    expect(boot({ prefersDark: true })).toBe('dark')
    expect(boot({ prefersDark: false })).toBe('light')
  })

  it('leaves no attribute behind when storage throws', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage is disabled')
      },
    })
    try {
      expect(() => new Function(themeBootScript())()).not.toThrow()
    } finally {
      if (descriptor) Object.defineProperty(window, 'localStorage', descriptor)
    }
  })
})

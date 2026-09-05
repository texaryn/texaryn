// The same control the documentation site shows, in the same three options
// and the same order, so moving between the two surfaces does not feel like
// meeting two different settings. It writes the shared preference; what
// resolves it is `useTheme`.
import type { ThemePreference } from './theme.js'

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'auto', label: 'Auto' },
]

// Starlight's laptop and caret glyphs, inlined rather than pulled from a
// package: two paths are cheaper than an icon dependency, and the site's own
// copies are what these have to match.
const LAPTOP =
  'M21 14h-1V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v7H3a1 1 0 0 0-1 1v2a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-2a1 1 0 0 0-1-1ZM6 7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v7H6V7Zm14 10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-1h16v1Z'
const CARET =
  'M17 9.17a1 1 0 0 0-1.41 0L12 12.71 8.46 9.17a1 1 0 1 0-1.41 1.42l4.24 4.24a1.002 1.002 0 0 0 1.42 0L17 10.59a1.002 1.002 0 0 0 0-1.42Z'

export function ThemeSelect({
  preference,
  onChange,
}: {
  preference: ThemePreference
  onChange: (preference: ThemePreference) => void
}) {
  return (
    <label className="pg-theme">
      <span className="pg-sr-only">Select theme</span>
      <svg aria-hidden="true" className="pg-theme__icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d={LAPTOP} />
      </svg>
      <select
        className="pg-theme__select"
        autoComplete="off"
        value={preference}
        onChange={(event) => onChange(event.target.value as ThemePreference)}
      >
        {OPTIONS.map(({ value, label }) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <svg aria-hidden="true" className="pg-theme__caret" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d={CARET} />
      </svg>
    </label>
  )
}

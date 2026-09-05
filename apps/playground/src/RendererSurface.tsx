// The renderer-owned region and its theme adapter, together, because they are
// the same boundary: what the box contains is what the adapter has to reach.
//
// Each renderer is told the resolved mode in its own vocabulary. None of them
// is told the preference, and none of them reads storage or a media query: the
// shell resolves once and adapts outward, so `auto` has exactly one meaning on
// the page.
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { ThemeProvider, createTheme } from '@mui/material'
import type { RendererKey } from './routing.js'
import type { ResolvedTheme } from './theme.js'

// Memoised on the mode so switching theme changes the value MUI receives
// rather than handing it a new object on every render of the shell.
function MuiTheme({ theme, children }: { theme: ResolvedTheme; children: ReactNode }) {
  const muiTheme = useMemo(() => createTheme({ palette: { mode: theme } }), [theme])
  return <ThemeProvider theme={muiTheme}>{children}</ThemeProvider>
}

export function RendererSurface({
  rendererKey,
  label,
  theme,
  children,
}: {
  rendererKey: RendererKey
  label: string
  theme: ResolvedTheme
  children: ReactNode
}) {
  return (
    <section
      className="pg-surface"
      aria-label={`Rendered by ${label}`}
      // Bootstrap reads an attribute, and reads it from any ancestor, so the
      // box is the whole adapter. Absent for every other renderer rather than
      // set and ignored, so the DOM says which one is in use.
      data-bs-theme={rendererKey === 'bootstrap' ? theme : undefined}
    >
      {/* Default and Vue carry no colour of their own: neither widget set has
          an inline style or a colour literal in it. They inherit the text
          colour from the page and take their control colours from the
          `color-scheme` the resolved attribute sets, so there is nothing for
          an adapter to tell them. */}
      {rendererKey === 'mui' ? <MuiTheme theme={theme}>{children}</MuiTheme> : children}
    </section>
  )
}

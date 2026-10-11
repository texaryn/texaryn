// The renderer-owned region and its theme adapter, together, because they are
// the same boundary: what the box contains is what the adapter has to reach.
//
// Each renderer is told the resolved mode in its own vocabulary. None of them
// is told the preference, and none of them reads storage or a media query: the
// shell resolves once and adapts outward, so `auto` has exactly one meaning on
// the page.
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import styled from '@emotion/styled'
import { ThemeProvider, createTheme } from '@mui/material'
import type { RendererKey } from './routing.js'
import type { ResolvedTheme } from './theme.js'
import './tailwind.css'

// Memoised on the mode so switching theme changes the value MUI receives
// rather than handing it a new object on every render of the shell.
function MuiTheme({ theme, children }: { theme: ResolvedTheme; children: ReactNode }) {
  const muiTheme = useMemo(() => createTheme({ palette: { mode: theme } }), [theme])
  return <ThemeProvider theme={muiTheme}>{children}</ThemeProvider>
}

const EmotionScope = styled.div<{ $mode: ResolvedTheme }>(({ $mode }) => ({
  color: 'var(--tx-text)',
  colorScheme: $mode,
  display: 'grid',
  gap: '0.75rem',
  '& label': {
    display: 'block',
    marginBottom: '0.25rem',
    fontSize: '0.875rem',
    fontWeight: 600,
  },
  '& input:not([type="checkbox"]), & select, & textarea': {
    boxSizing: 'border-box',
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid var(--tx-border-strong)',
    borderRadius: '0.375rem',
    background: 'var(--tx-surface-raised)',
    color: 'var(--tx-text)',
    font: 'inherit',
  },
  '& input[type="checkbox"] + label': {
    display: 'inline-flex',
    alignItems: 'center',
    marginLeft: '0.5rem',
  },
  '& fieldset': {
    border: '1px solid var(--tx-border)',
    borderRadius: '0.5rem',
    padding: '1rem',
  },
  '& legend': { padding: '0 0.5rem', fontWeight: 600 },
  '& button': {
    marginRight: '0.5rem',
    border: 0,
    borderRadius: '0.375rem',
    padding: '0.5rem 0.75rem',
    background: 'var(--tx-accent)',
    color: 'var(--tx-on-accent)',
    font: 'inherit',
    cursor: 'pointer',
  },
  '& [aria-invalid="true"]': { borderColor: 'var(--tx-danger)' },
  '& [role="alert"]': { color: 'var(--tx-danger)' },
}))

const TAILWIND_SCOPE = [
  'space-y-3 font-sans text-sm text-[var(--tx-text)]',
  '[&_label]:mb-1 [&_label]:block [&_label]:font-medium',
  '[&_input:not([type=checkbox])]:w-full [&_input:not([type=checkbox])]:rounded-md [&_input:not([type=checkbox])]:border [&_input:not([type=checkbox])]:border-[var(--tx-border-strong)] [&_input:not([type=checkbox])]:bg-[var(--tx-surface-raised)] [&_input:not([type=checkbox])]:px-3 [&_input:not([type=checkbox])]:py-2 [&_input:not([type=checkbox])]:text-[var(--tx-text)]',
  '[&_select]:w-full [&_select]:rounded-md [&_select]:border [&_select]:border-[var(--tx-border-strong)] [&_select]:bg-[var(--tx-surface-raised)] [&_select]:px-3 [&_select]:py-2 [&_select]:text-[var(--tx-text)]',
  '[&_textarea]:w-full [&_textarea]:rounded-md [&_textarea]:border [&_textarea]:border-[var(--tx-border-strong)] [&_textarea]:bg-[var(--tx-surface-raised)] [&_textarea]:px-3 [&_textarea]:py-2 [&_textarea]:text-[var(--tx-text)]',
  '[&_input[type=checkbox]+label]:ml-2 [&_input[type=checkbox]+label]:inline-block',
  '[&_fieldset]:rounded-lg [&_fieldset]:border [&_fieldset]:border-[var(--tx-border)] [&_fieldset]:p-4',
  '[&_legend]:px-2 [&_legend]:font-semibold',
  '[&_button]:mr-2 [&_button]:rounded-md [&_button]:bg-[var(--tx-accent)] [&_button]:px-3 [&_button]:py-2 [&_button]:text-[var(--tx-on-accent)]',
  '[&_[aria-invalid=true]]:border-[var(--tx-danger)] [&_[role=alert]]:text-[var(--tx-danger)]',
  '[&_input:focus-visible]:outline-2 [&_select:focus-visible]:outline-2 [&_textarea:focus-visible]:outline-2 [&_button:focus-visible]:outline-2 [&_input:focus-visible]:outline-[var(--tx-accent)] [&_select:focus-visible]:outline-[var(--tx-accent)] [&_textarea:focus-visible]:outline-[var(--tx-accent)] [&_button:focus-visible]:outline-[var(--tx-accent)]',
].join(' ')

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
      {rendererKey === 'mui' ? (
        <MuiTheme theme={theme}>{children}</MuiTheme>
      ) : rendererKey === 'emotion' ? (
        <EmotionScope
          $mode={theme}
          data-style-system="emotion"
          data-theme={theme}
        >
          {children}
        </EmotionScope>
      ) : rendererKey === 'tailwind' ? (
        <div
          className={TAILWIND_SCOPE}
          data-style-system="tailwind"
          data-theme={theme}
          data-testid="tailwind-style-scope"
        >
          {children}
        </div>
      ) : (
        children
      )}
    </section>
  )
}

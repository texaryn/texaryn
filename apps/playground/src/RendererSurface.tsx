import type { ReactNode } from 'react'
import type { RendererKey } from './routing.js'
import type { ResolvedTheme } from './theme.js'

export function RendererSurface({
  rendererKey,
  label,
  theme,
  defaultStyleMode = 'baseline',
  children,
}: Readonly<{
  rendererKey: RendererKey
  label: string
  theme: ResolvedTheme
  defaultStyleMode?: 'baseline' | 'unstyled'
  children: ReactNode
}>) {
  const usesDefaultStyles =
    rendererKey === 'default' ||
    rendererKey === 'vue' ||
    rendererKey === 'svelte' ||
    rendererKey === 'solid' ||
    rendererKey === 'wc'

  return (
    <section
      className="pg-surface"
      aria-label={`Rendered by ${label}`}
      data-style-system={usesDefaultStyles && defaultStyleMode === 'baseline' ? 'default' : undefined}
      data-bs-theme={rendererKey === 'bootstrap' ? theme : undefined}
    >
      {children}
    </section>
  )
}

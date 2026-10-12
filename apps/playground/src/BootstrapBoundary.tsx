import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import bootstrapCss from 'bootstrap/dist/css/bootstrap.min.css?inline'
import type { ResolvedTheme } from './theme.js'

export function BootstrapBoundary({
  theme,
  children,
}: {
  theme: ResolvedTheme
  children: ReactNode
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [mountNode, setMountNode] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
    let style = shadow.querySelector<HTMLStyleElement>('style[data-bootstrap-style]')
    let root = shadow.querySelector<HTMLDivElement>('.pg-bootstrap-shadow-root')

    if (!style) {
      style = document.createElement('style')
      style.dataset.bootstrapStyle = ''
      style.textContent = bootstrapCss
      shadow.append(style)
    }
    if (!root) {
      root = document.createElement('div')
      root.className = 'pg-bootstrap-shadow-root'
      shadow.append(root)
    }

    setMountNode(root)
  }, [])

  useEffect(() => {
    mountNode?.setAttribute('data-bs-theme', theme)
  }, [mountNode, theme])

  return (
    <div className="pg-bootstrap-shadow-host" ref={hostRef} data-testid="bootstrap-shadow-host">
      {mountNode ? createPortal(children, mountNode) : null}
    </div>
  )
}

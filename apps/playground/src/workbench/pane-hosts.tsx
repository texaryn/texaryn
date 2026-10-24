import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

export type PaneHostId = 'examples' | 'schema' | 'preview' | 'inspector'
export type PaneHosts = Readonly<Record<PaneHostId, HTMLDivElement>>

function createHost(id: PaneHostId): HTMLDivElement {
  const host = document.createElement('div')
  host.className = 'pg-pane-host'
  host.dataset.paneHost = id
  return host
}

// Never replaced: a portal remounts its children when its container changes.
export function usePaneHosts(): PaneHosts {
  const [hosts] = useState<PaneHosts>(() => ({
    examples: createHost('examples'),
    schema: createHost('schema'),
    preview: createHost('preview'),
    inspector: createHost('inspector'),
  }))
  return hosts
}

// Content that caches geometry, such as CodeMirror, re-measures on this event.
export const PANE_ATTACH_EVENT = 'pg-pane-attach'

export function PaneSlot({ host, className, style }: Readonly<{ host: HTMLElement; className?: string; style?: CSSProperties }>) {
  const slot = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const element = slot.current
    if (!element) return
    element.appendChild(host)
    host.dispatchEvent(new Event(PANE_ATTACH_EVENT))
    return () => {
      if (host.parentNode === element) element.removeChild(host)
    }
  }, [host])
  return <div ref={slot} className={className ?? 'pg-pane-slot'} style={style} />
}

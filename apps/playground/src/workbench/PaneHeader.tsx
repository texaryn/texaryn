import type { ReactNode, Ref } from 'react'
import type { LayoutAction, PaneId } from './layout.js'

export function PaneHeader({ title, children, actions }: Readonly<{ title: string; children?: ReactNode; actions?: ReactNode }>) {
  return (
    <header className="pg-pane__header">
      <h2 className="pg-pane__title">{title}</h2>
      {children}
      <div className="pg-pane__actions">{actions}</div>
    </header>
  )
}

// Panel headers always offer Maximize; only the overlay offers Restore, so the
// inert header underneath an overlay never duplicates its button.
export function MaximizeButton({
  pane,
  label,
  maximized,
  dispatch,
  buttonRef,
}: Readonly<{
  pane: PaneId
  label: string
  maximized: boolean
  dispatch: (action: LayoutAction) => void
  buttonRef?: Ref<HTMLButtonElement>
}>) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="pg-pane__action"
      aria-label={`${maximized ? 'Restore' : 'Maximize'} ${label}`}
      onClick={() => dispatch(maximized ? { type: 'restore' } : { type: 'maximize', pane })}
    >
      {maximized ? 'Restore' : 'Maximize'}
    </button>
  )
}

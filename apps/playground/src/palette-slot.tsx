import { Component, Suspense, lazy, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { CommandPaletteProps } from './palette/CommandPalette.js'

const CommandPalette = lazy(() => import('./palette/CommandPalette.js'))

interface CommandPaletteSlotProps extends CommandPaletteProps {
  onRestoreFocus: () => void
}

export class PaletteBoundary extends Component<{ children: ReactNode; onDismiss: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true } }

  render(): ReactNode {
    return this.state.failed
      ? (
        <div className="pg-palette__error">
          <output>The command palette is unavailable. Use the visible controls instead.</output>
          <button type="button" onClick={this.props.onDismiss}>Close message</button>
        </div>
      )
      : this.props.children
  }
}

export function useCommandPaletteShortcut(onOpen: () => void): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpen()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onOpen])
}

export function CommandPaletteSlot(props: Readonly<CommandPaletteSlotProps>) {
  const wasOpen = useRef(props.open)
  useEffect(() => {
    if (wasOpen.current && !props.open) {
      const frame = window.requestAnimationFrame(props.onRestoreFocus)
      wasOpen.current = props.open
      return () => window.cancelAnimationFrame(frame)
    }
    wasOpen.current = props.open
  }, [props.open, props.onRestoreFocus])

  if (!props.open) return null
  return (
    <PaletteBoundary onDismiss={() => props.onOpenChange(false)}>
      <Suspense fallback={null}>
        <CommandPalette open={props.open} onOpenChange={props.onOpenChange} commands={props.commands} />
      </Suspense>
    </PaletteBoundary>
  )
}

import { describe, it, expect, afterEach, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { App } from '../App.js'
import { PaletteBoundary } from '../palette-slot.js'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Broken(): never {
  throw new Error('palette chunk failed')
}

function BoundaryHarness({ onDismiss }: { onDismiss: () => void }) {
  const [open, setOpen] = useState(true)
  return (
    <>
      <App />
      {open && <PaletteBoundary onDismiss={() => { onDismiss(); setOpen(false) }}><Broken /></PaletteBoundary>}
    </>
  )
}

describe('PaletteBoundary', () => {
  it('keeps the form mounted and lets the unavailable message close', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const onDismiss = vi.fn()
    render(<BoundaryHarness onDismiss={onDismiss} />)
    expect(await screen.findByLabelText('Name')).toBeTruthy()
    expect(await screen.findByText(/command palette is unavailable/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close message' }))
    expect(onDismiss).toHaveBeenCalledOnce()
    expect(screen.queryByText(/command palette is unavailable/i)).toBeNull()
    expect(screen.getByLabelText('Name')).toBeTruthy()
  })
})

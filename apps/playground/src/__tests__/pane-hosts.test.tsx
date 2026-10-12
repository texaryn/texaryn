import { describe, it, expect, afterEach } from 'vitest'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { App } from '../App.js'
import { PaneSlot, usePaneHosts } from '../workbench/pane-hosts.js'

afterEach(cleanup)

let mounts = 0

function Counter() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    mounts += 1
  }, [])
  return (
    <button type="button" onClick={() => setCount(count + 1)}>
      {count}
    </button>
  )
}

function Harness({ where }: { where: 'a' | 'b' }) {
  const hosts = usePaneHosts()
  return (
    <>
      {where === 'a' ? (
        <div data-testid="a">
          <PaneSlot host={hosts.preview} />
        </div>
      ) : (
        <section data-testid="b">
          <PaneSlot host={hosts.preview} />
        </section>
      )}
      {createPortal(<Counter />, hosts.preview)}
    </>
  )
}

describe('pane hosts', () => {
  it('move content between layouts without remounting it', () => {
    mounts = 0
    const { rerender } = render(<Harness where="a" />)
    const button = within(screen.getByTestId('a')).getByRole('button')
    fireEvent.click(button)
    fireEvent.click(button)
    rerender(<Harness where="b" />)
    const moved = within(screen.getByTestId('b')).getByRole('button')
    expect(moved).toBe(button)
    expect(moved.textContent).toBe('2')
    expect(mounts).toBe(1)
  })

  it('hold every column of the app', async () => {
    render(<App />)
    await screen.findByLabelText('Name')
    for (const id of ['examples', 'schema', 'preview', 'inspector']) {
      expect(document.querySelector(`[data-pane-host="${id}"]`)?.childElementCount).toBeGreaterThan(0)
    }
  })
})

import { describe, it, expect } from 'vitest'
import { act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import { createStore } from '@texaryn/core'
import { useStore } from '../use-store.js'

describe('useStore (React binding)', () => {
  it('reads initial value', () => {
    const store = createStore(42)
    const { result } = renderHook(() => useStore(store))
    expect(result.current).toBe(42)
  })

  it('re-renders on store update', () => {
    const store = createStore(0)
    const { result } = renderHook(() => useStore(store))
    expect(result.current).toBe(0)
    act(() => { store.set(1) })
    expect(result.current).toBe(1)
  })

  it('does not re-render when value is identical', () => {
    const store = createStore(5)
    let renderCount = 0
    renderHook(() => {
      renderCount++
      return useStore(store)
    })
    const initial = renderCount
    act(() => { store.set(5) })
    expect(renderCount).toBe(initial)
  })
})

import { describe, it, expect, vi } from 'vitest'
import { createStore } from '../store.js'

describe('createStore', () => {
  it('returns initial value from getSnapshot', () => {
    const store = createStore(42)
    expect(store.getSnapshot()).toBe(42)
  })

  it('notifies subscribers on set', () => {
    const store = createStore(0)
    const listener = vi.fn()
    store.subscribe(listener)
    store.set(1)
    expect(listener).toHaveBeenCalledOnce()
    expect(store.getSnapshot()).toBe(1)
  })

  it('does not notify when value is identical (Object.is)', () => {
    const store = createStore(1)
    const listener = vi.fn()
    store.subscribe(listener)
    store.set(1)
    expect(listener).not.toHaveBeenCalled()
  })

  it('unsubscribe stops notifications', () => {
    const store = createStore(0)
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)
    unsubscribe()
    store.set(1)
    expect(listener).not.toHaveBeenCalled()
  })

  it('supports multiple subscribers', () => {
    const store = createStore(0)
    const a = vi.fn()
    const b = vi.fn()
    store.subscribe(a)
    store.subscribe(b)
    store.set(1)
    expect(a).toHaveBeenCalledOnce()
    expect(b).toHaveBeenCalledOnce()
  })

  it('getSnapshot is stable reference when value unchanged', () => {
    const store = createStore({ x: 1 })
    const first = store.getSnapshot()
    const second = store.getSnapshot()
    expect(first).toBe(second)
  })
})

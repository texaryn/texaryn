import { describe, it, expect } from 'vitest'
import { defineComponent, effectScope, h, nextTick, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import { createStore } from '@texaryn/core'
import type { Store } from '@texaryn/core'
import { useStore } from '../use-store.js'

// createStore reports no listener count, so the cleanup assertions bring
// their own. Everything else about it delegates to a real store.
function countingStore<T>(initial: T) {
  const inner = createStore(initial)
  let listeners = 0
  const store: Store<T> = {
    getSnapshot: inner.getSnapshot,
    subscribe(listener) {
      listeners++
      const unsubscribe = inner.subscribe(listener)
      return () => {
        listeners--
        unsubscribe()
      }
    },
  }
  return { store, set: inner.set, get listeners() { return listeners } }
}

function mountWith(setup: () => Record<string, unknown>) {
  return mount(defineComponent({ setup, render: () => h('div') }))
}

// A composable that owns a subscription and returns only a Ref cannot hand
// teardown back to its caller. Requiring a scope is what makes the ownership
// real rather than documented.
describe('useStore is bound to the scope that calls it', () => {
  it('refuses to run without one, before subscribing to anything', () => {
    const counting = countingStore(0)
    expect(() => useStore(counting.store)).toThrow(/effectScope/)
    expect(counting.listeners, 'nothing should have been subscribed').toBe(0)
  })

  it('works inside a bare effect scope, with no component involved', () => {
    const counting = countingStore('start')
    const scope = effectScope()
    let value!: ReturnType<typeof useStore<string>>

    scope.run(() => { value = useStore(counting.store, '') })
    expect(value.value).toBe('start')
    expect(counting.listeners).toBe(1)

    counting.set('moved')
    expect(value.value).toBe('moved')

    scope.stop()
    expect(counting.listeners, 'stopping the scope should unsubscribe').toBe(0)

    counting.set('after')
    expect(value.value, 'a stopped scope should stop tracking').toBe('moved')
  })
})

describe('useStore', () => {
  it('reads the current snapshot without waiting for a notification', () => {
    const store = createStore(42)
    const wrapper = mountWith(() => ({ value: useStore(store) }))
    expect(wrapper.vm.value).toBe(42)
    wrapper.unmount()
  })

  it('tracks the store after it changes', async () => {
    const store = createStore(0)
    const wrapper = mountWith(() => ({ value: useStore(store) }))
    store.set(7)
    await nextTick()
    expect(wrapper.vm.value).toBe(7)
    wrapper.unmount()
  })

  it('unsubscribes when the owning component unmounts', () => {
    const counting = countingStore(0)
    const wrapper = mountWith(() => ({ value: useStore(counting.store) }))
    expect(counting.listeners).toBe(1)

    wrapper.unmount()
    expect(counting.listeners).toBe(0)
  })

  it('keeps no subscription on a store it has moved off', async () => {
    const first = countingStore('a')
    const second = countingStore('b')
    const selected = shallowRef(first.store)

    const wrapper = mountWith(() => ({ value: useStore(() => selected.value) }))
    expect(first.listeners).toBe(1)
    expect(second.listeners).toBe(0)

    selected.value = second.store
    await nextTick()

    expect(first.listeners).toBe(0)
    expect(second.listeners).toBe(1)
    expect(wrapper.vm.value).toBe('b')

    wrapper.unmount()
    expect(second.listeners).toBe(0)
  })

  // The trap the getter form exists for. A binding that subscribed once would
  // keep reporting the first store's value, which is exactly what happens to a
  // field whose node id changes under it after an array move.
  it('follows a changed store rather than reporting the old one', async () => {
    const first = createStore('first')
    const second = createStore('second')
    const selected = shallowRef(first)

    const wrapper = mountWith(() => ({ value: useStore(() => selected.value) }))
    expect(wrapper.vm.value).toBe('first')

    selected.value = second
    await nextTick()
    expect(wrapper.vm.value).toBe('second')

    second.set('changed')
    await nextTick()
    expect(wrapper.vm.value).toBe('changed')

    // The store it left must no longer be able to drive it.
    first.set('stale')
    await nextTick()
    expect(wrapper.vm.value).toBe('changed')

    wrapper.unmount()
  })

  it('reports a stored undefined rather than the fallback', () => {
    const store = createStore<string | undefined>(undefined)
    const wrapper = mountWith(() => ({ value: useStore(() => store, 'fallback') }))
    expect(wrapper.vm.value).toBeUndefined()
    wrapper.unmount()
  })

  it('falls back when the source resolves to nothing', async () => {
    const store = createStore('present')
    const selected = shallowRef<Store<string> | undefined>(store)

    const wrapper = mountWith(() => ({ value: useStore(() => selected.value, 'absent') }))
    expect(wrapper.vm.value).toBe('present')

    selected.value = undefined
    await nextTick()
    expect(wrapper.vm.value).toBe('absent')

    wrapper.unmount()
  })
})

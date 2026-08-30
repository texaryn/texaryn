import { describe, it, expect } from 'vitest'
import { shallowRef, watch } from 'vue'
import { createStore } from '@texaryn/core'

function useStoreVue<T>(store: ReturnType<typeof createStore<T>>) {
  const ref = shallowRef(store.getSnapshot())
  const unsubscribe = store.subscribe(() => {
    ref.value = store.getSnapshot()
  })
  return { ref, unsubscribe }
}

describe('Vue binding spike', () => {
  it('shallowRef reflects initial store value', () => {
    const store = createStore(42)
    const { ref, unsubscribe } = useStoreVue(store)
    expect(ref.value).toBe(42)
    unsubscribe()
  })

  it('shallowRef updates when store changes', () => {
    const store = createStore(0)
    const { ref, unsubscribe } = useStoreVue(store)
    store.set(7)
    expect(ref.value).toBe(7)
    unsubscribe()
  })

  it('Vue watch fires on store change', async () => {
    const store = createStore('hello')
    const { ref, unsubscribe } = useStoreVue(store)
    const values: string[] = []
    const stopWatch = watch(ref, (v) => { values.push(v) })
    store.set('world')
    await Promise.resolve()
    expect(values).toContain('world')
    stopWatch()
    unsubscribe()
  })
})

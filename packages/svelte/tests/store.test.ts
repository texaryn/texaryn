import { describe, expect, it } from 'vitest'
import { get } from 'svelte/store'
import { createStore } from '@texaryn/core'
import { fromStore } from '../src/lib/store.js'

describe('Svelte store bridge', () => {
  it('mirrors snapshots and releases its runtime subscription', () => {
    const source = createStore(1)
    const bridged = fromStore(source)
    const values: number[] = []
    const unsubscribe = bridged.subscribe((value) => values.push(value))

    expect(values).toEqual([1])
    source.set(2)
    expect(values).toEqual([1, 2])

    unsubscribe()
    source.set(3)
    expect(values).toEqual([1, 2])
  })

  it('reads a current snapshot on each subscription', () => {
    const source = createStore('before')
    const bridged = fromStore(source)
    source.set('after')

    expect(get(bridged)).toBe('after')
  })
})

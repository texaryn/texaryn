import { createSignal, subscribeToSignal } from './signal.js'
import type { Signal } from './signal.js'

export interface Store<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

export interface WritableStore<T> extends Store<T> {
  set(value: T): void
}

export function createStore<T>(initialValue: T): WritableStore<T> {
  const signal: Signal<T> = createSignal(initialValue)

  return {
    getSnapshot: () => signal.get(),
    subscribe: (listener) => subscribeToSignal(signal, listener),
    set: (value: T) => signal.set(value),
  }
}

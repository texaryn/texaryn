export interface Store<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

export interface WritableStore<T> extends Store<T> {
  set(value: T): void
}

export function createStore<T>(initialValue: T): WritableStore<T> {
  let value = initialValue
  const listeners = new Set<() => void>()

  return {
    getSnapshot: () => value,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: (newValue: T) => {
      if (Object.is(value, newValue)) return
      value = newValue
      for (const fn of listeners) fn()
    },
  }
}

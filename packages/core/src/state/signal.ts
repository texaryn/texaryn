let currentComputation: ComputedImpl<unknown> | null = null
let batchDepth = 0
const pendingNotifications = new Set<() => void>()

export interface Signal<T> {
  get(): T
  set(value: T): void
}

export interface Computed<T> {
  get(): T
}

export function createSignal<T>(initialValue: T): Signal<T> {
  return new SignalImpl(initialValue)
}

export function createComputed<T>(fn: () => T): Computed<T> {
  return new ComputedImpl(fn)
}

export function batch(fn: () => void): void {
  batchDepth++
  try {
    fn()
  } finally {
    batchDepth--
    if (batchDepth === 0) {
      const fns = [...pendingNotifications]
      pendingNotifications.clear()
      for (const f of fns) f()
    }
  }
}

export function subscribeToSignal<T>(
  source: Signal<T> | Computed<T>,
  listener: () => void,
): () => void {
  const impl = source as SignalImpl<T> | ComputedImpl<T>
  impl.subscribers.add(listener)
  if (impl instanceof ComputedImpl) impl.get()
  return () => { impl.subscribers.delete(listener) }
}

class SignalImpl<T> implements Signal<T> {
  private value: T
  readonly dependents = new Set<ComputedImpl<unknown>>()
  readonly subscribers = new Set<() => void>()

  constructor(initialValue: T) {
    this.value = initialValue
  }

  get(): T {
    if (currentComputation) {
      this.dependents.add(currentComputation)
      currentComputation.sources.add(this)
    }
    return this.value
  }

  set(newValue: T): void {
    if (Object.is(this.value, newValue)) return
    this.value = newValue
    this.notify()
  }

  private notify(): void {
    for (const dep of this.dependents) dep.markDirty()
    if (batchDepth > 0) {
      for (const fn of this.subscribers) pendingNotifications.add(fn)
    } else {
      for (const fn of this.subscribers) fn()
    }
  }
}

class ComputedImpl<T> implements Computed<T> {
  private value: T | undefined
  private dirty = true
  private readonly fn: () => T
  readonly sources = new Set<SignalImpl<unknown>>()
  private readonly dependents = new Set<ComputedImpl<unknown>>()
  readonly subscribers = new Set<() => void>()

  constructor(fn: () => T) {
    this.fn = fn
  }

  get(): T {
    if (currentComputation) {
      this.dependents.add(currentComputation)
      currentComputation.sources.add(this as unknown as SignalImpl<unknown>)
    }
    if (this.dirty) this.recompute()
    return this.value as T
  }

  markDirty(): void {
    if (this.dirty) return
    this.dirty = true
    for (const dep of this.dependents) dep.markDirty()
    if (batchDepth > 0) {
      for (const fn of this.subscribers) pendingNotifications.add(fn)
    } else {
      for (const fn of this.subscribers) fn()
    }
  }

  private recompute(): void {
    for (const source of this.sources) {
      source.dependents.delete(this as unknown as ComputedImpl<unknown>)
    }
    this.sources.clear()
    const prev = currentComputation
    currentComputation = this as ComputedImpl<unknown>
    try {
      this.value = this.fn()
    } finally {
      currentComputation = prev
    }
    this.dirty = false
  }
}

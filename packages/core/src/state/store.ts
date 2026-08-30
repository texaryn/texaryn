export interface Store<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}

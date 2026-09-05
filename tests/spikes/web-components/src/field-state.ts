import type { FormRuntime, NodeState, UINode, ValidationError } from '@texaryn/core'

/**
 * Subscriptions for one field, re-pointable at another node. `getNodeState`
 * is a map lookup and the runtime replaces a node's bundle when its id leaves
 * the document and returns, so every update re-resolves and compares the
 * bundle rather than trusting the id.
 */
export class FieldState {
  #runtime: FormRuntime
  #bundle: NodeState | undefined
  #unsubscribe: Array<() => void> = []
  #onChange: () => void

  constructor(runtime: FormRuntime, node: UINode, onChange: () => void) {
    this.#runtime = runtime
    this.#onChange = onChange
    this.rebind(node)
  }

  rebind(node: UINode): void {
    const bundle = this.#runtime.getNodeState(node.id)
    if (bundle === this.#bundle) return
    this.#release()
    this.#bundle = bundle
    if (!bundle) return
    for (const store of [bundle.value, bundle.errors, bundle.showErrors, bundle.disabled]) {
      this.#unsubscribe.push(store.subscribe(this.#onChange))
    }
  }

  get value(): unknown {
    return this.#bundle?.value.getSnapshot()
  }
  get errors(): ValidationError[] {
    return this.#bundle?.errors.getSnapshot() ?? []
  }
  get showErrors(): boolean {
    return this.#bundle?.showErrors.getSnapshot() ?? false
  }
  get disabled(): boolean {
    return this.#bundle?.disabled.getSnapshot() ?? false
  }

  #release(): void {
    for (const off of this.#unsubscribe) off()
    this.#unsubscribe = []
  }

  destroy(): void {
    this.#release()
    this.#bundle = undefined
  }
}

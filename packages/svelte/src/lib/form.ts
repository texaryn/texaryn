import { createFormRuntime } from '@texaryn/core'
import type {
  Command,
  FormRuntime,
  FormRuntimeOptions,
  NodeId,
  NodeState,
  SchemaEvaluationPort,
  SubmissionState,
  UIDocument,
  VisibleError,
} from '@texaryn/core'
import type { Readable } from 'svelte/store'
import { fromStore } from './store.js'

export interface SvelteFormBinding {
  runtime: FormRuntime
  document: Readable<UIDocument>
  data: Readable<unknown>
  submission: Readable<SubmissionState>
  visibleErrors: Readable<VisibleError[]>
  dispatch(command: Command): void
  getNodeState(nodeId: NodeId): NodeState | undefined
}

export interface SvelteForm extends SvelteFormBinding {
  destroy(): void
}

export function bindFormRuntime(runtime: FormRuntime): SvelteFormBinding {
  return {
    runtime,
    document: fromStore(runtime.document),
    data: fromStore(runtime.data),
    submission: fromStore(runtime.submission),
    visibleErrors: fromStore(runtime.visibleErrors),
    dispatch: (command) => runtime.dispatch(command),
    getNodeState: (nodeId) => runtime.getNodeState(nodeId),
  }
}

export function createForm(port: SchemaEvaluationPort, options?: FormRuntimeOptions): SvelteForm {
  const runtime = createFormRuntime(port, options)
  return {
    ...bindFormRuntime(runtime),
    destroy: () => runtime.destroy(),
  }
}

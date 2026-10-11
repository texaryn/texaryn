import { DestroyRef, inject } from '@angular/core'
import type { Signal } from '@angular/core'
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
import { useStore } from './store.js'

export interface AngularForm {
  runtime: FormRuntime
  document: Signal<UIDocument>
  data: Signal<unknown>
  submission: Signal<SubmissionState>
  visibleErrors: Signal<VisibleError[]>
  dispatch(command: Command): void
  getNodeState(nodeId: NodeId): NodeState | undefined
}

export function createForm(
  port: SchemaEvaluationPort,
  options?: FormRuntimeOptions,
): AngularForm {
  const destroyRef = inject(DestroyRef)
  const runtime = createFormRuntime(port, options)
  return bindFormRuntime(runtime, destroyRef, true)
}

export function bindFormRuntime(
  runtime: FormRuntime,
  owner: DestroyRef = inject(DestroyRef),
  destroyRuntime = false,
): AngularForm {
  const document = useStore(runtime.document, owner)
  const data = useStore(runtime.data, owner)
  const submission = useStore(runtime.submission, owner)
  const visibleErrors = useStore(runtime.visibleErrors, owner)
  if (destroyRuntime) owner.onDestroy(() => runtime.destroy())

  return {
    runtime,
    document,
    data,
    submission,
    visibleErrors,
    dispatch: (command) => runtime.dispatch(command),
    getNodeState: (nodeId) => runtime.getNodeState(nodeId),
  }
}

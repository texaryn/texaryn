import { getCurrentScope, onScopeDispose } from 'vue'
import type { Ref } from 'vue'
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
import { useStore } from './use-store.js'

export interface UseFormReturn {
  runtime: FormRuntime
  document: Ref<UIDocument>
  data: Ref<unknown>
  submission: Ref<SubmissionState>
  visibleErrors: Ref<VisibleError[]>
  dispatch(command: Command): void
  getNodeState(nodeId: NodeId): NodeState | undefined
}

/**
 * Creates the runtime once and ties its lifetime to the calling scope.
 *
 * React needs a ref plus an effect to avoid recreating the runtime on every
 * render. `setup` runs once, so the runtime is simply a local, and the whole
 * question disappears rather than being solved differently.
 *
 * Providing is deliberately not folded in here. React's equivalent is a
 * component in the template, `<FormProvider value={form.runtime}>`, and Vue's
 * is a setup call, so `provideFormRuntime` stays the caller's explicit second
 * step rather than a side effect of construction.
 */
export function useForm(port: SchemaEvaluationPort, options?: FormRuntimeOptions): UseFormReturn {
  const runtime = createFormRuntime(port, options)

  if (getCurrentScope()) {
    onScopeDispose(() => { runtime.destroy() })
  }

  return {
    runtime,
    document: useStore(runtime.document, runtime.document.getSnapshot()),
    data: useStore(runtime.data, undefined),
    submission: useStore(runtime.submission, runtime.submission.getSnapshot()),
    visibleErrors: useStore(runtime.visibleErrors, []),
    dispatch: (command: Command) => { runtime.dispatch(command) },
    getNodeState: (nodeId: NodeId) => runtime.getNodeState(nodeId),
  }
}

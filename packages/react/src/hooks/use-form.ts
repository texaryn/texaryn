import { useCallback, useEffect, useRef } from 'react'
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
} from '@texaryn/core'
import { useStore } from './use-store.js'

export interface UseFormReturn {
  runtime: FormRuntime
  document: UIDocument
  data: unknown
  submission: SubmissionState
  dispatch(command: Command): void
  getNodeState(nodeId: NodeId): NodeState | undefined
}

export function useForm(
  port: SchemaEvaluationPort,
  options?: FormRuntimeOptions,
): UseFormReturn {
  const runtimeRef = useRef<FormRuntime | null>(null)
  if (runtimeRef.current === null) {
    runtimeRef.current = createFormRuntime(port, options)
  }
  const runtime = runtimeRef.current
  const pendingDestroy = useRef<ReturnType<typeof setTimeout> | null>(null)

  // StrictMode reruns cleanup then setup synchronously in one commit, so that
  // setup cancels the deferred destroy. After a real unmount the destroy runs.
  useEffect(() => {
    if (pendingDestroy.current !== null) {
      clearTimeout(pendingDestroy.current)
      pendingDestroy.current = null
    }
    return () => {
      pendingDestroy.current = setTimeout(() => {
        pendingDestroy.current = null
        runtime.destroy()
      }, 0)
    }
  }, [runtime])

  const document = useStore(runtime.document)
  const data = useStore(runtime.data)
  const submission = useStore(runtime.submission)

  const dispatch = useCallback(
    (command: Command) => { runtime.dispatch(command) },
    [runtime],
  )

  const getNodeState = useCallback(
    (nodeId: NodeId) => runtime.getNodeState(nodeId),
    [runtime],
  )

  return { runtime, document, data, submission, dispatch, getNodeState }
}

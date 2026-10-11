import type { DocumentRuntimeLimits } from './types.js'

export interface InternalSnapshotCommit {
  readonly document: unknown
  readonly data: unknown
  readonly mutationVersion: number
}

export interface DocumentRuntimeControl {
  readonly limits: Readonly<DocumentRuntimeLimits>
  getMutationVersion(): number
  replaceSnapshot(
    document: unknown,
    data: unknown,
    options: {
      preserveUnkeyed: boolean
      publishDocument: boolean
      publishData: boolean
    },
    onCommit: (commit: InternalSnapshotCommit) => void,
  ): void
}

const controls = new WeakMap<object, DocumentRuntimeControl>()

export function registerDocumentRuntimeControl(runtime: object, control: DocumentRuntimeControl): void {
  controls.set(runtime, control)
}

export function getDocumentRuntimeControl(runtime: object): DocumentRuntimeControl {
  const control = controls.get(runtime)
  if (!control) throw new TypeError('runtime was not created by createDocumentRuntime')
  return control
}

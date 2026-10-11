import { parsePointer } from '../json-pointer.js'
import { isBatchActive } from '../state/signal.js'
import type { JsonPointer, JsonValue } from '../types.js'
import { cloneJson } from './document-runtime.js'
import type { DocumentRuntime, DocumentUpdateSession, DocumentUpdateSessionOptions } from './types.js'
import { getDocumentRuntimeControl } from './document-runtime-control.js'
import type { InternalSnapshotCommit } from './document-runtime-control.js'
import {
  assertDocumentNodeCount,
  maxPatchCandidateValuesPerMessage,
  preflightJson,
} from './document-limits.js'
import type { JsonTraversalBudget } from './document-limits.js'

interface SessionState {
  readonly revision: number
  readonly document: unknown
  readonly data: unknown
  readonly mutationVersion: number
}

interface PatchOperation {
  readonly op: 'add' | 'remove' | 'replace'
  readonly path: string
  readonly value?: JsonValue
}

interface ParentLocation {
  readonly parent: Record<string, unknown> | unknown[]
  readonly key: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function assertExactKeys(value: Record<string, unknown>, required: readonly string[], path: string): void {
  const allowed = new Set(required)
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${path}.${key} is not supported`)
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) throw new TypeError(`${path}.${key} is required`)
  }
}

function assertRevision(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('message.revision must be a nonnegative safe integer')
  }
}

function pointerTokens(path: unknown, operationIndex: number): string[] {
  if (typeof path !== 'string' || !path.startsWith('/') || /~(?![01])/.test(path)) {
    throw new TypeError(`patch[${operationIndex}].path must be a valid JSON Pointer`)
  }
  let tokens: string[]
  try {
    tokens = parsePointer(path as JsonPointer)
  } catch {
    throw new TypeError(`patch[${operationIndex}].path must be a valid JSON Pointer`)
  }
  if (tokens.length < 2 || tokens[0] !== 'nodes') {
    throw new TypeError(`patch[${operationIndex}].path must address a descendant of /nodes`)
  }
  return tokens
}

function canonicalArrayIndex(token: string, length: number, allowEnd: boolean, path: string): number {
  if (!/^(0|[1-9]\d*)$/.test(token)) throw new TypeError(`${path} must use a canonical array index`)
  const index = Number(token)
  const maximum = allowEnd ? length : length - 1
  if (!Number.isSafeInteger(index) || index < 0 || index > maximum) {
    throw new TypeError(`${path} is outside the array bounds`)
  }
  return index
}

function readChild(parent: Record<string, unknown> | unknown[], key: string, path: string): unknown {
  if (Array.isArray(parent)) {
    const index = canonicalArrayIndex(key, parent.length, false, path)
    return parent[index]
  }
  if (!Object.prototype.hasOwnProperty.call(parent, key)) throw new TypeError(`${path} does not exist`)
  return parent[key]
}

function locateParent(root: unknown, tokens: readonly string[], path: string): ParentLocation {
  let current = root
  for (let index = 0; index < tokens.length - 1; index += 1) {
    if (!Array.isArray(current) && !isRecord(current)) throw new TypeError(`${path} has a missing intermediate parent`)
    current = readChild(current, tokens[index]!, path)
  }
  if (!Array.isArray(current) && !isRecord(current)) throw new TypeError(`${path} has a missing intermediate parent`)
  return { parent: current, key: tokens[tokens.length - 1]! }
}

function writeObjectMember(parent: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(parent, key, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  })
}

function applyPatchOperation(candidate: JsonValue, operation: PatchOperation, operationIndex: number): void {
  const tokens = pointerTokens(operation.path, operationIndex)
  const { parent, key } = locateParent(candidate, tokens, `patch[${operationIndex}].path`)

  if (Array.isArray(parent)) {
    if (operation.op === 'add' && key === '-') {
      parent.push(operation.value)
      return
    }
    const index = canonicalArrayIndex(key, parent.length, operation.op === 'add', `patch[${operationIndex}].path`)
    if (operation.op === 'add') {
      parent.splice(index, 0, operation.value)
      return
    }
    if (index >= parent.length) throw new TypeError(`patch[${operationIndex}].path target does not exist`)
    if (operation.op === 'remove') parent.splice(index, 1)
    else parent[index] = operation.value
    return
  }

  const exists = Object.prototype.hasOwnProperty.call(parent, key)
  if (operation.op !== 'add' && !exists) throw new TypeError(`patch[${operationIndex}].path target does not exist`)
  if (operation.op === 'remove') delete parent[key]
  else writeObjectMember(parent, key, operation.value)
}

function validateOperation(value: unknown, index: number): PatchOperation {
  if (!isRecord(value)) throw new TypeError(`patch[${index}] must be an object`)
  const operation = value.op
  if (operation !== 'add' && operation !== 'remove' && operation !== 'replace') {
    throw new TypeError(`patch[${index}].op is not supported`)
  }
  const keys = operation === 'remove' ? ['op', 'path'] : ['op', 'path', 'value']
  assertExactKeys(value, keys, `patch[${index}]`)
  if (typeof value.path !== 'string') throw new TypeError(`patch[${index}].path must be a string`)
  return operation === 'remove'
    ? { op: operation, path: value.path }
    : { op: operation, path: value.path, value: value.value as JsonValue }
}

function applyPatch(
  document: unknown,
  patch: readonly unknown[],
  limits: ReturnType<typeof getDocumentRuntimeControl>['limits'],
  work: JsonTraversalBudget,
): unknown {
  let candidate = cloneJson(document, 'document', limits, work)
  for (const [index, rawOperation] of patch.entries()) {
    const operation = validateOperation(rawOperation, index)
    const readyOperation = operation.op === 'remove'
      ? operation
      : { ...operation, value: cloneJson(operation.value, `patch[${index}].value`, limits, work) }
    applyPatchOperation(candidate, readyOperation, index)
    preflightJson(candidate, `patch[${index}].candidate`, limits, work)
    if (!isRecord(candidate) || !isRecord(candidate.nodes)) {
      throw new TypeError(`patch[${index}] leaves document.nodes invalid`)
    }
    assertDocumentNodeCount(candidate.nodes, limits)
  }
  return candidate
}

function createRateLimiter(
  maximum: number,
  now: () => number,
): () => void {
  const timestamps = new Array<number>(maximum)
  let start = 0
  let size = 0
  let lastNow = Number.NEGATIVE_INFINITY

  return () => {
    const current = now()
    if (!Number.isFinite(current) || current < lastNow) {
      throw new TypeError('session clock must return finite, nondecreasing values')
    }
    lastNow = current
    while (size > 0 && current - timestamps[start]! >= 1000) {
      start = (start + 1) % maximum
      size -= 1
    }
    if (size >= maximum) throw new Error('Document update rate limit exceeded')
    timestamps[(start + size) % maximum] = current
    size += 1
  }
}

function sessionLimits(value: number | undefined, maximum: number, name: string): number {
  const resolved = value ?? maximum
  if (!Number.isSafeInteger(resolved) || resolved < 1 || resolved > maximum) {
    throw new RangeError(`${name} must be an integer from 1 to ${maximum}`)
  }
  return resolved
}

export function createDocumentUpdateSession(
  runtime: DocumentRuntime,
  options: DocumentUpdateSessionOptions,
): DocumentUpdateSession {
  if (typeof options?.onNotificationError !== 'function') {
    throw new TypeError('onNotificationError must be a function')
  }
  const control = getDocumentRuntimeControl(runtime)
  const maxMessages = sessionLimits(options.maxMessagesPerSecond, 30, 'maxMessagesPerSecond')
  const maxPatchOperations = sessionLimits(options.maxPatchOperations, 100, 'maxPatchOperations')
  const now = options.now ?? (() => globalThis.performance.now())
  const recordAttempt = createRateLimiter(maxMessages, now)
  let state: SessionState | undefined
  let invalidated = false
  let applying = false
  let destroyed = false

  function baselineMatches(): boolean {
    if (!state) return false
    return control.getMutationVersion() === state.mutationVersion &&
      runtime.document.getSnapshot() === state.document &&
      runtime.data.getSnapshot() === state.data
  }

  function publish(
    revision: number,
    document: unknown,
    data: unknown,
    preserveUnkeyed: boolean,
    publishDocument: boolean,
    publishData: boolean,
  ): void {
    let committed = false
    try {
      control.replaceSnapshot(document, data, {
        preserveUnkeyed,
        publishDocument,
        publishData,
      }, (commit: InternalSnapshotCommit) => {
        state = {
          revision,
          document: commit.document,
          data: commit.data,
          mutationVersion: commit.mutationVersion,
        }
        invalidated = false
        committed = true
      })
    } catch (error) {
      if (!committed) throw error
      try {
        options.onNotificationError(error)
      } catch {
        // Notification reporting must not change the result of a committed update.
      }
    }
    if (!state || state.revision !== revision) throw new Error('Document update did not commit')
    if (!baselineMatches()) invalidated = true
  }

  function processSnapshot(message: Record<string, unknown>, revision: number): void {
    assertExactKeys(message, ['protocol', 'kind', 'revision', 'document', 'data'], 'message')
    if (state && revision <= state.revision) throw new Error('snapshot revision must be higher than the current revision')
    publish(revision, message.document, message.data, false, true, true)
  }

  function processUpdate(
    message: Record<string, unknown>,
    revision: number,
    work: JsonTraversalBudget,
  ): void {
    const keys = Object.keys(message)
    const allowed = new Set(['protocol', 'kind', 'revision', 'patch', 'data'])
    for (const key of keys) if (!allowed.has(key)) throw new TypeError(`message.${key} is not supported`)
    for (const key of ['protocol', 'kind', 'revision']) {
      if (!Object.prototype.hasOwnProperty.call(message, key)) throw new TypeError(`message.${key} is required`)
    }
    if (!state) throw new Error('the first document message must be a snapshot')
    if (revision !== state.revision + 1 || !Number.isSafeInteger(revision)) {
      throw new Error('update revision must be exactly one greater than the current revision')
    }
    if (invalidated || !baselineMatches()) {
      invalidated = true
      throw new Error('runtime changed outside this session; a higher revision snapshot is required')
    }

    const hasPatch = Object.prototype.hasOwnProperty.call(message, 'patch')
    const hasData = Object.prototype.hasOwnProperty.call(message, 'data')
    if (!hasPatch && !hasData) throw new TypeError('update must contain patch, data, or both')
    let patch: readonly unknown[] = []
    if (hasPatch) {
      if (!Array.isArray(message.patch)) throw new TypeError('message.patch must be an array')
      if (message.patch.length > maxPatchOperations) {
        throw new TypeError(`message.patch exceeds the maximum operation count of ${maxPatchOperations}`)
      }
      patch = message.patch
    }

    const currentDocument = runtime.document.getSnapshot()
    const currentData = runtime.data.getSnapshot()
    if (patch.length === 0 && !hasData) {
      state = {
        ...state,
        revision,
        mutationVersion: control.getMutationVersion(),
      }
      return
    }
    const nextDocument = patch.length > 0
      ? applyPatch(currentDocument, patch, control.limits, work)
      : currentDocument
    const nextData = hasData ? message.data : currentData
    publish(
      revision,
      nextDocument,
      nextData,
      patch.length > 0 && !hasData,
      patch.length > 0,
      hasData,
    )
  }

  return {
    apply(message) {
      if (destroyed) throw new Error('DocumentUpdateSession has been destroyed')
      recordAttempt()
      if (isBatchActive()) throw new Error('document updates cannot be applied inside a signal batch')
      if (applying) throw new Error('reentrant document update is not allowed')
      applying = true
      try {
        const work: JsonTraversalBudget = {
          visitedValues: 0,
          maxVisitedValues: maxPatchCandidateValuesPerMessage,
        }
        preflightJson(message, 'message', control.limits, work)
        if (!isRecord(message)) throw new TypeError('message must be an object')
        if (message.protocol !== 1) throw new TypeError('message.protocol must be 1')
        assertRevision(message.revision)
        if (message.kind === 'snapshot') {
          processSnapshot(message, message.revision)
          return
        }
        if (message.kind === 'update') {
          processUpdate(message, message.revision, work)
          return
        }
        throw new TypeError('message.kind must be snapshot or update')
      } finally {
        applying = false
      }
    },
    getRevision() {
      return state?.revision
    },
    destroy() {
      destroyed = true
    },
  }
}

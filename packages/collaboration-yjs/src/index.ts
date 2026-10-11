import {
  createStore,
  getAtPointer,
  parsePointer,
  RemoteSnapshotNotificationError,
  setAtPointer,
} from '@texaryn/core'
import type { FormMutation, FormRuntime, JsonPointer, JsonScalar, JsonValue, Store } from '@texaryn/core'
import * as Y from 'yjs'

const DEFAULT_DOCUMENT_KEY = 'texaryn-form-v1'
const MANIFEST_KEY = 'manifest'
const VALUE_PREFIX = 'value:'
const MAX_JSON_DEPTH = 64
const MAX_JSON_VALUES = 100_000
const MAX_ARRAY_ITEMS = 10_000
const MAX_TOTAL_STRING_LENGTH = 1_000_000
const MAX_OVERRIDES = 10_000

interface SessionManifest {
  protocol: 1
  schemaVersion: string
  baseline: JsonValue
}

export type YjsFormSessionStatus =
  | { status: 'connecting' }
  | { status: 'ready'; lastCommandRejection?: string; lastNotificationError?: Error }
  | { status: 'failed'; error: Error }
  | { status: 'closed' }

export interface YjsFormSessionOptions {
  doc: Y.Doc
  schemaVersion: string
  documentKey?: string
  onCommandRejected?: (error: Error) => void
  onNotificationError?: (error: Error) => void
}

export interface YjsFormSession {
  readonly status: Store<YjsFormSessionStatus>
  close(): void
}

function errorOf(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isScalar(value: unknown): value is JsonScalar {
  return value === null || typeof value === 'string' || typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
}

interface JsonBudget {
  values: number
  stringLength: number
  active: WeakSet<object>
}

function cloneJson(value: unknown, budget?: JsonBudget, depth = 0, pointer = ''): JsonValue {
  const state = budget ?? {
    values: 0,
    stringLength: 0,
    active: new WeakSet<object>(),
  }
  state.values++
  if (state.values > MAX_JSON_VALUES || depth > MAX_JSON_DEPTH) {
    throw new Error(`Shared JSON exceeds the supported size or depth at "${pointer}".`)
  }
  if (isScalar(value)) {
    if (typeof value === 'string') {
      state.stringLength += value.length
      if (state.stringLength > MAX_TOTAL_STRING_LENGTH) {
        throw new Error('Shared JSON exceeds the supported string size.')
      }
    }
    return value
  }
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Shared state contains a non-JSON value at "${pointer}".`)
  }
  if (state.active.has(value)) throw new Error('Shared state contains a cycle.')
  state.active.add(value)

  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS || Object.getOwnPropertySymbols(value).length > 0 ||
        Object.getOwnPropertyNames(value).length !== value.length + 1) {
      throw new Error(`Shared array exceeds its supported shape at "${pointer}".`)
    }
    const result: JsonValue[] = []
    for (let index = 0; index < value.length; index++) {
      if (!Object.hasOwn(value, index)) throw new Error(`Shared state contains a sparse array at "${pointer}".`)
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (!descriptor?.enumerable || !('value' in descriptor)) {
        throw new Error(`Shared state contains an accessor at "${pointer}/${index}".`)
      }
      result.push(cloneJson(descriptor.value, state, depth + 1, `${pointer}/${index}`))
    }
    state.active.delete(value)
    return result
  }

  if (!isRecord(value) || Object.getOwnPropertySymbols(value).length > 0 ||
      Object.getOwnPropertyNames(value).length !== Object.keys(value).length) {
    throw new Error(`Shared state contains a non-JSON object at "${pointer}".`)
  }
  const result: Record<string, JsonValue> = {}
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!descriptor.enumerable) continue
    if (!('value' in descriptor)) throw new Error(`Shared state contains an accessor at "${pointer}/${key}".`)
    state.stringLength += key.length
    if (state.stringLength > MAX_TOTAL_STRING_LENGTH) {
      throw new Error('Shared JSON exceeds the supported string size.')
    }
    Object.defineProperty(result, key, {
      value: cloneJson(descriptor.value, state, depth + 1, `${pointer}/${key}`),
      enumerable: true,
      configurable: true,
      writable: true,
    })
  }
  state.active.delete(value)
  return result
}

function escapePointerSegment(value: string): string {
  return value.replace(/~/g, '~0').replace(/\//g, '~1')
}

function canonicalPointer(pointer: string): string {
  const segments = parsePointer(pointer as JsonPointer)
  return segments.map((segment) => `/${escapePointerSegment(segment)}`).join('')
}

function assertScalarPath(baseline: JsonValue, pointer: string): JsonScalar {
  if (pointer.length > 2048 || canonicalPointer(pointer) !== pointer) {
    throw new Error(`Shared override has an invalid JSON Pointer: "${pointer}".`)
  }
  const value = getAtPointer(baseline, pointer as JsonPointer)
  if (!isScalar(value)) {
    throw new Error(`Shared override does not address a baseline scalar: "${pointer}".`)
  }
  return value
}

function assertOverrideBudget(overrides: Map<string, JsonScalar>): void {
  if (overrides.size > MAX_OVERRIDES) throw new Error('The shared document exceeds the override limit.')
  let totalStringLength = 0
  for (const [pointer, value] of overrides) {
    totalStringLength += pointer.length + (typeof value === 'string' ? value.length : 0)
    if (totalStringLength > MAX_TOTAL_STRING_LENGTH) {
      throw new Error('The shared document exceeds the supported override string size.')
    }
  }
}

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`,
    ).join(',')}}`
  }
  return JSON.stringify(value)
}

function readManifest(value: unknown): SessionManifest {
  const manifest = cloneJson(value)
  if (!isRecord(manifest) || manifest.protocol !== 1 || typeof manifest.schemaVersion !== 'string' ||
      manifest.schemaVersion.length === 0 || !Object.hasOwn(manifest, 'baseline')) {
    throw new Error('The shared document manifest is malformed or uses an unsupported protocol.')
  }
  const keys = Object.keys(manifest).sort()
  if (keys.join(',') !== 'baseline,protocol,schemaVersion') {
    throw new Error('The shared document manifest contains unsupported fields.')
  }
  return {
    protocol: 1,
    schemaVersion: manifest.schemaVersion,
    baseline: manifest.baseline as JsonValue,
  }
}

function readOverrides(root: Y.Map<unknown>, baseline: JsonValue): Map<string, JsonScalar> {
  const overrides = new Map<string, JsonScalar>()
  for (const [key, value] of root.entries()) {
    if (key === MANIFEST_KEY) continue
    if (!key.startsWith(VALUE_PREFIX)) throw new Error(`The shared document contains an unsupported key: "${key}".`)
    const pointer = key.slice(VALUE_PREFIX.length)
    assertScalarPath(baseline, pointer)
    const scalar = cloneJson(value)
    if (!isScalar(scalar)) throw new Error(`Shared override is not a JSON scalar at "${pointer}".`)
    overrides.set(pointer, scalar)
  }
  assertOverrideBudget(overrides)
  return overrides
}

function materialize(manifest: SessionManifest, overrides: Map<string, JsonScalar>): JsonValue {
  let data = cloneJson(manifest.baseline)
  for (const [pointer, value] of overrides) {
    data = setAtPointer(data, pointer as JsonPointer, value) as JsonValue
  }
  return data
}

function assertSharedSnapshotBudget(
  manifest: SessionManifest,
  overrides: Map<string, JsonScalar>,
): void {
  assertOverrideBudget(overrides)
  cloneJson(materialize(manifest, overrides))
}

function dataMutationPointer(mutation: FormMutation): string[] {
  if (mutation.command?.type === 'SetValue') {
    const node = mutation.beforeDocument.nodes[mutation.command.nodeId]
    if (node?.type !== 'field' || node.dataPointer == null) {
      throw new Error('The committed scalar edit has no field pointer.')
    }
    return [node.dataPointer]
  }
  if (mutation.command === undefined && mutation.changedPointers !== undefined) {
    return [...mutation.changedPointers]
  }
  throw new Error('The runtime committed a data change outside the supported collaboration protocol.')
}

export function createYjsFormSession(
  runtime: FormRuntime,
  options: YjsFormSessionOptions,
): YjsFormSession {
  const status = createStore<YjsFormSessionStatus>({ status: 'connecting' })
  const origin = {}
  const documentKey = options.documentKey ?? DEFAULT_DOCUMENT_KEY
  const doc = options.doc
  const cleanups: Array<() => void> = []
  let root: Y.Map<unknown> | undefined
  let closed = false
  let lastNotificationError: Error | undefined

  function detach(): void {
    for (const cleanup of cleanups.splice(0).reverse()) {
      try {
        cleanup()
      } catch {
        continue
      }
    }
  }

  function fail(reason: unknown): void {
    if (closed || status.getSnapshot().status === 'failed') return
    const error = errorOf(reason)
    closed = true
    detach()
    try {
      status.set({ status: 'failed', error })
    } catch {
      return
    }
  }

  function close(): void {
    if (closed) return
    closed = true
    detach()
    try {
      status.set({ status: 'closed' })
    } catch {
      return
    }
  }

  function reportNotificationError(reason: unknown): void {
    lastNotificationError = errorOf(reason)
    const current = status.getSnapshot()
    if (current.status === 'ready') {
      try {
        status.set({
          status: 'ready',
          ...(current.lastCommandRejection === undefined
            ? {}
            : { lastCommandRejection: current.lastCommandRejection }),
          lastNotificationError,
        })
      } catch {
        // The collaboration session stays attached even when status observers fail.
      }
    }
    try {
      options.onNotificationError?.(lastNotificationError)
    } catch {
      return
    }
  }

  function applySharedSnapshot(data: JsonValue): void {
    try {
      runtime.applyRemoteSnapshot(data, { origin })
    } catch (error) {
      if (!(error instanceof RemoteSnapshotNotificationError)) throw error
      reportNotificationError(error.notificationError)
    }
  }

  try {
    if (runtime.initializationPolicy !== 'none') {
      throw new Error('Yjs collaboration requires a runtime created with initialization: none.')
    }
    if (typeof options.schemaVersion !== 'string' || options.schemaVersion.length === 0 ||
        options.schemaVersion.length > 256) {
      throw new Error('schemaVersion must contain 1 to 256 characters and be supplied by the host.')
    }
    if (!/^[A-Za-z0-9:_-]{1,128}$/.test(documentKey)) {
      throw new Error('documentKey must contain 1 to 128 letters, numbers, colons, underscores or hyphens.')
    }

    root = doc.getMap<unknown>(documentKey)
    const localBaseline = cloneJson(runtime.data.getSnapshot())
    let manifest: SessionManifest
    if (!root.has(MANIFEST_KEY)) {
      if (root.size !== 0) throw new Error('The shared document has values but no manifest.')
      manifest = { protocol: 1, schemaVersion: options.schemaVersion, baseline: localBaseline }
      doc.transact(() => root!.set(MANIFEST_KEY, manifest), origin)
    } else {
      manifest = readManifest(root.get(MANIFEST_KEY))
      if (manifest.protocol !== 1 || manifest.schemaVersion !== options.schemaVersion) {
        throw new Error('The shared document schema or collaboration version does not match this runtime.')
      }
      if (canonicalJson(manifest.baseline) !== canonicalJson(localBaseline)) {
        throw new Error('The shared document baseline does not match this runtime.')
      }
    }

    const baseline = cloneJson(manifest.baseline)
    const overrides = readOverrides(root, baseline)
    assertSharedSnapshotBudget(manifest, overrides)
    const initialSharedData = materialize(manifest, overrides)
    if (canonicalJson(initialSharedData) !== canonicalJson(localBaseline)) {
      applySharedSnapshot(initialSharedData)
    }

    cleanups.push(runtime.lockArrayStructure())
    cleanups.push(runtime.registerCommandGuard((command, context) => {
      if (command.type !== 'SetValue') {
        if (command.type === 'Reset' || command.type === 'InsertItem' || command.type === 'RemoveItem' ||
            command.type === 'MoveItem') {
          return `${command.type} is disabled while scalar collaboration is active.`
        }
        return undefined
      }
      const node = context.document.nodes[command.nodeId]
      if (node?.type !== 'field' || node.dataPointer == null ||
          node.fieldType === 'array' || node.fieldType === 'object') {
        return 'Only scalar fields can be edited while collaboration is active.'
      }
      if (!isScalar(command.value)) return 'The shared field value must be a JSON scalar.'
      try {
        const baselineValue = assertScalarPath(baseline, node.dataPointer)
        const overrides = readOverrides(root!, baseline)
        if (canonicalJson(command.value) === canonicalJson(baselineValue)) {
          overrides.delete(node.dataPointer)
        } else {
          overrides.set(node.dataPointer, command.value)
        }
        assertSharedSnapshotBudget(manifest, overrides)
      } catch (error) {
        return errorOf(error).message
      }
      return undefined
    }, (reason) => {
      status.set({ status: 'ready', lastCommandRejection: reason })
      options.onCommandRejected?.(new Error(reason))
    }))

    cleanups.push(runtime.subscribeMutations((mutation) => {
      if (mutation.origin === origin || closed) return
      const pointers = dataMutationPointer(mutation)
      const writes: Array<[string, JsonScalar | undefined]> = []
      for (const pointer of pointers) {
        assertScalarPath(baseline, pointer)
        const value = cloneJson(getAtPointer(mutation.data, pointer as JsonPointer))
        if (!isScalar(value)) throw new Error(`The committed value is not scalar at "${pointer}".`)
        const previous = getAtPointer(mutation.beforeData, pointer as JsonPointer)
        if (Object.is(previous, value)) continue
        writes.push([pointer, canonicalJson(value) === canonicalJson(assertScalarPath(baseline, pointer))
          ? undefined
          : value])
      }
      if (writes.length === 0) return
      const candidateOverrides = readOverrides(root!, baseline)
      for (const [pointer, value] of writes) {
        if (value === undefined) candidateOverrides.delete(pointer)
        else candidateOverrides.set(pointer, value)
      }
      assertSharedSnapshotBudget(manifest, candidateOverrides)
      const current = status.getSnapshot()
      if (current.status === 'ready' && current.lastCommandRejection !== undefined) {
        status.set({ status: 'ready' })
      }
      doc.transact(() => {
        for (const [pointer, value] of writes) {
          const key = `${VALUE_PREFIX}${pointer}`
          if (value === undefined) root!.delete(key)
          else root!.set(key, value)
        }
      }, origin)
    }, fail))

    const observer = (_event: Y.YMapEvent<unknown>, transaction: Y.Transaction): void => {
      if (transaction.origin === origin || closed) return
      try {
        const currentManifest = readManifest(root!.get(MANIFEST_KEY))
        if (currentManifest.schemaVersion !== manifest.schemaVersion ||
            canonicalJson(currentManifest.baseline) !== canonicalJson(baseline)) {
          throw new Error('The shared document manifest no longer matches this session.')
        }
        const currentOverrides = readOverrides(root!, baseline)
        assertSharedSnapshotBudget(currentManifest, currentOverrides)
        const sharedData = materialize(currentManifest, currentOverrides)
        applySharedSnapshot(sharedData)
      } catch (error) {
        fail(error)
      }
    }
    root.observe(observer)
    cleanups.push(() => root?.unobserve(observer))
    status.set({
      status: 'ready',
      ...(lastNotificationError === undefined ? {} : { lastNotificationError }),
    })
  } catch (error) {
    fail(error)
  }

  return { status, close }
}

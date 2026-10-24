import type { DocumentRuntimeLimits } from './types.js'

export const documentRuntimeLimitMaximums: Readonly<DocumentRuntimeLimits> = Object.freeze({
  maxJsonDepth: 64,
  maxJsonValues: 250_000,
  maxArrayItems: 10_000,
  maxStringLength: 1_000_000,
  maxTotalStringLength: 10_000_000,
  maxDocumentNodes: 10_000,
  maxDocumentTreeDepth: 64,
  maxRowsPerCollection: 10_000,
  maxCollectionRows: 20_000,
  maxTableCells: 100_000,
})

export const maxPatchCandidateValuesPerMessage = 1_000_000

export interface JsonTraversalBudget {
  visitedValues: number
  maxVisitedValues: number
}

export function resolveDocumentRuntimeLimits(
  requested: Partial<DocumentRuntimeLimits> | undefined,
): DocumentRuntimeLimits {
  if (requested === undefined) return { ...documentRuntimeLimitMaximums }
  if (requested === null || typeof requested !== 'object' || Array.isArray(requested)) {
    throw new TypeError('limits must be an object')
  }
  const allowed = new Set(Object.keys(documentRuntimeLimitMaximums))
  for (const key of Reflect.ownKeys(requested)) {
    if (typeof key !== 'string' || !allowed.has(key)) throw new TypeError(`limits.${String(key)} is not supported`)
  }
  const result = { ...documentRuntimeLimitMaximums }
  for (const key of allowed) {
    const value = requested[key as keyof DocumentRuntimeLimits]
    if (value === undefined) continue
    const maximum = documentRuntimeLimitMaximums[key as keyof DocumentRuntimeLimits]
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
      throw new RangeError(`limits.${key} must be an integer from 1 to ${maximum}`)
    }
    result[key as keyof DocumentRuntimeLimits] = value
  }
  return result
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function addStringLength(
  length: number,
  path: string,
  limits: DocumentRuntimeLimits,
  totals: { stringLength: number },
): void {
  if (length > limits.maxStringLength) throw new TypeError(`${path} exceeds the maximum string length`)
  totals.stringLength += length
  if (totals.stringLength > limits.maxTotalStringLength) {
    throw new TypeError(`${path} exceeds the maximum total string length`)
  }
}

type VisitEntry = { value: unknown; path: string; depth: number } | { exit: object }

type ValueVisitEntry = { value: unknown; path: string; depth: number }

function countVisitedValue(
  entry: ValueVisitEntry,
  limits: DocumentRuntimeLimits,
  totals: { values: number; stringLength: number },
  work?: JsonTraversalBudget,
): void {
  totals.values += 1
  if (totals.values > limits.maxJsonValues) throw new TypeError(`${entry.path} exceeds the maximum JSON value count`)
  if (work) {
    work.visitedValues += 1
    if (work.visitedValues > work.maxVisitedValues) {
      throw new TypeError('patch candidate traversal exceeds the per-message work limit')
    }
  }
  if (entry.depth > limits.maxJsonDepth) throw new TypeError(`${entry.path} exceeds the maximum JSON depth`)
}

function isJsonArrayIndex(key: PropertyKey, length: number): boolean {
  if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key)) return false
  const index = Number(key)
  return Number.isSafeInteger(index) && index < length
}

function assertJsonArrayProperties(value: unknown[], path: string): void {
  const keys = Reflect.ownKeys(value)
  if (keys.length === value.length + 1 && keys.every((key) => key === 'length' || isJsonArrayIndex(key, value.length))) {
    return
  }
  throw new TypeError(`${path} contains a non-JSON array property`)
}

function pushArrayChildren(
  entry: ValueVisitEntry,
  value: unknown[],
  limits: DocumentRuntimeLimits,
  stack: VisitEntry[],
): void {
  if (value.length > limits.maxArrayItems) throw new TypeError(`${entry.path} exceeds the maximum array item count`)
  assertJsonArrayProperties(value, entry.path)
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      throw new TypeError(`${entry.path}[${index}] must be a JSON property`)
    }
    stack.push({ value: descriptor.value, path: `${entry.path}[${index}]`, depth: entry.depth + 1 })
  }
}

function pushObjectChildren(
  entry: ValueVisitEntry,
  value: object,
  limits: DocumentRuntimeLimits,
  totals: { values: number; stringLength: number },
  stack: VisitEntry[],
): void {
  if (!isPlainObject(value)) throw new TypeError(`${entry.path} must be a plain JSON object`)
  const keys = Reflect.ownKeys(value)
  if (keys.length > limits.maxJsonValues - totals.values) {
    throw new TypeError(`${entry.path} exceeds the maximum JSON value count`)
  }
  for (let index = keys.length - 1; index >= 0; index -= 1) {
    const key = keys[index]
    if (typeof key !== 'string') throw new TypeError(`${entry.path} must not contain symbol properties`)
    addStringLength(key.length, `${entry.path} property name`, limits, totals)
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      throw new TypeError(`${entry.path}.${key} must be a JSON property`)
    }
    stack.push({ value: descriptor.value, path: `${entry.path}.${key}`, depth: entry.depth + 1 })
  }
}

function visitJsonValue(
  entry: ValueVisitEntry,
  limits: DocumentRuntimeLimits,
  totals: { values: number; stringLength: number },
  active: Set<object>,
  stack: VisitEntry[],
): void {
  const value = entry.value
  if (value === null || typeof value === 'boolean') return
  if (typeof value === 'string') {
    addStringLength(value.length, entry.path, limits, totals)
    return
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${entry.path} must contain a finite number`)
    return
  }
  if (typeof value !== 'object') throw new TypeError(`${entry.path} is not a JSON value`)
  if (active.has(value)) throw new TypeError(`${entry.path} contains a cycle`)

  active.add(value)
  stack.push({ exit: value })
  if (Array.isArray(value)) {
    pushArrayChildren(entry, value, limits, stack)
    return
  }
  pushObjectChildren(entry, value, limits, totals, stack)
}

export function preflightJson(
  input: unknown,
  path: string,
  limits: DocumentRuntimeLimits,
  work?: JsonTraversalBudget,
): void {
  preflightJsonRoots([{ value: input, path }], limits, work)
}

export function preflightJsonRoots(
  roots: readonly { value: unknown; path: string }[],
  limits: DocumentRuntimeLimits,
  work?: JsonTraversalBudget,
): void {
  const active = new Set<object>()
  const totals = { values: 0, stringLength: 0 }
  const stack: VisitEntry[] = []
  for (let index = roots.length - 1; index >= 0; index -= 1) {
    stack.push({ value: roots[index]!.value, path: roots[index]!.path, depth: 0 })
  }

  while (stack.length > 0) {
    const entry = stack.pop()!
    if ('exit' in entry) {
      active.delete(entry.exit)
      continue
    }

    countVisitedValue(entry, limits, totals, work)
    visitJsonValue(entry, limits, totals, active, stack)
  }
}

export function assertDocumentNodeCount(value: Record<string, unknown>, limits: DocumentRuntimeLimits): void {
  if (Object.keys(value).length > limits.maxDocumentNodes) {
    throw new TypeError(`document.nodes exceeds the maximum node count of ${limits.maxDocumentNodes}`)
  }
}

export function assertDocumentTreeDepth(
  rootId: string,
  nodes: ReadonlyMap<string, { type: string; children?: readonly string[] }>,
  limits: DocumentRuntimeLimits,
): void {
  const stack: Array<{ nodeId: string; depth: number; exit?: true }> = [{ nodeId: rootId, depth: 1 }]
  const active = new Set<string>()
  const visited = new Set<string>()

  while (stack.length > 0) {
    const entry = stack.pop()!
    if (entry.exit) {
      active.delete(entry.nodeId)
      visited.add(entry.nodeId)
      continue
    }
    if (active.has(entry.nodeId)) throw new TypeError(`document.nodes.${entry.nodeId} creates a cycle`)
    if (visited.has(entry.nodeId)) continue
    if (entry.depth > limits.maxDocumentTreeDepth) {
      throw new TypeError(`document tree exceeds the maximum depth of ${limits.maxDocumentTreeDepth}`)
    }
    active.add(entry.nodeId)
    stack.push({ nodeId: entry.nodeId, depth: entry.depth, exit: true })
    const node = nodes.get(entry.nodeId)
    if (node?.type === 'container') {
      for (let index = (node.children?.length ?? 0) - 1; index >= 0; index -= 1) {
        stack.push({ nodeId: node.children![index]!, depth: entry.depth + 1 })
      }
    }
  }
}

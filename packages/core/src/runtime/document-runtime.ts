import { batch } from '../state/signal.js'
import { createStore } from '../state/store.js'
import type { Store, WritableStore } from '../state/store.js'
import { getAtPointer, parsePointer } from '../json-pointer.js'
import type {
  DocumentNode,
  ListNode,
  TableNode,
  UIDocumentV2,
} from '../ir/types.js'
import type {
  DocumentActionContext,
  DocumentActionRegistration,
  DocumentActionHandler,
  DocumentCollectionRow,
  DocumentRuntime,
  DocumentRuntimeOptions,
} from './types.js'
import type { JsonPointer, JsonScalar, JsonValue, NodeId, StableItemId } from '../types.js'
import {
  assertDocumentNodeCount,
  assertDocumentTreeDepth,
  preflightJson,
  preflightJsonRoots,
  resolveDocumentRuntimeLimits,
} from './document-limits.js'
import type { JsonTraversalBudget } from './document-limits.js'
import type { DocumentRuntimeLimits } from './types.js'
import { registerDocumentRuntimeControl } from './document-runtime-control.js'
import type { DocumentRuntimeControl, InternalSnapshotCommit } from './document-runtime-control.js'

type CollectionNode = ListNode | TableNode

interface CollectionIdentity {
  readonly dataPointer: string
  readonly rowKeyPointer: string | undefined
  readonly idsByKey: ReadonlyMap<string, StableItemId> | undefined
  readonly rowIds: readonly StableItemId[]
}

interface PreparedCollection {
  readonly node: CollectionNode
  readonly rows: readonly PreparedRow[]
}

interface PreparedRow {
  readonly value: JsonScalar
  readonly cells: readonly JsonScalar[]
  readonly key: string | undefined
}

interface CollectionSnapshot {
  readonly identities: ReadonlyMap<string, CollectionIdentity>
  readonly rows: ReadonlyMap<NodeId, readonly DocumentCollectionRow[]>
  readonly nextItemId: number
}

const objectPrototype = Object.prototype

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === objectPrototype || prototype === null
}

export function cloneJson(
  value: unknown,
  path: string,
  limits: DocumentRuntimeLimits,
  work?: JsonTraversalBudget,
): JsonValue {
  preflightJson(value, path, limits, work)
  return cloneJsonUnchecked(value, path, new Set())
}

function cloneJsonUnchecked(value: unknown, path: string, active: Set<object>): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must contain a finite number`)
    return value
  }
  if (typeof value !== 'object') throw new TypeError(`${path} is not a JSON value`)
  if (active.has(value)) throw new TypeError(`${path} contains a cycle`)
  active.add(value)
  try {
    if (Array.isArray(value)) {
      const keys = Reflect.ownKeys(value)
      if (keys.some((key) => {
        if (key === 'length') return false
        if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key)) return true
        const index = Number(key)
        return !Number.isSafeInteger(index) || index >= value.length
      })) {
        throw new TypeError(`${path} contains a non-JSON array property`)
      }
      const result: JsonValue[] = []
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new TypeError(`${path}[${index}] is missing`)
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
        if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
          throw new TypeError(`${path}[${index}] must be a JSON property`)
        }
        result.push(cloneJsonUnchecked(descriptor.value, `${path}[${index}]`, active))
      }
      return result
    }
    if (
      !isRecord(value) ||
      Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Reflect.ownKeys(value).length !== Object.keys(value).length
    ) {
      throw new TypeError(`${path} must be a plain JSON object`)
    }
    const result: Record<string, JsonValue> = Object.create(null) as Record<string, JsonValue>
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
        throw new TypeError(`${path}.${key} must be a JSON property`)
      }
      result[key] = cloneJsonUnchecked(descriptor.value, `${path}.${key}`, active)
    }
    return result
  } finally {
    active.delete(value)
  }
}

function deepFreeze<T extends JsonValue>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

function fail(path: string, message: string): never {
  throw new TypeError(`${path} ${message}`)
}

function requiredString(record: Record<string, unknown>, key: string, path: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) fail(`${path}.${key}`, 'must be a nonempty string')
  return value
}

function assertKeys(record: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedSet = new Set(allowed)
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) fail(`${path}.${key}`, 'is not supported')
  }
}

function assertPointer(value: unknown, path: string): asserts value is JsonPointer {
  if (typeof value !== 'string' || (value !== '' && !value.startsWith('/'))) {
    fail(path, 'must be a JSON Pointer')
  }
  if (/~(?![01])/.test(value)) fail(path, 'contains an invalid JSON Pointer escape')
  try {
    parsePointer(value as JsonPointer)
  } catch {
    fail(path, 'must be a JSON Pointer')
  }
}

function validateAnnotations(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!isRecord(value)) fail(path, 'must be an object')
  assertKeys(value, ['title', 'description', 'readOnly', 'writeOnly', 'deprecated', 'examples', 'default'], path)
  for (const key of ['title', 'description'] as const) {
    if (value[key] !== undefined && typeof value[key] !== 'string') fail(`${path}.${key}`, 'must be a string')
  }
  for (const key of ['readOnly', 'writeOnly', 'deprecated'] as const) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') fail(`${path}.${key}`, 'must be a boolean')
  }
  if (value.examples !== undefined && !Array.isArray(value.examples)) fail(`${path}.examples`, 'must be an array')
}

function validateDocument(value: unknown, limits: DocumentRuntimeLimits): UIDocumentV2 {
  const snapshot = cloneJson(value, 'document', limits)
  if (!isRecord(snapshot)) fail('document', 'must be an object')
  assertKeys(snapshot, ['version', 'rootId', 'nodes'], 'document')
  if (snapshot.version !== 2) fail('document.version', 'must be 2')
  const rootId = requiredString(snapshot, 'rootId', 'document') as NodeId
  if (!isRecord(snapshot.nodes)) fail('document.nodes', 'must be an object')
  const inputNodes = snapshot.nodes
  assertDocumentNodeCount(inputNodes, limits)
  const nodes = new Map<NodeId, DocumentNode>()
  const collectionIds = new Set<string>()

  for (const [mapKey, candidate] of Object.entries(inputNodes)) {
    const path = `document.nodes.${mapKey}`
    if (!isRecord(candidate)) fail(path, 'must be an object')
    const node = candidate
    if (requiredString(node, 'id', path) !== mapKey) fail(`${path}.id`, 'must match its map key')
    const type = requiredString(node, 'type', path)
    const parentIdValue = node.parentId
    if (parentIdValue !== null && (typeof parentIdValue !== 'string' || parentIdValue.length === 0)) {
      fail(`${path}.parentId`, 'must be null or a node ID')
    }
    validateAnnotations(node.annotations, `${path}.annotations`)

    if (type === 'container') {
      assertKeys(node, ['id', 'type', 'parentId', 'annotations', 'containerType', 'children'], path)
      if (node.containerType !== 'group' && node.containerType !== 'layout') {
        fail(`${path}.containerType`, 'must be group or layout')
      }
      if (!Array.isArray(node.children) || node.children.some((child) => typeof child !== 'string' || child.length === 0)) {
        fail(`${path}.children`, 'must be an array of node IDs')
      }
      if (node.containerType === 'group') {
        const title = node.annotations.title
        if (typeof title !== 'string' || title.trim().length === 0) {
          fail(`${path}.annotations.title`, 'must provide the accessible group name')
        }
      }
      nodes.set(mapKey as NodeId, node as unknown as DocumentNode)
      continue
    }

    if (type === 'text') {
      assertKeys(node, ['id', 'type', 'parentId', 'annotations', 'content', 'textRole'], path)
      if (typeof node.content !== 'string') fail(`${path}.content`, 'must be a string')
      if (node.textRole !== 'heading' && node.textRole !== 'paragraph' && node.textRole !== 'help') {
        fail(`${path}.textRole`, 'is not supported by display documents')
      }
      nodes.set(mapKey as NodeId, node as unknown as DocumentNode)
      continue
    }

    if (type === 'action') {
      assertKeys(node, ['id', 'type', 'parentId', 'annotations', 'actionType', 'label', 'actionArgs', 'buttonRole'], path)
      requiredString(node, 'actionType', path)
      requiredString(node, 'label', path)
      if (node.buttonRole !== 'button') fail(`${path}.buttonRole`, 'must be button')
      nodes.set(mapKey as NodeId, node as unknown as DocumentNode)
      continue
    }

    if (type === 'list') {
      assertKeys(node, ['id', 'type', 'parentId', 'annotations', 'collectionId', 'dataPointer', 'valuePointer', 'rowKeyPointer'], path)
      const collectionId = requiredString(node, 'collectionId', path)
      if (collectionIds.has(collectionId)) fail(`${path}.collectionId`, 'must be unique in the document')
      collectionIds.add(collectionId)
      assertPointer(node.dataPointer, `${path}.dataPointer`)
      assertPointer(node.valuePointer, `${path}.valuePointer`)
      if (node.rowKeyPointer !== undefined) assertPointer(node.rowKeyPointer, `${path}.rowKeyPointer`)
      nodes.set(mapKey as NodeId, node as unknown as DocumentNode)
      continue
    }

    if (type === 'table') {
      assertKeys(node, ['id', 'type', 'parentId', 'annotations', 'collectionId', 'dataPointer', 'rowKeyPointer', 'columns'], path)
      const collectionId = requiredString(node, 'collectionId', path)
      if (collectionIds.has(collectionId)) fail(`${path}.collectionId`, 'must be unique in the document')
      collectionIds.add(collectionId)
      assertPointer(node.dataPointer, `${path}.dataPointer`)
      if (node.rowKeyPointer !== undefined) assertPointer(node.rowKeyPointer, `${path}.rowKeyPointer`)
      if (!Array.isArray(node.columns)) fail(`${path}.columns`, 'must be an array')
      const columnIds = new Set<string>()
      for (const [index, columnValue] of node.columns.entries()) {
        const columnPath = `${path}.columns[${index}]`
        if (!isRecord(columnValue)) fail(columnPath, 'must be an object')
        assertKeys(columnValue, ['id', 'label', 'valuePointer'], columnPath)
        const columnId = requiredString(columnValue, 'id', columnPath)
        if (columnIds.has(columnId)) fail(`${columnPath}.id`, 'must be unique within its table')
        columnIds.add(columnId)
        if (typeof columnValue.label !== 'string') fail(`${columnPath}.label`, 'must be a string')
        assertPointer(columnValue.valuePointer, `${columnPath}.valuePointer`)
      }
      nodes.set(mapKey as NodeId, node as unknown as DocumentNode)
      continue
    }

    fail(`${path}.type`, `has unsupported node kind ${type}`)
  }

  const root = nodes.get(rootId)
  if (!root) fail('document.rootId', 'does not name a node')
  if (root.parentId !== null) fail(`document.nodes.${rootId}.parentId`, 'must be null for the root')

  const childOwners = new Map<NodeId, NodeId>()
  for (const [parentId, node] of nodes) {
    if (node.type !== 'container') continue
    const seenChildren = new Set<NodeId>()
    for (const child of node.children) {
      const childId = child as NodeId
      if (seenChildren.has(childId)) fail(`document.nodes.${parentId}.children`, 'contains a duplicate child')
      seenChildren.add(childId)
      const childNode = nodes.get(childId)
      if (!childNode) fail(`document.nodes.${parentId}.children`, `references missing node ${childId}`)
      if (childNode.parentId !== parentId) fail(`document.nodes.${childId}.parentId`, 'does not agree with its parent children list')
      if (childOwners.has(childId)) fail(`document.nodes.${childId}`, 'has more than one parent')
      childOwners.set(childId, parentId)
    }
  }

  assertDocumentTreeDepth(rootId, nodes, limits)
  const reachable = new Set<NodeId>()
  const pending = [rootId]
  while (pending.length > 0) {
    const nodeId = pending.pop()!
    if (reachable.has(nodeId)) continue
    reachable.add(nodeId)
    const node = nodes.get(nodeId)
    if (node?.type === 'container') {
      for (const childId of node.children) pending.push(childId)
    }
  }
  if (reachable.size !== nodes.size) fail('document.nodes', 'contains unreachable nodes')
  for (const [nodeId, node] of nodes) {
    if (nodeId !== rootId && !childOwners.has(nodeId)) fail(`document.nodes.${nodeId}`, 'has no parent')
  }

  return deepFreeze(snapshot) as unknown as UIDocumentV2
}

function assertScalar(value: unknown, path: string): JsonScalar {
  if (value === undefined || value === null) return null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  fail(path, 'must resolve to a scalar, null, or missing value')
}

function keyToken(value: unknown, path: string): string {
  if (typeof value === 'string') return `s:${value}`
  if (typeof value === 'number' && Number.isFinite(value)) return `n:${String(value)}`
  fail(path, 'must resolve to a string or finite number')
}

function prepareCollections(
  document: UIDocumentV2,
  data: JsonValue,
  limits: DocumentRuntimeLimits,
): PreparedCollection[] {
  const result: PreparedCollection[] = []
  let totalRows = 0
  let totalCells = 0
  for (const candidate of Object.values(document.nodes)) {
    if (candidate.type !== 'list' && candidate.type !== 'table') continue
    const node = candidate
    const source = getAtPointer(data, node.dataPointer)
    if (source === undefined) {
      result.push({ node, rows: [] })
      continue
    }
    if (!Array.isArray(source)) fail(`collection ${node.collectionId}`, 'source must be an array when present')
    if (source.length > limits.maxRowsPerCollection) {
      fail(`collection ${node.collectionId}`, `exceeds the maximum row count of ${limits.maxRowsPerCollection}`)
    }
    totalRows += source.length
    if (totalRows > limits.maxCollectionRows) {
      fail('collections', `exceed the maximum total row count of ${limits.maxCollectionRows}`)
    }
    if (node.type === 'table') {
      totalCells += source.length * node.columns.length
      if (totalCells > limits.maxTableCells) {
        fail('collections', `exceed the maximum table cell count of ${limits.maxTableCells}`)
      }
    }
    const rows: PreparedRow[] = []
    for (const [index, item] of source.entries()) {
      const path = `collection ${node.collectionId}[${index}]`
      if (node.type === 'table' && !isRecord(item)) fail(path, 'must be an object for a table row')
      const key = node.rowKeyPointer === undefined
        ? undefined
        : keyToken(getAtPointer(item, node.rowKeyPointer), `${path} row key`)
      const value = node.type === 'list'
        ? assertScalar(getAtPointer(item, node.valuePointer), `${path} list value`)
        : null
      const cells = node.type === 'table'
        ? node.columns.map((column) => assertScalar(getAtPointer(item, column.valuePointer), `${path} column ${column.id}`))
        : []
      rows.push({ value, cells, key })
    }
    if (node.rowKeyPointer !== undefined) {
      const keys = new Set<string>()
      for (const row of rows) {
        if (row.key === undefined) fail(`collection ${node.collectionId}`, 'row key is missing')
        if (keys.has(row.key)) fail(`collection ${node.collectionId}`, `contains duplicate row key ${row.key}`)
        keys.add(row.key)
      }
    }
    result.push({ node, rows })
  }
  return result
}

function freezeRows(rows: DocumentCollectionRow[]): readonly DocumentCollectionRow[] {
  for (const row of rows) {
    Object.freeze(row.cells)
    Object.freeze(row)
  }
  return Object.freeze(rows)
}

function assertActionArgumentValidators(
  document: UIDocumentV2,
  actions: ReadonlyMap<string, DocumentActionRegistration>,
): void {
  for (const node of Object.values(document.nodes)) {
    if (node.type !== 'action' || !Object.prototype.hasOwnProperty.call(node, 'actionArgs')) continue
    const action = actions.get(node.actionType)
    if (action && !action.validateArgs) {
      throw new TypeError(`Action ${node.actionType} has arguments but no validateArgs registration`)
    }
  }
}

export function createDocumentRuntime(
  inputDocument: unknown,
  options: DocumentRuntimeOptions = {},
): DocumentRuntime {
  const limits = resolveDocumentRuntimeLimits(options.limits)
  const initialInputData = options.initialData === undefined ? {} : options.initialData
  preflightJsonRoots([
    { value: inputDocument, path: 'document' },
    { value: initialInputData, path: 'data' },
  ], limits)
  const initialData = deepFreeze(cloneJson(initialInputData, 'data', limits))
  let document = validateDocument(inputDocument, limits)
  let nextItemId = 0
  let identities = new Map<string, CollectionIdentity>()
  let destroyed = false
  let mutationVersion = 0

  function makeSnapshot(
    nextDocument: UIDocumentV2,
    data: JsonValue,
    previous: ReadonlyMap<string, CollectionIdentity>,
    preserveUnkeyed: boolean,
  ): CollectionSnapshot {
    const prepared = prepareCollections(nextDocument, data, limits)
    const nextIdentities = new Map<string, CollectionIdentity>()
    const collectionRows = new Map<NodeId, readonly DocumentCollectionRow[]>()
    let candidateItemId = nextItemId

    function newItemId(): StableItemId {
      candidateItemId += 1
      return `document-item-${candidateItemId}` as StableItemId
    }

    for (const { node, rows } of prepared) {
      const previousIdentity = previous.get(node.collectionId)
      const compatible = previousIdentity !== undefined &&
        previousIdentity.dataPointer === node.dataPointer &&
        previousIdentity.rowKeyPointer === node.rowKeyPointer
      const keyed = node.rowKeyPointer !== undefined
      const previousKeys = compatible && keyed ? previousIdentity.idsByKey : undefined
      const previousRows = compatible && !keyed && preserveUnkeyed ? previousIdentity.rowIds : undefined
      const idsByKey = keyed ? new Map<string, StableItemId>() : undefined
      const ids: StableItemId[] = []
      const output: DocumentCollectionRow[] = []

      rows.forEach((row, index) => {
        let id: StableItemId
        if (row.key !== undefined) {
          id = previousKeys?.get(row.key) ?? newItemId()
          idsByKey!.set(row.key, id)
        } else {
          id = previousRows?.[index] ?? newItemId()
        }
        ids.push(id)
        output.push({ id, value: row.value, cells: [...row.cells] })
      })

      nextIdentities.set(node.collectionId, {
        dataPointer: node.dataPointer,
        rowKeyPointer: node.rowKeyPointer,
        idsByKey,
        rowIds: ids,
      })
      collectionRows.set(node.id, freezeRows(output))
    }

    return { identities: nextIdentities, rows: collectionRows, nextItemId: candidateItemId }
  }

  const initialSnapshot = makeSnapshot(document, initialData, identities, false)
  identities = new Map(initialSnapshot.identities)
  nextItemId = initialSnapshot.nextItemId
  const documentStore = createStore(document)
  const dataStore = createStore(initialData)
  const collectionStores = new Map<NodeId, WritableStore<readonly DocumentCollectionRow[]>>()
  for (const [nodeId, rows] of initialSnapshot.rows) collectionStores.set(nodeId, createStore(rows))

  const actions = new Map<string, DocumentActionRegistration>()
  for (const [name, action] of Object.entries(options.actions ?? {})) {
    if (name.length === 0) throw new TypeError('Action handlers must have nonempty names')
    if (typeof action === 'function') {
      actions.set(name, { handler: action })
      continue
    }
    if (!isRecord(action)) throw new TypeError(`Action ${name} must be a handler or registration object`)
    assertKeys(action, ['handler', 'validateArgs'], `actions.${name}`)
    if (typeof action.handler !== 'function') throw new TypeError(`actions.${name}.handler must be a function`)
    if (action.validateArgs !== undefined && typeof action.validateArgs !== 'function') {
      throw new TypeError(`actions.${name}.validateArgs must be a function`)
    }
    actions.set(name, {
      handler: action.handler as DocumentActionHandler,
      validateArgs: action.validateArgs as DocumentActionRegistration['validateArgs'],
    })
  }
  assertActionArgumentValidators(document, actions)

  function assertActive(): void {
    if (destroyed) throw new Error('DocumentRuntime has been destroyed')
  }

  function publishCollections(snapshot: CollectionSnapshot): void {
    const nextStores = new Map<NodeId, WritableStore<readonly DocumentCollectionRow[]>>()
    for (const [nodeId, store] of collectionStores) {
      if (!snapshot.rows.has(nodeId)) store.set(Object.freeze([]))
    }
    for (const [nodeId, rows] of snapshot.rows) {
      const store = collectionStores.get(nodeId) ?? createStore(rows)
      store.set(rows)
      nextStores.set(nodeId, store)
    }
    collectionStores.clear()
    for (const [nodeId, store] of nextStores) collectionStores.set(nodeId, store)
  }

  function prepareSnapshot(inputDocumentValue: unknown, inputDataValue: unknown, preserveUnkeyed: boolean) {
    preflightJsonRoots([
      { value: inputDocumentValue, path: 'document' },
      { value: inputDataValue, path: 'data' },
    ], limits)
    const nextDocument = validateDocument(inputDocumentValue, limits)
    assertActionArgumentValidators(nextDocument, actions)
    const nextData = deepFreeze(cloneJson(inputDataValue, 'data', limits))
    const snapshot = makeSnapshot(nextDocument, nextData, identities, preserveUnkeyed)
    return { document: nextDocument, data: nextData, collections: snapshot }
  }

  function commitSnapshot(
    prepared: ReturnType<typeof prepareSnapshot>,
    publication: { document: boolean; data: boolean },
    onCommit?: (commit: InternalSnapshotCommit) => void,
  ): void {
    batch(() => {
      identities = new Map(prepared.collections.identities)
      nextItemId = prepared.collections.nextItemId
      publishCollections(prepared.collections)
      if (publication.document) {
        document = prepared.document
        documentStore.set(prepared.document)
      }
      if (publication.data) dataStore.set(prepared.data)
      mutationVersion += 1
      onCommit?.({
        document: documentStore.getSnapshot(),
        data: dataStore.getSnapshot(),
        mutationVersion,
      })
    })
  }

  const runtime: DocumentRuntime = {
    document: documentStore,
    data: dataStore,
    replaceDocument(input) {
      assertActive()
      const prepared = prepareSnapshot(input, dataStore.getSnapshot(), true)
      commitSnapshot(prepared, { document: true, data: false })
    },
    setData(input) {
      assertActive()
      const prepared = prepareSnapshot(document, input, false)
      commitSnapshot(prepared, { document: false, data: true })
    },
    replaceSnapshot(inputDocumentValue, inputDataValue) {
      assertActive()
      const prepared = prepareSnapshot(inputDocumentValue, inputDataValue, false)
      commitSnapshot(prepared, { document: true, data: true })
    },
    getCollection(nodeId) {
      return collectionStores.get(nodeId)
    },
    hasActionHandler(actionType) {
      return actions.has(actionType)
    },
    async invokeAction(nodeId) {
      assertActive()
      const node = document.nodes[nodeId as string]
      if (!node || node.type !== 'action') throw new Error(`Node ${nodeId} is not a display action`)
      const action = actions.get(node.actionType)
      if (!action) throw new Error(`No host action is registered for ${node.actionType}`)
      const hasArgs = Object.prototype.hasOwnProperty.call(node, 'actionArgs')
      let args: JsonValue | undefined
      if (action.validateArgs) {
        const validatedArgs = action.validateArgs(hasArgs ? node.actionArgs : undefined)
        args = validatedArgs === undefined
          ? undefined
          : deepFreeze(cloneJson(validatedArgs, 'actionArgs', limits))
      } else if (hasArgs) {
        throw new TypeError(`Action ${node.actionType} does not accept arguments`)
      }
      const context: DocumentActionContext = Object.freeze({
        nodeId,
        document,
        data: dataStore.getSnapshot(),
      })
      await action.handler(args, context)
    },
    destroy() {
      destroyed = true
    },
  }

  const control: DocumentRuntimeControl = {
    limits,
    getMutationVersion: () => mutationVersion,
    replaceSnapshot(inputDocumentValue, inputDataValue, publication, onCommit) {
      assertActive()
      const prepared = prepareSnapshot(inputDocumentValue, inputDataValue, publication.preserveUnkeyed)
      commitSnapshot(prepared, {
        document: publication.publishDocument,
        data: publication.publishData,
      }, onCommit)
    },
  }
  registerDocumentRuntimeControl(runtime, control)
  return runtime
}

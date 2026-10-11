import { describe, expect, it, vi } from 'vitest'
import { createDocumentRuntime } from '../document-runtime.js'
import type { UIDocumentV2 } from '../../ir/types.js'
import type { JsonPointer, NodeId } from '../../types.js'

const id = (value: string) => value as NodeId
const pointer = (value: string) => value as JsonPointer

function document(): UIDocumentV2 {
  return {
    version: 2,
    rootId: id('root'),
    nodes: {
      root: {
        id: id('root'),
        type: 'container',
        parentId: null,
        annotations: { title: 'Results' },
        containerType: 'group',
        children: [id('list'), id('table'), id('action')],
      },
      list: {
        id: id('list'),
        type: 'list',
        parentId: id('root'),
        annotations: {},
        collectionId: 'list-results',
        dataPointer: pointer('/items'),
        valuePointer: pointer('/label'),
        rowKeyPointer: pointer('/id'),
      },
      table: {
        id: id('table'),
        type: 'table',
        parentId: id('root'),
        annotations: {},
        collectionId: 'table-results',
        dataPointer: pointer('/items'),
        rowKeyPointer: pointer('/id'),
        columns: [
          { id: 'label', label: 'Name', valuePointer: pointer('/label') },
          { id: 'active', label: 'Active', valuePointer: pointer('/active') },
        ],
      },
      action: {
        id: id('action'),
        type: 'action',
        parentId: id('root'),
        annotations: {},
        actionType: 'open-item',
        label: 'Open',
        actionArgs: { source: 'results' },
        buttonRole: 'button',
      },
    },
  }
}

const rows = [
  { id: 'a', label: 'First', active: true },
  { id: 'b', label: 'Second', active: false },
]

function initialData(items: unknown = rows) {
  return { items }
}

describe('DocumentRuntime', () => {
  it('publishes immutable document, data, and table and list snapshots', () => {
    const input = document()
    const data = initialData()
    const runtime = createDocumentRuntime(input, { initialData: data })
    const list = runtime.getCollection(id('list'))!.getSnapshot()
    const table = runtime.getCollection(id('table'))!.getSnapshot()

    expect(runtime.document.getSnapshot()).not.toBe(input)
    expect(runtime.data.getSnapshot()).not.toBe(data)
    expect(list.map((row) => row.value)).toEqual(['First', 'Second'])
    expect(table.map((row) => row.cells)).toEqual([
      ['First', true],
      ['Second', false],
    ])
    expect(Object.isFrozen(runtime.document.getSnapshot())).toBe(true)
    expect(Object.isFrozen(runtime.data.getSnapshot())).toBe(true)
    expect(Object.isFrozen(list)).toBe(true)
    expect(Object.isFrozen(list[0])).toBe(true)
  })

  it('keeps keyed identities through data reordering and starts a new unkeyed lifetime', () => {
    const doc = document()
    const unkeyed = {
      id: id('unkeyed'),
      type: 'list',
      parentId: id('root'),
      annotations: {},
      collectionId: 'unkeyed-items',
      dataPointer: pointer('/items'),
      valuePointer: pointer('/label'),
    } as const
    const root = doc.nodes.root
    if (root.type !== 'container') throw new Error('expected root container')
    root.children.push(unkeyed.id)
    doc.nodes[unkeyed.id] = unkeyed
    const runtime = createDocumentRuntime(doc, { initialData: initialData() })
    const keyedBefore = runtime.getCollection(id('list'))!.getSnapshot()
    const unkeyedBefore = runtime.getCollection(unkeyed.id)!.getSnapshot()

    runtime.setData(initialData([rows[1], rows[0], { id: 'c', label: 'Third', active: true }]))

    const keyedAfter = runtime.getCollection(id('list'))!.getSnapshot()
    const unkeyedAfter = runtime.getCollection(unkeyed.id)!.getSnapshot()
    expect(keyedAfter[0]!.id).toBe(keyedBefore[1]!.id)
    expect(keyedAfter[1]!.id).toBe(keyedBefore[0]!.id)
    expect(keyedAfter[2]!.id).not.toBe(keyedBefore[0]!.id)
    expect(unkeyedAfter.map((row) => row.id)).not.toEqual(unkeyedBefore.map((row) => row.id))
  })

  it('allows object list rows when the selected pointer yields a scalar', () => {
    const runtime = createDocumentRuntime(document(), {
      initialData: initialData([{ id: 'object-row', label: 'Object row' }]),
    })
    expect(runtime.getCollection(id('list'))!.getSnapshot()[0]!.value).toBe('Object row')
  })

  it('renders missing and null selected values as empty values', () => {
    const runtime = createDocumentRuntime(document(), {
      initialData: initialData([{ id: 'a' }, { id: 'b', label: null }]),
    })
    expect(runtime.getCollection(id('list'))!.getSnapshot().map((row) => row.value)).toEqual([null, null])
    expect(runtime.getCollection(id('table'))!.getSnapshot().map((row) => row.cells)).toEqual([
      [null, null],
      [null, null],
    ])
  })

  it('rejects invalid data atomically and retains data and collection identities', () => {
    const runtime = createDocumentRuntime(document(), { initialData: initialData() })
    const previousData = runtime.data.getSnapshot()
    const previousRows = runtime.getCollection(id('list'))!.getSnapshot()
    const listener = vi.fn(() => undefined)
    runtime.data.subscribe(listener)

    expect(() => runtime.setData(initialData([{ id: 'a', label: { nested: true } }]))).toThrow(/scalar/)
    expect(() => runtime.setData(initialData([{ id: 'a', label: 'one' }, { id: 'a', label: 'two' }]))).toThrow(/duplicate row key/)
    expect(runtime.data.getSnapshot()).toBe(previousData)
    expect(runtime.getCollection(id('list'))!.getSnapshot()).toBe(previousRows)
    expect(listener).not.toHaveBeenCalled()
  })

  it('rejects duplicate table column IDs and retains the current document', () => {
    const runtime = createDocumentRuntime(document(), { initialData: initialData() })
    const previous = runtime.document.getSnapshot()
    const invalid = document()
    const table = invalid.nodes.table
    if (table.type !== 'table') throw new Error('expected table node')
    table.columns[1] = { ...table.columns[1]!, id: table.columns[0]!.id }

    expect(() => runtime.replaceDocument(invalid)).toThrow(/unique within its table/)
    expect(runtime.document.getSnapshot()).toBe(previous)
  })

  it('preserves keyed IDs across compatible document replacement', () => {
    const runtime = createDocumentRuntime(document(), { initialData: initialData() })
    const previous = runtime.getCollection(id('list'))!.getSnapshot().map((row) => row.id)
    runtime.replaceDocument(document())
    expect(runtime.getCollection(id('list'))!.getSnapshot().map((row) => row.id)).toEqual(previous)
  })

  it('publishes document, data, and collection changes in one transaction', () => {
    const runtime = createDocumentRuntime(document(), { initialData: initialData() })
    const observations: Array<[unknown, unknown, number]> = []
    runtime.document.subscribe(() => {
      observations.push([
        runtime.document.getSnapshot(),
        runtime.data.getSnapshot(),
        runtime.getCollection(id('list'))!.getSnapshot().length,
      ])
    })
    runtime.data.subscribe(() => {
      observations.push([
        runtime.document.getSnapshot(),
        runtime.data.getSnapshot(),
        runtime.getCollection(id('list'))!.getSnapshot().length,
      ])
    })
    runtime.getCollection(id('list'))!.subscribe(() => {
      observations.push([
        runtime.document.getSnapshot(),
        runtime.data.getSnapshot(),
        runtime.getCollection(id('list'))!.getSnapshot().length,
      ])
    })

    runtime.setData(initialData([rows[0]]))

    expect(observations.length).toBeGreaterThan(0)
    expect(observations.every(([, observedData, length]) => {
      return observedData === runtime.data.getSnapshot() && length === 1
    })).toBe(true)
  })

  it('runs registered host actions with immutable arguments and context', async () => {
    const handler = vi.fn()
    const runtime = createDocumentRuntime(document(), {
      initialData: initialData(),
      actions: {
        'open-item': {
          validateArgs(args) {
            if (args === null || typeof args !== 'object' || Array.isArray(args)) {
              throw new TypeError('open-item args must be an object')
            }
            return args
          },
          handler,
        },
      },
    })
    expect(runtime.hasActionHandler('open-item')).toBe(true)
    expect(runtime.hasActionHandler('missing')).toBe(false)
    await runtime.invokeAction(id('action'))
    expect(handler).toHaveBeenCalledWith(
      { source: 'results' },
      expect.objectContaining({ document: runtime.document.getSnapshot(), data: runtime.data.getSnapshot() }),
    )
    expect(Object.isFrozen(handler.mock.calls[0]![0])).toBe(true)
    await expect(runtime.invokeAction(id('list'))).rejects.toThrow(/not a display action/)
    const withoutHandler = createDocumentRuntime(document())
    expect(withoutHandler.hasActionHandler('open-item')).toBe(false)
    await expect(withoutHandler.invokeAction(id('action'))).rejects.toThrow(/No host action/)
  })

  it('requires a validator for action arguments and freezes the validated result', async () => {
    expect(() => createDocumentRuntime(document(), { actions: { 'open-item': vi.fn() } }))
      .toThrow(/no validateArgs registration/)

    const handler = vi.fn()
    const runtime = createDocumentRuntime(document(), {
      actions: {
        'open-item': {
          validateArgs(args) {
            if (args === null || typeof args !== 'object' || Array.isArray(args)) {
              throw new TypeError('open-item args must be an object')
            }
            return { source: args.source, allowed: true }
          },
          handler,
        },
      },
    })
    await runtime.invokeAction(id('action'))
    expect(handler.mock.calls[0]![0]).toEqual({ source: 'results', allowed: true })
    expect(Object.isFrozen(handler.mock.calls[0]![0])).toBe(true)
  })

  it('replaces document and data as one atomic snapshot', () => {
    const runtime = createDocumentRuntime(document(), { initialData: initialData() })
    const nextDocument = document()
    const nextData = initialData([rows[0]])
    const observations: Array<[unknown, unknown, number]> = []
    runtime.document.subscribe(() => {
      observations.push([
        runtime.document.getSnapshot(),
        runtime.data.getSnapshot(),
        runtime.getCollection(id('list'))!.getSnapshot().length,
      ])
    })
    runtime.data.subscribe(() => {
      observations.push([
        runtime.document.getSnapshot(),
        runtime.data.getSnapshot(),
        runtime.getCollection(id('list'))!.getSnapshot().length,
      ])
    })

    runtime.replaceSnapshot(nextDocument, nextData)

    expect(runtime.document.getSnapshot()).not.toBe(nextDocument)
    expect(runtime.data.getSnapshot()).not.toBe(nextData)
    expect(observations.length).toBeGreaterThan(0)
    expect(observations.every(([, data, length]) => data === runtime.data.getSnapshot() && length === 1)).toBe(true)
  })

  it('rejects JSON and document resource limits before publishing', () => {
    const runtime = createDocumentRuntime(document(), {
      initialData: initialData(),
      limits: { maxJsonDepth: 8, maxDocumentNodes: 4 },
    })
    const previousData = runtime.data.getSnapshot()
    let tooDeep: unknown = true
    for (let index = 0; index < 10; index += 1) tooDeep = { value: tooDeep }
    expect(() => runtime.setData(tooDeep)).toThrow(/maximum JSON depth/)
    const invalidDocument = document()
    const root = invalidDocument.nodes.root
    if (root.type !== 'container') throw new Error('expected root container')
    root.children.push(id('extra'))
    invalidDocument.nodes.extra = {
      id: id('extra'),
      type: 'text',
      parentId: id('root'),
      annotations: {},
      content: 'Extra',
      textRole: 'paragraph',
    }
    expect(() => runtime.replaceDocument(invalidDocument)).toThrow(/maximum node count/)
    expect(runtime.data.getSnapshot()).toBe(previousData)
  })

  it('enforces document tree depth and collection row limits', () => {
    expect(() => createDocumentRuntime(document(), {
      initialData: initialData(),
      limits: { maxDocumentTreeDepth: 1 },
    })).toThrow(/document tree.*maximum depth/)

    const runtime = createDocumentRuntime(document(), {
      initialData: initialData([rows[0]]),
      limits: { maxRowsPerCollection: 1 },
    })
    const previous = runtime.data.getSnapshot()
    expect(() => runtime.setData(initialData(rows))).toThrow(/maximum row count/)
    expect(runtime.data.getSnapshot()).toBe(previous)
  })

  it('rejects unsupported documents and malformed JSON pointers', () => {
    const invalid = document()
    const list = invalid.nodes.list
    if (list.type !== 'list') throw new Error('expected list node')
    list.valuePointer = pointer('/bad~2escape')
    expect(() => createDocumentRuntime(invalid)).toThrow(/invalid JSON Pointer escape/)
    expect(() => createDocumentRuntime({ ...document(), version: 1 })).toThrow(/version.*must be 2/)
  })

  it('rejects annotations that do not match their declared field types', () => {
    const invalid = document()
    const root = invalid.nodes.root
    if (root.type !== 'container') throw new Error('expected root container')
    root.annotations.title = 42 as unknown as string
    expect(() => createDocumentRuntime(invalid)).toThrow(/annotations.title must be a string/)
  })

  it('rejects array properties that are not actual JSON array indices', () => {
    const items = [{ id: 'a', label: 'Ada' }] as Array<{ id: string; label: string }> & Record<string, unknown>
    items['4294967295'] = { id: 'invisible', label: 'Invisible' }
    expect(() => createDocumentRuntime(document(), { initialData: initialData(items) })).toThrow(/non-JSON array property/)
  })
})

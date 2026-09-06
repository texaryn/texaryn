// Read-only is a rule the runtime enforces, not a hint the renderers honour.
// ARIA describes; it does not refuse. A registry that dispatched SetValue
// would otherwise walk straight past a read-only field, so the gate lives in
// the command handler and these tests are what hold it there.
import { describe, it, expect } from 'vitest'
import { createFormRuntime } from '../runtime.js'
import type {
  ChildProjection,
  NodeProjection,
  SchemaEvaluationPort,
  SchemaProjection,
} from '../../schema/port.js'
import type { ContainerNode, UIDocument, UINode } from '../../ir/types.js'
import type { JsonPointer, NodeId } from '../../types.js'

function toPointer(s: string): JsonPointer {
  return s as JsonPointer
}

function makeProjection(
  entries: Array<[string, Partial<NodeProjection> & { children?: ChildProjection[] }]>,
): SchemaProjection {
  const nodes = new Map<JsonPointer, NodeProjection>()
  for (const [pointer, partial] of entries) {
    nodes.set(toPointer(pointer), {
      type: partial.type ?? 'string',
      constraints: partial.constraints ?? {},
      active: partial.active ?? true,
      annotations: partial.annotations ?? {},
      children: partial.children,
    })
  }
  return { nodes }
}

function staticPort(
  entries: Array<[string, Partial<NodeProjection> & { children?: ChildProjection[] }]>,
): SchemaEvaluationPort {
  return {
    project: () => makeProjection(entries),
    validate: () => ({ valid: true, errors: [] }),
  }
}

function nodeAt(doc: UIDocument, pointer: string): UINode {
  const found = Object.values(doc.nodes).find((n) => n.dataPointer === pointer)
  if (!found) throw new Error(`no node at ${pointer}`)
  return found
}

describe('read-only enforcement', () => {
  it('refuses SetValue on a read-only field', () => {
    const runtime = createFormRuntime(
      staticPort([
        ['', { type: 'object', children: [{ pointer: toPointer('/code'), key: 'code', required: false }] }],
        ['/code', { type: 'string', annotations: { readOnly: true } }],
      ]),
      { initialData: { code: 'from the server' } },
    )

    const node = nodeAt(runtime.document.getSnapshot(), '/code')
    expect(node.readOnly).toBe(true)
    runtime.dispatch({ type: 'SetValue', nodeId: node.id, value: 'typed by the user' })
    expect((runtime.data.getSnapshot() as { code: string }).code).toBe('from the server')
  })

  it('carries read-only down to a descendant of a read-only object', () => {
    const runtime = createFormRuntime(
      staticPort([
        ['', { type: 'object', children: [{ pointer: toPointer('/address'), key: 'address', required: false }] }],
        [
          '/address',
          {
            type: 'object',
            annotations: { readOnly: true },
            children: [{ pointer: toPointer('/address/city'), key: 'city', required: false }],
          },
        ],
        ['/address/city', { type: 'string' }],
      ]),
      { initialData: { address: { city: 'Paris' } } },
    )

    const doc = runtime.document.getSnapshot()
    const city = nodeAt(doc, '/address/city')
    // The child says nothing about readOnly itself. Editing it still changes
    // the read-only object's value, so the restriction has to reach it.
    expect(city.annotations.readOnly).toBeUndefined()
    expect(city.readOnly).toBe(true)

    runtime.dispatch({ type: 'SetValue', nodeId: city.id, value: 'Lyon' })
    expect((runtime.data.getSnapshot() as { address: { city: string } }).address.city).toBe('Paris')
  })

  it('refuses to insert, remove or move inside a read-only array', () => {
    const port: SchemaEvaluationPort = {
      project(data: unknown): SchemaProjection {
        const items = ((data as { items?: unknown[] })?.items ?? []) as unknown[]
        const entries: Array<[string, Partial<NodeProjection> & { children?: ChildProjection[] }]> = [
          ['', { type: 'object', children: [{ pointer: toPointer('/items'), key: 'items', required: false }] }],
          [
            '/items',
            {
              type: 'array',
              annotations: { readOnly: true },
              children: items.map((_, i) => ({
                pointer: toPointer(`/items/${i}`),
                key: String(i),
                required: false,
              })),
            },
          ],
        ]
        for (let i = 0; i < items.length; i++) entries.push([`/items/${i}`, { type: 'string' }])
        return makeProjection(entries)
      },
      validate: () => ({ valid: true, errors: [] }),
    }
    const runtime = createFormRuntime(port, { initialData: { items: ['a', 'b'] } })
    const array = nodeAt(runtime.document.getSnapshot(), '/items') as ContainerNode

    expect(array.arrayMeta?.canAdd).toBe(false)
    expect(array.arrayMeta?.canRemove).toBe(false)
    expect(array.arrayMeta?.canReorder).toBe(false)

    runtime.dispatch({ type: 'InsertItem', containerId: array.id, index: 2, value: 'c' })
    runtime.dispatch({ type: 'RemoveItem', containerId: array.id, index: 0 })
    runtime.dispatch({ type: 'MoveItem', containerId: array.id, from: 0, to: 1 })
    expect((runtime.data.getSnapshot() as { items: string[] }).items).toEqual(['a', 'b'])
  })

  it('lets Reset replace a read-only value, because that is the authority speaking', () => {
    const runtime = createFormRuntime(
      staticPort([
        ['', { type: 'object', children: [{ pointer: toPointer('/code'), key: 'code', required: false }] }],
        ['/code', { type: 'string', annotations: { readOnly: true } }],
      ]),
      { initialData: { code: 'first' } },
    )

    runtime.dispatch({ type: 'Reset', data: { code: 'second' } })
    expect((runtime.data.getSnapshot() as { code: string }).code).toBe('second')
  })

  it('follows a recompile that turns read-only off again', () => {
    let readOnly = true
    const port: SchemaEvaluationPort = {
      project: () =>
        makeProjection([
          ['', { type: 'object', children: [{ pointer: toPointer('/code'), key: 'code', required: false }] }],
          ['/code', { type: 'string', annotations: readOnly ? { readOnly: true } : {} }],
        ]),
      validate: () => ({ valid: true, errors: [] }),
    }
    const runtime = createFormRuntime(port, { initialData: { code: 'start' } })
    const idOf = () => nodeAt(runtime.document.getSnapshot(), '/code').id as NodeId

    expect(nodeAt(runtime.document.getSnapshot(), '/code').readOnly).toBe(true)

    readOnly = false
    // Any command recompiles; Reset is the one that is never itself refused.
    runtime.dispatch({ type: 'Reset', data: { code: 'start' } })
    expect(nodeAt(runtime.document.getSnapshot(), '/code').readOnly).toBe(false)

    runtime.dispatch({ type: 'SetValue', nodeId: idOf(), value: 'now editable' })
    expect((runtime.data.getSnapshot() as { code: string }).code).toBe('now editable')

    readOnly = true
    runtime.dispatch({ type: 'Reset', data: { code: 'now editable' } })
    expect(nodeAt(runtime.document.getSnapshot(), '/code').readOnly).toBe(true)
    runtime.dispatch({ type: 'SetValue', nodeId: idOf(), value: 'refused' })
    expect((runtime.data.getSnapshot() as { code: string }).code).toBe('now editable')
  })
})

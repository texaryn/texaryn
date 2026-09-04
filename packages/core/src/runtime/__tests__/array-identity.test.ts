// Stable array identity as seen from the document, which is the boundary a
// renderer actually consumes. The handler has always maintained identity in
// `state.identities`; before this suite existed, compilation regenerated a
// positional set on every recompile and the reconciled ids never arrived.
//
// The invariant: an item's id follows the logical item, not its position.
import { describe, it, expect } from 'vitest'
import { createFormRuntime } from '../runtime.js'
import type {
  ChildProjection,
  NodeProjection,
  SchemaEvaluationPort,
  SchemaProjection,
} from '../../schema/port.js'
import type { ContainerNode, UIDocument } from '../../ir/types.js'
import type { JsonPointer, NodeId, StableItemId } from '../../types.js'

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

// Rebuilds the projection from the data so array length tracks mutations,
// the way a real schema adapter does.
function listPort(): SchemaEvaluationPort {
  return {
    project(data: unknown): SchemaProjection {
      const items = ((data as { items?: unknown[] })?.items ?? []) as unknown[]
      const entries: Array<[string, Partial<NodeProjection> & { children?: ChildProjection[] }]> = [
        [
          '',
          {
            type: 'object',
            children: [{ pointer: toPointer('/items'), key: 'items', required: false }],
          },
        ],
        [
          '/items',
          {
            type: 'array',
            annotations: { title: 'Items' },
            children: items.map((_, i) => ({
              pointer: toPointer(`/items/${i}`),
              key: String(i),
              required: false,
            })),
          },
        ],
      ]
      for (let i = 0; i < items.length; i++) {
        entries.push([`/items/${i}`, { type: 'string' }])
      }
      return makeProjection(entries)
    },
    validate: () => ({ valid: true, errors: [] }),
  }
}

function arrayNode(document: UIDocument): ContainerNode {
  const found = Object.values(document.nodes).find(
    (node) => node.dataPointer === '/items',
  )
  if (!found) throw new Error('no /items container')
  return found as ContainerNode
}

function idsOf(document: UIDocument): StableItemId[] {
  return [...(arrayNode(document).arrayMeta?.itemIds ?? [])]
}

function containerId(document: UIDocument): NodeId {
  return arrayNode(document).id
}

function start(items: string[]) {
  return createFormRuntime(listPort(), { initialData: { items } })
}

describe('array item identity survives mutation', () => {
  it('assigns one id per item on the first compile', () => {
    const runtime = start(['A', 'B'])
    const ids = idsOf(runtime.document.getSnapshot())

    expect(ids).toHaveLength(2)
    expect(new Set(ids).size, 'ids must be distinct').toBe(2)
    runtime.destroy()
  })

  it('keeps the survivor id when an earlier item is removed', () => {
    const runtime = start(['A', 'B'])
    const before = idsOf(runtime.document.getSnapshot())
    const bId = before[1]

    runtime.dispatch({
      type: 'RemoveItem',
      containerId: containerId(runtime.document.getSnapshot()),
      index: 0,
    })

    const after = idsOf(runtime.document.getSnapshot())
    expect(after).toHaveLength(1)
    expect(after[0], 'B must keep its id rather than inheriting A position').toBe(bId)
    expect(after[0]).not.toBe(before[0])
    runtime.destroy()
  })

  it('gives an appended item a fresh id and leaves the existing one alone', () => {
    const runtime = start(['A', 'B'])
    const before = idsOf(runtime.document.getSnapshot())

    runtime.dispatch({
      type: 'InsertItem',
      containerId: containerId(runtime.document.getSnapshot()),
      index: 2,
      value: 'C',
    })

    const after = idsOf(runtime.document.getSnapshot())
    expect(after).toHaveLength(3)
    expect(after.slice(0, 2), 'existing items keep their ids').toEqual(before)
    expect(before, 'the new item gets an identity of its own').not.toContain(after[2])
    runtime.destroy()
  })

  it('lets identity follow the item through a reorder rather than the position', () => {
    const runtime = start(['A', 'B', 'C'])
    const before = idsOf(runtime.document.getSnapshot())

    runtime.dispatch({
      type: 'MoveItem',
      containerId: containerId(runtime.document.getSnapshot()),
      from: 0,
      to: 2,
    })

    const after = idsOf(runtime.document.getSnapshot())
    expect(
      (runtime.data.getSnapshot() as { items: string[] }).items,
      'data moved as expected',
    ).toEqual(['B', 'C', 'A'])
    expect(after, 'the same ids in the order the items now sit').toEqual([
      before[1],
      before[2],
      before[0],
    ])
    runtime.destroy()
  })

  it('does not change an item id when its value is edited', () => {
    const runtime = start(['A', 'B'])
    const document = runtime.document.getSnapshot()
    const before = idsOf(document)
    const bNode = Object.values(document.nodes).find(
      (node) => node.dataPointer === '/items/1',
    )

    runtime.dispatch({ type: 'SetValue', nodeId: bNode!.id, value: 'B edited' })

    expect((runtime.data.getSnapshot() as { items: string[] }).items[1]).toBe('B edited')
    expect(idsOf(runtime.document.getSnapshot()), 'editing is not a structural change').toEqual(
      before,
    )
    runtime.destroy()
  })

  it('holds identity across a sequence of mutations', () => {
    const runtime = start(['A', 'B'])
    const before = idsOf(runtime.document.getSnapshot())
    const bId = before[1]

    runtime.dispatch({
      type: 'RemoveItem',
      containerId: containerId(runtime.document.getSnapshot()),
      index: 0,
    })
    runtime.dispatch({
      type: 'InsertItem',
      containerId: containerId(runtime.document.getSnapshot()),
      index: 1,
      value: 'C',
    })

    const after = idsOf(runtime.document.getSnapshot())
    expect((runtime.data.getSnapshot() as { items: string[] }).items).toEqual(['B', 'C'])
    expect(after[0], 'B is still B after remove then insert').toBe(bId)
    expect(before, 'C is genuinely new').not.toContain(after[1])
    runtime.destroy()
  })
})

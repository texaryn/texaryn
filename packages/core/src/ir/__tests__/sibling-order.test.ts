// The `order` hint, held to its narrow definition: lower first, a field
// without one keeps its schema position, equal values keep schema order, and
// it applies among siblings only.
import { describe, it, expect } from 'vitest'
import { compile } from '../compiler.js'
import type {
  ChildProjection,
  NodeProjection,
  SchemaProjection,
} from '../../schema/port.js'
import type { UIHints } from '../../hints/types.js'
import type { JsonPointer } from '../../types.js'

function toPointer(s: string): JsonPointer {
  return s as JsonPointer
}

function objectOf(keys: string[]): SchemaProjection {
  const nodes = new Map<JsonPointer, NodeProjection>()
  const children: ChildProjection[] = keys.map((key) => ({
    pointer: toPointer(`/${key}`),
    key,
    required: false,
  }))
  nodes.set(toPointer(''), {
    type: 'object',
    constraints: {},
    active: true,
    annotations: {},
    children,
  })
  for (const key of keys) {
    nodes.set(toPointer(`/${key}`), {
      type: 'string',
      constraints: {},
      active: true,
      annotations: { title: key },
    })
  }
  return { nodes }
}

function pointersInOrder(keys: string[], hints?: UIHints): string[] {
  const result = compile(objectOf(keys), {}, hints)
  const root = result.document.nodes[result.document.rootId as string]
  const children = (root as { children: string[] }).children
  return children.map((id) => result.document.nodes[id].dataPointer as string)
}

describe('sibling order', () => {
  it('keeps schema order when no hint is given', () => {
    expect(pointersInOrder(['a', 'b', 'c'])).toEqual(['/a', '/b', '/c'])
  })

  it('puts a lower order first', () => {
    expect(
      pointersInOrder(['a', 'b'], { '/a': { order: 2 }, '/b': { order: 1 } }),
    ).toEqual(['/b', '/a'])
  })

  it('leaves a field without a hint at its schema position', () => {
    // An unhinted field's position is its order, so `c` at 0 ties with `a`,
    // whose schema index is 0, and the tie keeps schema order. Ordering one
    // field does not displace the others.
    expect(pointersInOrder(['a', 'b', 'c'], { '/c': { order: 0 } })).toEqual([
      '/a',
      '/c',
      '/b',
    ])
  })

  it('needs a value below every schema index to move a field to the front', () => {
    // The corollary: hinted and unhinted values share one scale, so going
    // first means going below index 0.
    expect(pointersInOrder(['a', 'b', 'c'], { '/c': { order: -1 } })).toEqual([
      '/c',
      '/a',
      '/b',
    ])
  })

  it('keeps schema order for equal values', () => {
    expect(
      pointersInOrder(['a', 'b', 'c'], {
        '/a': { order: 1 },
        '/b': { order: 1 },
        '/c': { order: 1 },
      }),
    ).toEqual(['/a', '/b', '/c'])
  })

  it('sets each node order to its presentation position', () => {
    const result = compile(objectOf(['a', 'b']), {}, { '/b': { order: -1 } })
    const byPointer = Object.values(result.document.nodes)
    const a = byPointer.find((node) => node.dataPointer === '/a')
    const b = byPointer.find((node) => node.dataPointer === '/b')

    expect(b?.order, 'b is presented first so it reports position 0').toBe(0)
    expect(a?.order).toBe(1)
  })

  it('orders siblings independently within each object', () => {
    const nodes = new Map<JsonPointer, NodeProjection>()
    nodes.set(toPointer(''), {
      type: 'object',
      constraints: {},
      active: true,
      annotations: {},
      children: [
        { pointer: toPointer('/outer'), key: 'outer', required: false },
        { pointer: toPointer('/group'), key: 'group', required: false },
      ],
    })
    nodes.set(toPointer('/outer'), {
      type: 'string',
      constraints: {},
      active: true,
      annotations: {},
    })
    nodes.set(toPointer('/group'), {
      type: 'object',
      constraints: {},
      active: true,
      annotations: {},
      children: [
        { pointer: toPointer('/group/x'), key: 'x', required: false },
        { pointer: toPointer('/group/y'), key: 'y', required: false },
      ],
    })
    nodes.set(toPointer('/group/x'), {
      type: 'string',
      constraints: {},
      active: true,
      annotations: {},
    })
    nodes.set(toPointer('/group/y'), {
      type: 'string',
      constraints: {},
      active: true,
      annotations: {},
    })

    // Ordering inside the group must not reach outside it.
    const result = compile({ nodes }, {}, { '/group/y': { order: -1 } })
    const root = result.document.nodes[result.document.rootId as string]
    const rootChildren = (root as { children: string[] }).children.map(
      (id) => result.document.nodes[id].dataPointer,
    )
    expect(rootChildren).toEqual(['/outer', '/group'])

    const group = Object.values(result.document.nodes).find(
      (node) => node.dataPointer === '/group',
    )
    const groupChildren = (group as { children: string[] }).children.map(
      (id) => result.document.nodes[id].dataPointer,
    )
    expect(groupChildren).toEqual(['/group/y', '/group/x'])
  })
})

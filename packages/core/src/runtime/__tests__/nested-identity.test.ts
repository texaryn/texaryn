import { describe, it, expect } from 'vitest'
import { createFormRuntime } from '../runtime.js'
import type { FormRuntime } from '../types.js'
import type { SchemaEvaluationPort, SchemaProjection, NodeProjection } from '../../schema/port.js'
import type { ContainerNode } from '../../ir/types.js'
import type { JsonPointer, NodeId } from '../../types.js'

type Row = { name: string; tags: string[] }
type Data = { rows: Row[]; showRows?: boolean }

interface ProjectOptions {
  omitRowsWhenHidden?: boolean
  inactiveWhenHidden?: boolean
}

/** A data-dependent projection: rows and tags follow the data, as an adapter's would. */
function project(data: unknown, options: ProjectOptions = {}): SchemaProjection {
  const d = data as Data
  const nodes = new Map<JsonPointer, NodeProjection>()
  const node = (p: string, n: Partial<NodeProjection> & { type: NodeProjection['type'] }): void => {
    nodes.set(p as JsonPointer, {
      type: n.type,
      constraints: n.constraints ?? {},
      children: n.children,
      active: n.active ?? true,
      annotations: n.annotations ?? {},
    })
  }
  const hidden = d.showRows === false
  const rowsActive = !(options.inactiveWhenHidden && hidden)
  const rowsChild =
    options.omitRowsWhenHidden && hidden
      ? []
      : [{ pointer: '/rows' as JsonPointer, key: 'rows', required: false }]
  node('', {
    type: 'object',
    children: [...rowsChild, { pointer: '/showRows' as JsonPointer, key: 'showRows', required: false }],
  })
  node('/showRows', { type: 'boolean' })
  if (rowsChild.length > 0) {
    node('/rows', { type: 'array', active: rowsActive })
    ;(d.rows ?? []).forEach((row, i) => {
      node(`/rows/${i}`, {
        type: 'object',
        active: rowsActive,
        children: [
          { pointer: `/rows/${i}/name` as JsonPointer, key: 'name', required: false },
          { pointer: `/rows/${i}/tags` as JsonPointer, key: 'tags', required: false },
        ],
      })
      node(`/rows/${i}/name`, { type: 'string', active: rowsActive })
      node(`/rows/${i}/tags`, { type: 'array', active: rowsActive })
      row.tags.forEach((_, j) => node(`/rows/${i}/tags/${j}`, { type: 'string', active: rowsActive }))
    })
  }
  return { nodes }
}

function port(options?: ProjectOptions): SchemaEvaluationPort {
  return {
    project: (data) => project(data, options),
    validate: () => ({ valid: true, errors: [] }),
  }
}

function arrays(runtime: FormRuntime): Record<string, string[]> {
  const doc = runtime.document.getSnapshot()
  const out: Record<string, string[]> = {}
  for (const n of Object.values(doc.nodes)) {
    if (n.type === 'container' && n.containerType === 'array' && n.dataPointer != null) {
      out[n.dataPointer] = [...(n as ContainerNode).arrayMeta!.itemIds]
    }
  }
  return out
}

function nodeAt(runtime: FormRuntime, pointer: string): NodeId {
  const node = Object.values(runtime.document.getSnapshot().nodes).find((n) => n.dataPointer === pointer)
  if (!node) throw new Error(`no node at ${pointer}`)
  return node.id
}

const initial: Data = { rows: [{ name: 'A', tags: ['a1', 'a2'] }, { name: 'B', tags: ['b1'] }] }

describe('nested array identity', () => {
  it('inner identities follow their row through a move', () => {
    const runtime = createFormRuntime(port(), { initialData: initial })
    const before = arrays(runtime)
    runtime.dispatch({ type: 'MoveItem', containerId: nodeAt(runtime, '/rows'), from: 1, to: 0 })
    const after = arrays(runtime)
    expect(after['/rows']).toEqual([before['/rows'][1], before['/rows'][0]])
    expect(after['/rows/0/tags']).toEqual(before['/rows/1/tags'])
    expect(after['/rows/1/tags']).toEqual(before['/rows/0/tags'])
    runtime.destroy()
  })

  it('rows with equal tag counts do not swap inner identities on a move', () => {
    const equal: Data = { rows: [{ name: 'A', tags: ['a1', 'a2'] }, { name: 'B', tags: ['b1', 'b2'] }] }
    const runtime = createFormRuntime(port(), { initialData: equal })
    const before = arrays(runtime)
    expect(before['/rows/0/tags']).not.toEqual(before['/rows/1/tags'])
    runtime.dispatch({ type: 'MoveItem', containerId: nodeAt(runtime, '/rows'), from: 1, to: 0 })
    const after = arrays(runtime)
    expect(after['/rows/0/tags']).toEqual(before['/rows/1/tags'])
    expect(after['/rows/1/tags']).toEqual(before['/rows/0/tags'])
    runtime.destroy()
  })

  it('Reset re-establishes identity and may mint nested arrays afresh', () => {
    const runtime = createFormRuntime(port(), { initialData: initial })
    const before = arrays(runtime)
    runtime.dispatch({ type: 'Reset', data: { rows: [initial.rows[1], initial.rows[0]] } })
    const after = arrays(runtime)
    expect(after['/rows']).toEqual([before['/rows'][1], before['/rows'][0]])
    expect(after['/rows/0/tags']).toHaveLength(1)
    expect(before['/rows/1/tags']).not.toContain(after['/rows/0/tags'][0])
    runtime.destroy()
  })

  it('inner identities survive an insert and a remove above them', () => {
    const runtime = createFormRuntime(port(), { initialData: initial })
    const before = arrays(runtime)
    runtime.dispatch({
      type: 'InsertItem',
      containerId: nodeAt(runtime, '/rows'),
      index: 0,
      value: { name: 'Z', tags: [] },
    })
    expect(arrays(runtime)['/rows/1/tags']).toEqual(before['/rows/0/tags'])
    expect(arrays(runtime)['/rows/2/tags']).toEqual(before['/rows/1/tags'])
    runtime.dispatch({ type: 'RemoveItem', containerId: nodeAt(runtime, '/rows'), index: 0 })
    expect(arrays(runtime)['/rows/0/tags']).toEqual(before['/rows/0/tags'])
    expect(arrays(runtime)['/rows/1/tags']).toEqual(before['/rows/1/tags'])
    runtime.destroy()
  })

  it('an array that leaves the document is minted afresh when it returns', () => {
    const runtime = createFormRuntime(port({ omitRowsWhenHidden: true }), {
      initialData: { ...initial, showRows: true },
    })
    const before = arrays(runtime)
    runtime.dispatch({ type: 'SetValue', nodeId: nodeAt(runtime, '/showRows'), value: false })
    expect(arrays(runtime)['/rows']).toBeUndefined()
    runtime.dispatch({ type: 'SetValue', nodeId: nodeAt(runtime, '/showRows'), value: true })
    const after = arrays(runtime)
    expect(after['/rows']).toHaveLength(2)
    expect(after['/rows']).not.toEqual(before['/rows'])
    runtime.destroy()
  })

  it('an array that is only inactive keeps its identities', () => {
    const runtime = createFormRuntime(port({ inactiveWhenHidden: true }), {
      initialData: { ...initial, showRows: true },
    })
    const before = arrays(runtime)
    runtime.dispatch({ type: 'SetValue', nodeId: nodeAt(runtime, '/showRows'), value: false })
    expect(arrays(runtime)['/rows']).toEqual(before['/rows'])
    runtime.dispatch({ type: 'SetValue', nodeId: nodeAt(runtime, '/showRows'), value: true })
    expect(arrays(runtime)).toEqual(before)
    runtime.destroy()
  })

  it('a recompile that throws leaves identity intact', () => {
    let calls = 0
    const failing: SchemaEvaluationPort = {
      project: (data) => {
        calls += 1
        if (calls === 2) throw new Error('projection failed')
        return project(data)
      },
      validate: () => ({ valid: true, errors: [] }),
    }
    const runtime = createFormRuntime(failing, { initialData: initial })
    const before = arrays(runtime)
    const name = nodeAt(runtime, '/rows/0/name')
    expect(() => runtime.dispatch({ type: 'SetValue', nodeId: name, value: 'A2' })).toThrow(
      'projection failed',
    )
    expect(arrays(runtime)).toEqual(before)
    runtime.dispatch({ type: 'SetValue', nodeId: name, value: 'A3' })
    expect(arrays(runtime)).toEqual(before)
    runtime.destroy()
  })
})

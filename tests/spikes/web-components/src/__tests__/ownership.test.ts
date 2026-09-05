import { afterEach, describe, expect, it } from 'vitest'
import { createFormRuntime } from '@texaryn/core'
import type { NodeId } from '@texaryn/core'
import { createDefaultRegistry, defineTexarynForm } from '../index.js'
import type { TexarynFormElement } from '../index.js'
import { adapterFor, flush, requiredSchema, type } from './harness.js'

defineTexarynForm()
const registry = createDefaultRegistry()

function element(): TexarynFormElement {
  const el = document.createElement('texaryn-form') as TexarynFormElement
  el.registry = registry
  return el
}

function nameNode(el: TexarynFormElement): NodeId {
  const doc = el.runtime!.document.getSnapshot()
  const node = Object.values(doc.nodes).find((n) => n.dataPointer === '/name')
  if (!node) throw new Error('no /name node')
  return node.id
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('runtime ownership', () => {
  it('defineTexarynForm is idempotent', () => {
    expect(() => defineTexarynForm()).not.toThrow()
  })

  it('external mode renders a borrowed runtime and never destroys it', async () => {
    const port = await adapterFor(requiredSchema)
    const runtime = createFormRuntime(port, { initialData: { name: 'Ann' }, validationDebounceMs: 0 })
    const el = element()
    el.runtime = runtime
    document.body.append(el)

    const input = el.querySelector('input')!
    expect(input.value).toBe('Ann')

    el.remove()
    await flush()

    const nodeId = nameNode(el)
    runtime.dispatch({ type: 'SetValue', nodeId, value: 'Bea' })
    expect((runtime.data.getSnapshot() as { name: string }).name).toBe('Bea')
    expect(runtime.getNodeState(nodeId)).toBeDefined()
    expect(el.runtime).toBe(runtime)

    document.body.append(el)
    expect(el.querySelector('input')!.value).toBe('Bea')
    runtime.destroy()
  })

  it('managed mode creates its own runtime and destroys it on removal', async () => {
    const port = await adapterFor(requiredSchema)
    const el = element()
    el.options = { initialData: { name: '' }, validationDebounceMs: 0 }
    el.port = port
    document.body.append(el)

    const owned = el.runtime!
    expect(owned).toBeTruthy()
    type(el.querySelector('input')!, 'Ann')
    expect((owned.data.getSnapshot() as { name: string }).name).toBe('Ann')

    const nodeId = nameNode(el)
    el.remove()
    await flush()

    expect(owned.getNodeState(nodeId)).toBeUndefined()
    owned.dispatch({ type: 'SetValue', nodeId, value: 'Bea' })
    expect((owned.data.getSnapshot() as { name: string }).name).toBe('Ann')
  })

  it('a reparent is not a removal: the managed runtime and its state survive', async () => {
    const port = await adapterFor(requiredSchema)
    const el = element()
    el.options = { initialData: { name: '' }, validationDebounceMs: 0 }
    el.port = port
    const first = document.body.appendChild(document.createElement('section'))
    const second = document.body.appendChild(document.createElement('section'))
    first.append(el)

    const owned = el.runtime!
    const input = el.querySelector('input')!
    type(input, 'Ann')

    second.append(el)
    await flush()

    expect(el.parentElement).toBe(second)
    expect(el.runtime).toBe(owned)
    expect(el.querySelector('input')).toBe(input)
    expect(input.value).toBe('Ann')
    expect(owned.getNodeState(nameNode(el))).toBeDefined()
    type(input, 'Anna')
    expect((owned.data.getSnapshot() as { name: string }).name).toBe('Anna')
  })

  it('runtime and port are mutually exclusive', async () => {
    const port = await adapterFor(requiredSchema)
    const runtime = createFormRuntime(port, { initialData: { name: '' } })

    const a = element()
    a.runtime = runtime
    expect(() => {
      a.port = port
    }).toThrow(/mutually exclusive/)

    const b = element()
    b.port = port
    expect(() => {
      b.runtime = runtime
    }).toThrow(/mutually exclusive/)
    runtime.destroy()
  })
})

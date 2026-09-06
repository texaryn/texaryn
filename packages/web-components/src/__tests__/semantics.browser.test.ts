import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from '@vitest/browser/context'
import { createFormRuntime } from '@texaryn/core'
import type { FormRuntime, UIHints } from '@texaryn/core'
import { createDefaultRegistry, defineTexarynForm, mountForm } from '../index.js'
import type { TexarynFormElement } from '../index.js'
import { adapterFor, conditionalSchema, flush, listSchema, nodeAt, requiredSchema } from './harness.js'

defineTexarynForm()
const registry = createDefaultRegistry()

let runtime: FormRuntime | null = null
let container: HTMLElement

type Movable = { moveBefore?: (node: Node, child: Node | null) => void }
const elementProto = Element.prototype as unknown as Movable
const nativeMoveBefore = elementProto.moveBefore

async function mount(schema: unknown, initialData: unknown, hints?: UIHints): Promise<FormRuntime> {
  runtime = createFormRuntime(await adapterFor(schema), {
    initialData,
    hints,
    validationDebounceMs: 0,
  })
  container = document.body.appendChild(document.createElement('div'))
  mountForm(container, runtime, registry, 'f')
  return runtime
}

function input(name: string): HTMLInputElement {
  const found = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)
  if (!found) throw new Error(`no input named ${name}`)
  return found
}

function rows(): HTMLElement[] {
  const list = container.querySelector('.texaryn-array')!.children[0]
  return Array.from(list.children) as HTMLElement[]
}

async function managed(): Promise<TexarynFormElement> {
  const el = document.createElement('texaryn-form') as TexarynFormElement
  el.registry = registry
  el.options = { initialData: { name: '' }, validationDebounceMs: 0 }
  el.port = await adapterFor(requiredSchema)
  document.body.append(el)
  return el
}

function name(rt: FormRuntime): string {
  return (rt.data.getSnapshot() as { name: string }).name
}

const items = { items: [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cid' }] }

afterEach(() => {
  runtime?.destroy()
  runtime = null
  document.body.replaceChildren()
  if (nativeMoveBefore) elementProto.moveBefore = nativeMoveBefore
})

describe('browser semantics', () => {
  it('a conditional reveal keeps the focused input and its caret', async () => {
    const rt = await mount(conditionalSchema, { kind: '' })
    const kind = input('/kind')
    await userEvent.click(kind)
    await userEvent.keyboard('b')
    await flush()

    expect((rt.data.getSnapshot() as { kind: string }).kind).toBe('b')
    expect(input('/kind')).toBe(kind)
    expect(document.activeElement).toBe(kind)
    expect(kind.selectionStart).toBe(1)
    expect(kind.selectionEnd).toBe(1)
    expect(input('/extra').closest('[hidden]')).toBeNull()
  })

  /**
   * The whole reorder contract in one chain: same row element, same input
   * element, new name, same activeElement, same selection, and the next
   * keystroke writes to the new index.
   */
  async function reorderContract(rt: FormRuntime): Promise<void> {
    const [, row1] = rows()
    const bob = row1.querySelector('input')!
    expect(bob.name).toBe('/items/1/name')
    await userEvent.click(bob)
    bob.setSelectionRange(1, 2)
    expect(document.activeElement).toBe(bob)

    rt.dispatch({ type: 'MoveItem', containerId: nodeAt(rt, '/items'), from: 1, to: 0 })
    await flush()

    expect(rows()[0]).toBe(row1)
    expect(row1.querySelector('input')).toBe(bob)
    expect(bob.name).toBe('/items/0/name')
    expect(document.activeElement).toBe(bob)
    expect(bob.selectionStart).toBe(1)
    expect(bob.selectionEnd).toBe(2)

    await userEvent.keyboard('x')
    await flush()
    expect(bob.value).toBe('Bxb')
    expect((rt.data.getSnapshot() as typeof items).items.map((i) => i.name)).toEqual([
      'Bxb',
      'Ann',
      'Cid',
    ])
  }

  it('reordering the focused row keeps focus, selection and rebinding with native moveBefore', async () => {
    // Playwright pins the Chromium revision, so a missing moveBefore is a regression to hear about, not a case to skip.
    expect(typeof nativeMoveBefore).toBe('function')
    const rt = await mount(listSchema, items, { '/items': { canReorder: true } })
    const spy = vi.spyOn(elementProto as Required<Movable>, 'moveBefore')
    try {
      await reorderContract(rt)
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('reordering the focused row keeps focus, selection and rebinding with the forced insertBefore fallback', async () => {
    const rt = await mount(listSchema, items, { '/items': { canReorder: true } })
    delete elementProto.moveBefore
    expect(typeof (rows()[0].parentElement as unknown as Movable).moveBefore).toBe('undefined')

    const moved: Node[] = []
    const original = Node.prototype.insertBefore
    const spy = vi
      .spyOn(Node.prototype, 'insertBefore')
      .mockImplementation(function (this: Node, node: Node, ref: Node | null) {
        moved.push(node)
        return original.call(this, node, ref)
      } as typeof Node.prototype.insertBefore)
    try {
      await reorderContract(rt)
      expect(moved.length).toBeGreaterThan(0)
      expect(moved).not.toContain(rows()[0])
    } finally {
      spy.mockRestore()
    }
  })

  it('a reparent inside the document keeps the managed runtime, input and value', async () => {
    const el = await managed()
    const owned = el.runtime!
    const control = el.querySelector('input')!
    await userEvent.click(control)
    await userEvent.keyboard('Ann')
    expect(name(owned)).toBe('Ann')

    const second = document.body.appendChild(document.createElement('section'))
    second.append(el)
    await flush()

    expect(el.runtime).toBe(owned)
    expect(el.querySelector('input')).toBe(control)
    expect(control.value).toBe('Ann')
    await userEvent.click(control)
    control.setSelectionRange(3, 3)
    await userEvent.keyboard('a')
    expect(name(owned)).toBe('Anna')
  })

  it('a removal disposes the managed runtime only after the deferred-disposal boundary', async () => {
    const el = await managed()
    const owned = el.runtime!
    const nodeId = nodeAt(owned, '/name')

    el.remove()
    expect(owned.getNodeState(nodeId)).toBeDefined()
    await flush()
    expect(owned.getNodeState(nodeId)).toBeUndefined()
    owned.dispatch({ type: 'SetValue', nodeId, value: 'Bea' })
    expect(name(owned)).toBe('')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFormRuntime } from '@texaryn/core'
import type { FormRuntime, UIHints } from '@texaryn/core'
import { createDefaultRegistry, defineTexarynForm, mountForm } from '../index.js'
import type { TexarynFormElement } from '../index.js'
import {
  adapterFor,
  conditionalSchema,
  flush,
  listSchema,
  nestedSchema,
  nodeAt,
  requiredSchema,
  type,
} from './harness.js'

defineTexarynForm()
const registry = createDefaultRegistry()

let runtime: FormRuntime | null = null
let container: HTMLElement

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

function input(name: string, root: ParentNode = container): HTMLInputElement {
  const found = root.querySelector<HTMLInputElement>(`input[name="${name}"]`)
  if (!found) throw new Error(`no input named ${name}`)
  return found
}

/** Direct rows of one array control: its list is the first child, rows are the list's children. */
function rowsOf(arrayRoot: Element): HTMLElement[] {
  return Array.from(arrayRoot.children[0].children) as HTMLElement[]
}

function outerArray(): Element {
  return container.querySelector('.texaryn-array')!
}

function buttonIn(scope: Element, label: string): HTMLButtonElement {
  const found = Array.from(scope.querySelectorAll('button')).find((b) => b.textContent === label)
  if (!found) throw new Error(`no ${label} button`)
  return found
}

async function managed(): Promise<TexarynFormElement> {
  const el = document.createElement('texaryn-form') as TexarynFormElement
  el.registry = registry
  el.options = { initialData: { name: '' }, validationDebounceMs: 0 }
  el.port = await adapterFor(requiredSchema)
  document.body.append(el)
  return el
}

const items = { items: [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cid' }] }
const nested = { rows: [{ name: 'A', tags: ['a1', 'a2'] }, { name: 'B', tags: ['b1'] }] }

afterEach(() => {
  runtime?.destroy()
  runtime = null
  document.body.replaceChildren()
})

describe('renderer invariants', () => {
  it('1. object children are keyed by property identity, never by positional node id', async () => {
    const rt = await mount(listSchema, items, { '/items': { canReorder: true } })
    const [, row1] = rowsOf(outerArray())
    const bob = row1.querySelector('input')!
    expect(bob.name).toBe('/items/1/name')
    buttonIn(row1, 'Up').click()
    await flush()
    expect(row1.querySelector('input')).toBe(bob)
    expect(bob.name).toBe('/items/0/name')
    type(bob, 'Bobby')
    await flush()
    expect((rt.data.getSnapshot() as typeof items).items.map((i) => i.name)).toEqual([
      'Bobby',
      'Ann',
      'Cid',
    ])
  })

  it('2. array row DOM identity survives insert, remove and move of other rows', async () => {
    const rt = await mount(listSchema, items)
    const [row0, row1, row2] = rowsOf(outerArray())
    const ids = [row0, row1, row2].map((r) => r.dataset.itemId)

    buttonIn(outerArray(), 'Add').click()
    await flush()
    expect(rowsOf(outerArray())).toHaveLength(4)
    expect(rowsOf(outerArray()).slice(0, 3)).toEqual([row0, row1, row2])

    buttonIn(rowsOf(outerArray())[3], 'Remove').click()
    await flush()
    expect(rowsOf(outerArray())).toEqual([row0, row1, row2])

    rt.dispatch({ type: 'MoveItem', containerId: nodeAt(rt, '/items'), from: 2, to: 0 })
    await flush()
    expect(rowsOf(outerArray())).toEqual([row2, row0, row1])
    expect(rowsOf(outerArray()).map((r) => r.dataset.itemId)).toEqual([ids[2], ids[0], ids[1]])
  })

  it('3. the fallback reorder never detaches the row that contains the focused control', async () => {
    await mount(listSchema, items, { '/items': { canReorder: true } })
    const [, row1] = rowsOf(outerArray())
    const bob = row1.querySelector('input')!
    bob.focus()
    bob.setSelectionRange(2, 2)
    expect(document.activeElement).toBe(bob)

    const moved: Node[] = []
    const original = Node.prototype.insertBefore
    const spy = vi
      .spyOn(Node.prototype, 'insertBefore')
      .mockImplementation(function (this: Node, node: Node, ref: Node | null) {
        moved.push(node)
        return original.call(this, node, ref)
      } as typeof Node.prototype.insertBefore)
    buttonIn(row1, 'Up').click()
    await flush()
    spy.mockRestore()

    expect(rowsOf(outerArray())[0]).toBe(row1)
    expect(moved).not.toContain(row1)
    expect(document.activeElement).toBe(bob)
    expect(bob.selectionStart).toBe(2)
  })

  it('3c. rows before the focused one are placed relative to it, not moved past it', async () => {
    const rt = await mount(listSchema, items)
    const [row0, row1, row2] = rowsOf(outerArray())
    const cid = row2.querySelector('input')!
    cid.focus()

    const moved: Node[] = []
    const original = Node.prototype.insertBefore
    const spy = vi
      .spyOn(Node.prototype, 'insertBefore')
      .mockImplementation(function (this: Node, node: Node, ref: Node | null) {
        moved.push(node)
        return original.call(this, node, ref)
      } as typeof Node.prototype.insertBefore)
    rt.dispatch({ type: 'MoveItem', containerId: nodeAt(rt, '/items'), from: 0, to: 1 })
    await flush()
    spy.mockRestore()

    expect(rowsOf(outerArray())).toEqual([row1, row0, row2])
    expect(moved).not.toContain(row2)
    expect(document.activeElement).toBe(cid)
  })

  it('3b. moveBefore is used when the parent has it', async () => {
    const rt = await mount(listSchema, items)
    type Movable = { moveBefore?: (node: Node, child: Node | null) => void }
    const proto = HTMLElement.prototype as unknown as Movable
    proto.moveBefore = vi.fn(function (this: HTMLElement, node: Node, child: Node | null) {
      HTMLElement.prototype.insertBefore.call(this, node, child)
    })
    try {
      rt.dispatch({ type: 'MoveItem', containerId: nodeAt(rt, '/items'), from: 2, to: 0 })
      await flush()
      expect(proto.moveBefore).toHaveBeenCalled()
      expect(rowsOf(outerArray()).map((r) => r.querySelector('input')!.value)).toEqual([
        'Cid',
        'Ann',
        'Bob',
      ])
    } finally {
      delete proto.moveBefore
    }
  })

  it('4. disconnectedCallback is not disposal: a reparent keeps runtime, input and typed value', async () => {
    const el = await managed()
    const owned = el.runtime!
    const control = el.querySelector('input')!
    type(control, 'Ann')
    const second = document.body.appendChild(document.createElement('section'))
    second.append(el)
    await flush()
    expect(el.runtime).toBe(owned)
    expect(el.querySelector('input')).toBe(control)
    expect(control.value).toBe('Ann')
    type(control, 'Anna')
    expect((owned.data.getSnapshot() as { name: string }).name).toBe('Anna')

    const nodeId = nodeAt(owned, '/name')
    el.remove()
    await flush()
    expect(owned.getNodeState(nodeId)).toBeUndefined()
  })

  it('5. a borrowed runtime is never destroyed and is rendered again on reattach', async () => {
    const rt = createFormRuntime(await adapterFor(requiredSchema), {
      initialData: { name: 'Ann' },
      validationDebounceMs: 0,
    })
    runtime = rt
    const el = document.createElement('texaryn-form') as TexarynFormElement
    el.registry = registry
    el.runtime = rt
    document.body.append(el)
    expect(el.querySelector('input')!.value).toBe('Ann')

    el.remove()
    await flush()
    const nodeId = nodeAt(rt, '/name')
    rt.dispatch({ type: 'SetValue', nodeId, value: 'Bea' })
    expect(rt.getNodeState(nodeId)).toBeDefined()

    document.body.append(el)
    expect(el.querySelector('input')!.value).toBe('Bea')
    expect(el.runtime).toBe(rt)
  })

  it('6. every DOM id carries the instance prefix and resolves inside its own element', async () => {
    const a = await managed()
    const b = await managed()
    const idsOf = (el: Element) => Array.from(el.querySelectorAll('[id]')).map((n) => n.id)
    expect(idsOf(a).length).toBeGreaterThan(0)
    expect(idsOf(a).filter((id) => idsOf(b).includes(id))).toEqual([])
    for (const el of [a, b]) {
      expect(idsOf(el).every((id) => id.startsWith(`${el.idPrefix}-`))).toBe(true)
      for (const label of el.querySelectorAll('label')) {
        expect(el.contains(document.getElementById(label.htmlFor))).toBe(true)
      }
      for (const control of el.querySelectorAll('[aria-describedby]')) {
        for (const id of control.getAttribute('aria-describedby')!.split(' ')) {
          expect(el.contains(document.getElementById(id))).toBe(true)
        }
      }
    }
  })

  it('7. native events stay native; the element emits only namespaced events', async () => {
    const el = await managed()
    const control = el.querySelector('input')!
    const native = vi.fn()
    const data: unknown[] = []
    el.addEventListener('input', native)
    el.addEventListener('texaryn-data-change', (e) => data.push((e as CustomEvent).detail))
    type(control, 'A')
    expect(native).toHaveBeenCalledTimes(1)
    expect((native.mock.calls[0][0] as Event).target).toBe(control)
    expect(data.at(-1)).toEqual({ name: 'A' })
  })

  it('8. a recompile never rebuilds a subtree whose widget still resolves', async () => {
    const rt = await mount(conditionalSchema, { kind: 'a' })
    const kind = input('/kind')
    const extraBefore = container.querySelector<HTMLInputElement>('input[name="/extra"]')
    expect(extraBefore === null || extraBefore.closest('[hidden]') !== null).toBe(true)

    kind.focus()
    type(kind, 'b')
    kind.setSelectionRange(1, 1)
    await flush()
    expect(document.activeElement).toBe(kind)
    expect(input('/kind')).toBe(kind)
    expect(kind.selectionStart).toBe(1)
    const extra = input('/extra')
    expect(extra.closest('[hidden]')).toBeNull()

    type(kind, 'bc')
    await flush()
    expect(input('/kind')).toBe(kind)
    expect((rt.data.getSnapshot() as { kind: string }).kind).toBe('bc')
  })

  it('9. nested array identity follows the row', async () => {
    const rt = await mount(nestedSchema, nested)
    const [rowA] = rowsOf(outerArray())
    const tagRows = rowsOf(rowA.querySelector('.texaryn-array')!)
    const tagInputs = tagRows.map((r) => r.querySelector('input')!)
    const tagIds = tagRows.map((r) => r.dataset.itemId)
    expect(tagInputs.map((i) => i.value)).toEqual(['a1', 'a2'])

    rt.dispatch({ type: 'MoveItem', containerId: nodeAt(rt, '/rows'), from: 0, to: 1 })
    await flush()

    expect(rowsOf(outerArray())[1]).toBe(rowA)
    const after = rowsOf(rowA.querySelector('.texaryn-array')!)
    expect(after).toEqual(tagRows)
    expect(after.map((r) => r.dataset.itemId)).toEqual(tagIds)
    expect(after.map((r) => r.querySelector('input'))).toEqual(tagInputs)
    expect(tagInputs[0].name).toBe('/rows/1/tags/0')

    type(tagInputs[0], 'a1x')
    await flush()
    expect((rt.data.getSnapshot() as typeof nested).rows[1].tags).toEqual(['a1x', 'a2'])
  })
})

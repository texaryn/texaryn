import { afterEach, describe, expect, it } from 'vitest'
import { createFormRuntime } from '@texaryn/core'
import type { FormRuntime } from '@texaryn/core'
import { createDefaultRegistry, mountForm } from '../index.js'
import { adapterFor, conditionalSchema, flush, listSchema, type } from './harness.js'

const registry = createDefaultRegistry()
let runtime: FormRuntime | null = null
let container: HTMLElement

function input(name: string): HTMLInputElement {
  const found = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)
  if (!found) throw new Error(`no input named ${name}`)
  return found
}

function rows(): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.texaryn-array-item'))
}

afterEach(() => {
  runtime?.destroy()
  runtime = null
  container?.remove()
})

describe('reconciliation without a virtual DOM', () => {
  it('a conditional reveal keeps the focused input and its caret', async () => {
    const port = await adapterFor(conditionalSchema)
    runtime = createFormRuntime(port, { initialData: { kind: 'a' }, validationDebounceMs: 0 })
    container = document.body.appendChild(document.createElement('div'))
    mountForm(container, runtime, registry, 'f')

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
    expect((runtime.data.getSnapshot() as { kind: string }).kind).toBe('b')
  })

  it('moving an array row keeps its element and rebinds its fields to the new position', async () => {
    const port = await adapterFor(listSchema)
    runtime = createFormRuntime(port, {
      initialData: { items: [{ name: 'Ann' }, { name: 'Bob' }, { name: 'Cid' }] },
      hints: { '/items': { canReorder: true } },
      validationDebounceMs: 0,
    })
    container = document.body.appendChild(document.createElement('div'))
    mountForm(container, runtime, registry, 'f')

    const [row0, row1, row2] = rows()
    const bobRowId = row1.dataset.itemId
    const bob = row1.querySelector('input')!
    expect(bob.value).toBe('Bob')
    expect(bob.name).toBe('/items/1/name')
    bob.focus()
    bob.setSelectionRange(2, 2)

    const up = Array.from(row1.querySelectorAll('button')).find((b) => b.textContent === 'Up')!
    up.click()
    await flush()

    const after = rows()
    expect(after.map((r) => r.dataset.itemId)).toEqual([bobRowId, row0.dataset.itemId, row2.dataset.itemId])
    expect(after[0]).toBe(row1)
    expect(after[1]).toBe(row0)
    expect(row1.querySelector('input')).toBe(bob)
    expect(document.activeElement).toBe(bob)
    expect(bob.selectionStart).toBe(2)
    expect(bob.value).toBe('Bob')
    expect(bob.name).toBe('/items/0/name')
    expect(row0.querySelector('input')!.name).toBe('/items/1/name')

    type(bob, 'Bobby')
    await flush()
    const data = runtime.data.getSnapshot() as { items: Array<{ name: string }> }
    expect(data.items.map((i) => i.name)).toEqual(['Bobby', 'Ann', 'Cid'])
  })

  it('inserting a row leaves existing rows untouched', async () => {
    const port = await adapterFor(listSchema)
    runtime = createFormRuntime(port, {
      initialData: { items: [{ name: 'Ann' }, { name: 'Bob' }] },
      validationDebounceMs: 0,
    })
    container = document.body.appendChild(document.createElement('div'))
    mountForm(container, runtime, registry, 'f')

    const before = rows()
    const inputs = before.map((r) => r.querySelector('input'))
    const add = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Add')!
    add.click()
    await flush()

    const after = rows()
    expect(after).toHaveLength(3)
    expect(after.slice(0, 2)).toEqual(before)
    expect(after.slice(0, 2).map((r) => r.querySelector('input'))).toEqual(inputs)
  })
})

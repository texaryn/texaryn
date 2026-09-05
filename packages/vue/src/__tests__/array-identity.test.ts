import { describe, it, expect } from 'vitest'
import { mountExample, settle } from './harness.js'

function inputs(wrapper: { findAll: (s: string) => { element: HTMLInputElement }[] }) {
  return wrapper.findAll('input[type="text"]').map((w) => w.element)
}

describe('stable array identity survives the binding', () => {
  it('keeps a row attached to its own DOM element across a move', async () => {
    const { wrapper, form } = await mountExample('runtime-array-interactions')

    const before = inputs(wrapper)
    expect(before.map((el) => el.value)).toEqual(['milk', 'bread'])

    const milk = before[0]
    const container = form.document.value.nodes[form.document.value.rootId]
    const arrayId = (container as { children: string[] }).children[0]

    form.dispatch({ type: 'MoveItem', containerId: arrayId as never, from: 0, to: 1 })
    await settle()

    const after = inputs(wrapper)
    expect(
      after.map((el) => el.value),
      'the move should reorder the rendered values',
    ).toEqual(['bread', 'milk'])

    // Identity, not just order. The element that held "milk" must be the one
    // that still holds it, which is only true if the row was keyed on the
    // stable item id rather than the positional node id.
    expect(after[1], 'the moved row should keep its DOM element').toBe(milk)
    expect(after[0]).not.toBe(milk)
  })

  // The half that a keyed-by-position implementation would still pass. After
  // a move the surviving component holds a node whose id now names a
  // different position, so a binding that captured the id in setup writes to
  // the row that took its place.
  it('writes to the row it moved to, not the position it left', async () => {
    const { wrapper, form } = await mountExample('runtime-array-interactions')

    const milk = inputs(wrapper)[0]
    const container = form.document.value.nodes[form.document.value.rootId]
    const arrayId = (container as { children: string[] }).children[0]

    form.dispatch({ type: 'MoveItem', containerId: arrayId as never, from: 0, to: 1 })
    await settle()

    milk.value = 'oat milk'
    milk.dispatchEvent(new Event('input'))
    await settle()

    expect(form.data.value).toEqual({ items: ['bread', 'oat milk'] })
  })

  it('drops the removed row rather than shifting values into it', async () => {
    const { wrapper, form } = await mountExample('runtime-array-interactions')

    const bread = inputs(wrapper)[1]
    const container = form.document.value.nodes[form.document.value.rootId]
    const arrayId = (container as { children: string[] }).children[0]

    form.dispatch({ type: 'RemoveItem', containerId: arrayId as never, index: 0 })
    await settle()

    const after = inputs(wrapper)
    expect(after.map((el) => el.value)).toEqual(['bread'])
    expect(after[0], 'the surviving row keeps its element').toBe(bread)
  })

  it('adds a row without disturbing the rows already there', async () => {
    const { wrapper, form } = await mountExample('runtime-array-interactions')

    const before = inputs(wrapper)
    const container = form.document.value.nodes[form.document.value.rootId]
    const arrayId = (container as { children: string[] }).children[0]

    form.dispatch({ type: 'InsertItem', containerId: arrayId as never, index: 2, value: 'eggs' })
    await settle()

    const after = inputs(wrapper)
    expect(after.map((el) => el.value)).toEqual(['milk', 'bread', 'eggs'])
    expect(after[0]).toBe(before[0])
    expect(after[1]).toBe(before[1])
  })
})

// The array composable's own commands, driven through the widget rather than
// dispatched around it. The tests above prove identity survives a command;
// these prove the buttons a user actually presses issue the right one.
describe('the array control issues the commands it offers', () => {
  const buttons = (wrapper: { findAll: (s: string) => { text: () => string; trigger: (e: string) => Promise<void> }[] }, label: string) =>
    wrapper.findAll('button').filter((b) => b.text() === label)

  it('adds a row from the add button', async () => {
    const { wrapper, form } = await mountExample('runtime-array-interactions')

    await buttons(wrapper, 'Add')[0].trigger('click')
    await settle()

    expect((form.data.value as { items: unknown[] }).items).toHaveLength(3)
    expect(inputs(wrapper).map((el) => el.value)).toEqual(['milk', 'bread', ''])
  })

  it('removes the row whose button was pressed, not the last one', async () => {
    const { wrapper, form } = await mountExample('runtime-array-interactions')

    await buttons(wrapper, 'Remove')[0].trigger('click')
    await settle()

    expect(form.data.value).toEqual({ items: ['bread'] })
  })

  // Reordering is opt in through the canReorder hint, so the control has to
  // be absent by default and present when a schema asks for it. Getting that
  // backwards would offer a button that dispatches a command the document
  // says is not allowed.
  it('offers no reorder control when the document does not allow it', async () => {
    const { wrapper } = await mountExample('runtime-array-interactions')
    expect(buttons(wrapper, 'Up')).toHaveLength(0)
  })

  it('moves a row up from its own button when reordering is allowed', async () => {
    const { wrapper, form } = await mountExample('ui-hint-array')

    const up = buttons(wrapper, 'Up')
    expect(up, 'every row after the first should offer it').toHaveLength(1)

    await up[0].trigger('click')
    await settle()

    expect(form.data.value).toEqual({
      tracks: [
        { id: 'b', name: 'Second' },
        { id: 'a', name: 'First' },
      ],
    })
  })
})

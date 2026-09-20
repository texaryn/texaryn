import { afterEach, describe, expect, it } from 'vitest'
import { createFormRuntime } from '@texaryn/core'
import type { FormRuntime } from '@texaryn/core'
import { createDefaultRegistry, mountForm } from '../index.js'
import { mountErrorSummary } from '../summary.js'
import { adapterFor, flush, nodeAt } from './harness.js'

const registry = createDefaultRegistry()

const schema = {
  type: 'object',
  properties: {
    first: { type: 'string', title: 'First', minLength: 1 },
    second: { type: 'string', title: 'Second', minLength: 1 },
  },
  required: ['first', 'second'],
}

let runtime: FormRuntime | undefined

afterEach(() => {
  runtime?.destroy()
  runtime = undefined
  document.body.replaceChildren()
})

async function makeRuntime(): Promise<FormRuntime> {
  runtime = createFormRuntime(await adapterFor(schema), {
    initialData: { first: '', second: '' },
    validationDebounceMs: 0,
    hints: { '/first': { validationTrigger: 'change' }, '/second': { validationTrigger: 'change' } },
  })
  return runtime
}

describe('mountErrorSummary', () => {
  it('renders nothing until the store has an error, then inserts as first child', async () => {
    const container = document.body.appendChild(document.createElement('div'))
    const rt = await makeRuntime()
    const form = mountForm(container, rt, { registry, idPrefix: 'f' })
    const tree = container.firstElementChild
    mountErrorSummary(container, form)
    expect(container.querySelector('ul')).toBeNull()
    expect(container.firstElementChild).toBe(tree)

    rt.dispatch({ type: 'Submit' })
    await flush()
    const list = container.querySelector('ul')!
    expect(list.parentElement).toBe(container.firstElementChild)
    expect(container.firstElementChild!.nextElementSibling).toBe(tree)
    const items = [...list.querySelectorAll('li')]
    expect(items.map((li) => li.querySelector('a')!.textContent)).toEqual(['First', 'Second'])
    for (const li of items) {
      const href = li.querySelector('a')!.getAttribute('href') ?? ''
      const target = document.getElementById(href.slice(1))
      expect(target).toBeInstanceOf(HTMLInputElement)
      expect(container.contains(target)).toBe(true)
      expect(li.textContent).toMatch(/^(First|Second): ./)
    }
    expect(container.firstElementChild!.closest('[aria-live], [role="alert"]')).toBeNull()
    expect(container.firstElementChild!.querySelector('[aria-live], [role="alert"]')).toBeNull()
  })

  it('follows the store down to nothing without replacing the list', async () => {
    const container = document.body.appendChild(document.createElement('div'))
    const rt = await makeRuntime()
    mountErrorSummary(container, mountForm(container, rt, { registry, idPrefix: 'f' }))
    rt.dispatch({ type: 'Submit' })
    await flush()
    const list = container.querySelector('ul')!

    rt.dispatch({ type: 'SetValue', nodeId: nodeAt(rt, '/first'), value: 'a' })
    await flush()
    expect(container.querySelector('ul')).toBe(list)
    expect(list.querySelectorAll('li')).toHaveLength(1)
    expect(list.querySelector('a')!.textContent).toBe('Second')

    rt.dispatch({ type: 'SetValue', nodeId: nodeAt(rt, '/second'), value: 'b' })
    await flush()
    expect(container.querySelector('ul')).toBeNull()
  })

  it('links inside the namespace the form was mounted under', async () => {
    const container = document.body.appendChild(document.createElement('div'))
    const rt = await makeRuntime()
    mountErrorSummary(container, mountForm(container, rt, { registry, idPrefix: 'named' }))
    rt.dispatch({ type: 'Submit' })
    await flush()
    const href = container.querySelector('a')!.getAttribute('href')
    expect(href).toBe(`#named-${nodeAt(rt, '/first')}-input`)
  })

  it('mutates nothing after unmount', async () => {
    const container = document.body.appendChild(document.createElement('div'))
    const rt = await makeRuntime()
    const summary = mountErrorSummary(container, mountForm(container, rt, { registry, idPrefix: 'f' }))
    rt.dispatch({ type: 'Submit' })
    await flush()
    expect(container.querySelector('ul')).not.toBeNull()

    summary.unmount()
    expect(container.querySelector('ul')).toBeNull()
    rt.dispatch({ type: 'SetValue', nodeId: nodeAt(rt, '/first'), value: 'a' })
    await flush()
    rt.dispatch({ type: 'Submit' })
    await flush()
    expect(container.querySelector('ul')).toBeNull()
  })
})

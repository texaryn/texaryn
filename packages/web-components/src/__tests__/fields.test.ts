import { afterEach, describe, expect, it } from 'vitest'
import { createFormRuntime } from '@texaryn/core'
import type { FormRuntime, UIHints } from '@texaryn/core'
import { createDefaultRegistry, mountForm } from '../index.js'
import { adapterFor, flush, kindsSchema, requiredSchema, type } from './harness.js'

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

function control<T extends Element>(name: string): T {
  const found = container.querySelector<T>(`[name="${name}"]`)
  if (!found) throw new Error(`no control named ${name}`)
  return found
}

function data(rt: FormRuntime): Record<string, unknown> {
  return rt.data.getSnapshot() as Record<string, unknown>
}

afterEach(() => {
  runtime?.destroy()
  runtime = null
  document.body.replaceChildren()
})

describe('default widgets', () => {
  it('number coerces typed text and clears to undefined', async () => {
    const rt = await mount(kindsSchema, { age: 3 })
    const age = control<HTMLInputElement>('/age')
    expect(age.type).toBe('number')
    expect(age.value).toBe('3')
    type(age, '42')
    expect(data(rt).age).toBe(42)
    type(age, '')
    expect(data(rt).age).toBeUndefined()
  })

  it('checkbox writes a boolean on change', async () => {
    const rt = await mount(kindsSchema, { agree: false })
    const agree = control<HTMLInputElement>('/agree')
    expect(agree.type).toBe('checkbox')
    agree.checked = true
    agree.dispatchEvent(new Event('change', { bubbles: true }))
    expect(data(rt).agree).toBe(true)
  })

  it('select lists a blank option first and writes the chosen option value', async () => {
    const rt = await mount(kindsSchema, { size: 2 })
    const size = control<HTMLSelectElement>('/size')
    expect(Array.from(size.options).map((o) => o.value)).toEqual(['', '1', '2', '3'])
    expect(size.value).toBe('2')
    size.value = '3'
    size.dispatchEvent(new Event('change', { bubbles: true }))
    expect(data(rt).size).toBe(3)
  })

  it('a textarea hint renders a textarea', async () => {
    const rt = await mount(kindsSchema, { bio: 'hi' }, { '/bio': { widget: 'textarea' } })
    const bio = control<HTMLTextAreaElement>('/bio')
    expect(bio.tagName).toBe('TEXTAREA')
    type(bio, 'hello')
    expect(data(rt).bio).toBe('hello')
  })

  it('exposes required, invalid and describedby the way the Vue widgets do', async () => {
    const rt = await mount(requiredSchema, { name: '' })
    const name = control<HTMLInputElement>('/name')
    const description = container.querySelector<HTMLElement>(
      `#${name.getAttribute('aria-describedby')}`,
    )!
    expect(name.getAttribute('aria-required')).toBe('true')
    expect(name.getAttribute('aria-invalid')).toBeNull()
    expect(description.textContent).toBe('As on your passport')

    rt.dispatch({ type: 'Submit' })
    await flush()
    const alert = container.querySelector<HTMLElement>('[role=alert]')!
    expect(name.getAttribute('aria-invalid')).toBe('true')
    expect(alert.hidden).toBe(false)
    expect(name.getAttribute('aria-describedby')!.split(' ')).toEqual([description.id, alert.id])
  })
})

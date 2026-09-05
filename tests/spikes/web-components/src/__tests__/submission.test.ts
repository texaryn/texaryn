import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SubmissionState } from '@texaryn/core'
import { createDefaultRegistry, defineTexarynForm } from '../index.js'
import type { TexarynFormElement } from '../index.js'
import { adapterFor, flush, requiredSchema, type } from './harness.js'

defineTexarynForm()
const registry = createDefaultRegistry()

async function managed(onSubmit?: (data: unknown) => void): Promise<TexarynFormElement> {
  const port = await adapterFor(requiredSchema)
  const el = document.createElement('texaryn-form') as TexarynFormElement
  el.registry = registry
  el.options = { initialData: { name: '' }, validationDebounceMs: 0, onSubmit }
  el.port = port
  document.body.append(el)
  const submit = document.createElement('button')
  submit.type = 'submit'
  submit.textContent = 'Send'
  el.querySelector('form')!.append(submit)
  return el
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('native submission', () => {
  it('renders a real novalidate form and turns its submit into the Submit command', async () => {
    const onSubmit = vi.fn()
    const el = await managed(onSubmit)
    const form = el.querySelector('form')!
    expect(form.noValidate).toBe(true)

    const seen: SubmissionState[] = []
    el.addEventListener('texaryn-submission-change', (event) => {
      seen.push((event as CustomEvent<SubmissionState>).detail)
    })

    const input = el.querySelector('input')!
    expect(input.getAttribute('aria-invalid')).toBeNull()

    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click()
    await flush()

    expect(onSubmit).not.toHaveBeenCalled()
    expect(el.runtime!.submission.getSnapshot()).toEqual({ status: 'idle', attempts: 1 })
    expect(seen.at(-1)).toEqual({ status: 'idle', attempts: 1 })
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const alert = el.querySelector<HTMLElement>('[role=alert]')!
    expect(alert.hidden).toBe(false)
    expect(alert.textContent).not.toBe('')
    expect(input.getAttribute('aria-describedby')!.split(' ')).toContain(alert.id)

    type(input, 'Ann')
    el.querySelector<HTMLButtonElement>('button[type=submit]')!.click()
    await flush()

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Ann' })
    expect(el.runtime!.submission.getSnapshot().status).toBe('submitted')
    expect(input.getAttribute('aria-invalid')).toBeNull()
  })

  it('emits a data change event as the user types', async () => {
    const el = await managed()
    const seen: unknown[] = []
    el.addEventListener('texaryn-data-change', (event) => {
      seen.push((event as CustomEvent).detail)
    })
    type(el.querySelector('input')!, 'A')
    expect(seen.at(-1)).toEqual({ name: 'A' })
  })

  it('two instances on one page share no ids and resolve labels within themselves', async () => {
    const a = await managed()
    const b = await managed()

    const idsOf = (el: HTMLElement) => Array.from(el.querySelectorAll('[id]')).map((n) => n.id)
    const idsA = idsOf(a)
    const idsB = idsOf(b)
    expect(idsA.length).toBeGreaterThan(0)
    expect(idsA.filter((id) => idsB.includes(id))).toEqual([])

    for (const el of [a, b]) {
      for (const label of el.querySelectorAll('label')) {
        const target = document.getElementById(label.htmlFor)
        expect(target).not.toBeNull()
        expect(el.contains(target)).toBe(true)
      }
      for (const control of el.querySelectorAll('[aria-describedby]')) {
        for (const id of control.getAttribute('aria-describedby')!.split(' ')) {
          expect(el.contains(document.getElementById(id))).toBe(true)
        }
      }
    }
  })
})

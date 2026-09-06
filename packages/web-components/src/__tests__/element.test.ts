import { afterEach, describe, expect, it } from 'vitest'
import { createFormRuntime, createRendererRegistry } from '@texaryn/core'
import type { SubmissionState } from '@texaryn/core'
import { defineTexarynForm } from '../index.js'
import type { TexarynFormElement, WidgetFactory } from '../index.js'
import { adapterFor, flush, nodeAt, requiredSchema } from './harness.js'

defineTexarynForm()
const empty = createRendererRegistry<WidgetFactory>()

function element(): TexarynFormElement {
  const el = document.createElement('texaryn-form') as TexarynFormElement
  el.registry = empty
  return el
}

async function managed(initial = ''): Promise<TexarynFormElement> {
  const el = element()
  el.options = { initialData: { name: initial }, validationDebounceMs: 0 }
  el.port = await adapterFor(requiredSchema)
  document.body.append(el)
  return el
}

function name(runtime: { data: { getSnapshot(): unknown } }): string {
  return (runtime.data.getSnapshot() as { name: string }).name
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('<texaryn-form> lifecycle', () => {
  it('registers once and returns the class', () => {
    expect(defineTexarynForm()).toBe(customElements.get('texaryn-form'))
    expect(() => defineTexarynForm()).not.toThrow()
  })

  it('renders one novalidate form and turns its submit into the Submit command', async () => {
    const el = await managed()
    const forms = el.querySelectorAll('form')
    expect(forms).toHaveLength(1)
    expect(forms[0].noValidate).toBe(true)
    forms[0].dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flush()
    expect(el.runtime!.submission.getSnapshot().attempts).toBe(1)
  })

  it('emits texaryn-data-change and texaryn-submission-change with store snapshots', async () => {
    const el = await managed()
    const data: unknown[] = []
    const submission: SubmissionState[] = []
    el.addEventListener('texaryn-data-change', (e) => data.push((e as CustomEvent).detail))
    el.addEventListener('texaryn-submission-change', (e) =>
      submission.push((e as CustomEvent<SubmissionState>).detail),
    )
    el.runtime!.dispatch({ type: 'SetValue', nodeId: nodeAt(el.runtime!, '/name'), value: 'Ann' })
    el.runtime!.dispatch({ type: 'Submit' })
    await flush()
    expect(data.at(-1)).toEqual({ name: 'Ann' })
    expect(submission.at(-1)).toEqual({ status: 'submitted', attempts: 1 })
  })

  it('a managed runtime survives a reparent and is destroyed on removal', async () => {
    const el = await managed()
    const owned = el.runtime!
    const nodeId = nodeAt(owned, '/name')
    const second = document.body.appendChild(document.createElement('section'))
    second.append(el)
    await flush()
    expect(el.runtime).toBe(owned)
    expect(owned.getNodeState(nodeId)).toBeDefined()

    el.remove()
    await flush()
    expect(owned.getNodeState(nodeId)).toBeUndefined()
    owned.dispatch({ type: 'SetValue', nodeId, value: 'Bea' })
    expect(name(owned)).toBe('')
  })

  it('a borrowed runtime is never destroyed and is rendered again on reattach', async () => {
    const runtime = createFormRuntime(await adapterFor(requiredSchema), {
      initialData: { name: 'Ann' },
      validationDebounceMs: 0,
    })
    const el = element()
    el.runtime = runtime
    document.body.append(el)
    expect(el.querySelector('form')).not.toBeNull()

    el.remove()
    await flush()
    const nodeId = nodeAt(runtime, '/name')
    runtime.dispatch({ type: 'SetValue', nodeId, value: 'Bea' })
    expect(runtime.getNodeState(nodeId)).toBeDefined()
    expect(el.runtime).toBe(runtime)

    const seen: unknown[] = []
    el.addEventListener('texaryn-data-change', (e) => seen.push((e as CustomEvent).detail))
    document.body.append(el)
    runtime.dispatch({ type: 'SetValue', nodeId, value: 'Cid' })
    expect(seen.at(-1)).toEqual({ name: 'Cid' })
    runtime.destroy()
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

  it('options are read when the managed runtime is created; setting port again rebuilds it', async () => {
    const el = await managed('A')
    const first = el.runtime!
    expect(name(first)).toBe('A')

    el.options = { initialData: { name: 'B' }, validationDebounceMs: 0 }
    expect(el.runtime).toBe(first)
    expect(name(first)).toBe('A')

    const nodeId = nodeAt(first, '/name')
    el.port = el.port
    const second = el.runtime!
    expect(second).not.toBe(first)
    expect(name(second)).toBe('B')
    expect(first.getNodeState(nodeId)).toBeUndefined()
  })

  it('takes its id prefix from its own id attribute, else allocates one per instance', () => {
    const named = element()
    named.id = 'signup'
    expect(named.idPrefix).toBe('signup')
    const a = element()
    const b = element()
    expect(a.idPrefix).toMatch(/^texaryn-\d+$/)
    expect(b.idPrefix).not.toBe(a.idPrefix)
  })
})

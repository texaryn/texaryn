import { afterEach, describe, expect, it } from 'vitest'
import { createFormRuntime, createStore, englishMessages } from '@texaryn/core'
import type {
  FormRuntime,
  InitializationReport,
  NodeId,
  SchemaEvaluationPort,
  SubmissionState,
  UIDocument,
  VisibleError,
} from '@texaryn/core'
import { createDefaultRegistry, defineTexarynForm, mountForm } from '../index.js'
import type { TexarynFormElement } from '../index.js'
import { mountErrorSummary } from '../summary.js'
import type { Mount } from '../mount.js'
import { adapterFor, flush, nodeAt } from './harness.js'

const registry = createDefaultRegistry()
defineTexarynForm()

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

function entry(nodeId: string, title: string, message: string): VisibleError {
  return {
    nodeId: nodeId as NodeId,
    fieldTitle: title,
    pointer: null,
    errors: [{ instancePointer: '/' + nodeId, keyword: 'required', message, params: {} }],
  }
}

function mockMount(store: ReturnType<typeof createStore<VisibleError[]>>): Mount {
  const stub: FormRuntime = {
    document: createStore<UIDocument>({ version: 1, rootId: 'node_1' as NodeId, nodes: {} }),
    data: createStore<unknown>({}),
    submission: createStore<SubmissionState>({ status: 'idle', attempts: 0 }),
    visibleErrors: store,
    initialization: createStore<InitializationReport | undefined>(undefined),
    dispatch: () => {},
    getNodeState: () => undefined,
    destroy: () => {},
  }
  return {
    runtime: stub,
    idPrefix: 'f',
    messages: englishMessages,
    setMessages: () => {},
    unmount: () => {},
  }
}

describe('mountErrorSummary', () => {
  it('reorders, inserts and retitles items without recreating them', () => {
    const container = document.body.appendChild(document.createElement('div'))
    const store = createStore<VisibleError[]>([entry('a', 'A', 'x'), entry('c', 'C', 'x')])
    mountErrorSummary(container, mockMount(store))

    const list = container.querySelector('ul')!
    let items = [...list.querySelectorAll('li')]
    expect(items.map((li) => li.querySelector('a')!.textContent)).toEqual(['A', 'C'])
    const [liA, liC] = items

    store.set([entry('a', 'A', 'x'), entry('b', 'B', 'x'), entry('c', 'C', 'x')])
    expect(container.querySelector('ul')).toBe(list)
    items = [...list.querySelectorAll('li')]
    expect(items).toHaveLength(3)
    expect(items[0]).toBe(liA)
    expect(items[2]).toBe(liC)
    expect(items.map((li) => li.querySelector('a')!.textContent)).toEqual(['A', 'B', 'C'])
    const liB = items[1]

    store.set([entry('c', 'C', 'x'), entry('b', 'B', 'x'), entry('a', 'A', 'x')])
    items = [...list.querySelectorAll('li')]
    expect(items).toEqual([liC, liB, liA])
    expect(items.map((li) => li.querySelector('a')!.textContent)).toEqual(['C', 'B', 'A'])

    store.set([entry('c', 'C', 'x'), entry('b', 'Bee', 'Changed'), entry('a', 'A', 'x')])
    items = [...list.querySelectorAll('li')]
    expect(items[1]).toBe(liB)
    expect(liB.querySelector('a')!.textContent).toBe('Bee')
    expect(liB.textContent).toBe('Bee: Changed')

    store.set([entry('b', 'Bee', 'Changed')])
    expect([...list.querySelectorAll('li')]).toEqual([liB])
    expect(liA.isConnected).toBe(false)
    expect(liC.isConnected).toBe(false)

    store.set([])
    expect(container.querySelector('ul')).toBeNull()
    expect(container.childElementCount).toBe(0)
  })

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

    const second = list.querySelectorAll('li')[1]

    rt.dispatch({ type: 'SetValue', nodeId: nodeAt(rt, '/first'), value: 'a' })
    await flush()
    expect(container.querySelector('ul')).toBe(list)
    expect(list.querySelectorAll('li')).toHaveLength(1)
    expect(list.querySelector('a')!.textContent).toBe('Second')
    expect(list.querySelector('li')).toBe(second)

    rt.dispatch({ type: 'SetValue', nodeId: nodeAt(rt, '/second'), value: 'b' })
    await flush()
    expect(container.querySelector('ul')).toBeNull()
  })

  it('keeps a focused link through a validation refresh', async () => {
    const container = document.body.appendChild(document.createElement('div'))
    const rt = await makeRuntime()
    mountErrorSummary(container, mountForm(container, rt, { registry, idPrefix: 'f' }))
    rt.dispatch({ type: 'Submit' })
    await flush()
    const links = [...container.querySelectorAll('a')]
    expect(links).toHaveLength(2)
    links[1].focus()

    rt.dispatch({ type: 'SetTouched', nodeId: nodeAt(rt, '/first') })
    await flush()
    expect([...container.querySelectorAll('a')]).toEqual(links)
    expect(document.activeElement).toBe(links[1])
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
    expect(container.querySelector('input')).not.toBeNull()
    rt.dispatch({ type: 'SetValue', nodeId: nodeAt(rt, '/first'), value: 'a' })
    await flush()
    rt.dispatch({ type: 'Submit' })
    await flush()
    expect(container.querySelector('ul')).toBeNull()
  })

  it('is a named group headed and detailed by the messages', async () => {
    const container = document.body.appendChild(document.createElement('div'))
    const rt = await makeRuntime()
    mountErrorSummary(container, mountForm(container, rt, { registry, idPrefix: 'f' }))
    rt.dispatch({ type: 'Submit' })
    await flush()
    const group = container.querySelector('[role="group"]')!
    expect(group).toBe(container.firstElementChild)
    expect(group.getAttribute('tabindex')).toBe('-1')
    const heading = group.querySelector('h2')!
    expect(group.firstElementChild).toBe(heading)
    expect(heading.id).toBe('f-error-summary-heading')
    expect(group.getAttribute('aria-labelledby')).toBe(heading.id)
    expect(heading.textContent).toBe('There are 2 problems')
    expect(container.querySelector('li')!.textContent).toMatch(/^First: ./)
  })

  it('focuses the group once a failed submit settles, and again on the next attempt', async () => {
    const container = document.body.appendChild(document.createElement('div'))
    const rt = await makeRuntime()
    mountErrorSummary(container, mountForm(container, rt, { registry, idPrefix: 'f' }))
    rt.dispatch({ type: 'Submit' })
    await flush()
    const group = container.querySelector('[role="group"]')!
    expect(document.activeElement).toBe(group)

    container.querySelector('input')!.focus()
    rt.dispatch({ type: 'Submit' })
    await flush()
    expect(document.activeElement).toBe(group)
  })

  it('leaves focus alone with focus off, and after a late mount', async () => {
    const container = document.body.appendChild(document.createElement('div'))
    const rt = await makeRuntime()
    const form = mountForm(container, rt, { registry, idPrefix: 'f' })
    const passive = mountErrorSummary(container, form, { focus: false })
    const input = container.querySelector('input')!
    input.focus()
    rt.dispatch({ type: 'Submit' })
    await flush()
    expect(container.querySelector('[role="group"]')).not.toBeNull()
    expect(document.activeElement).toBe(input)

    passive.unmount()
    input.blur()
    mountErrorSummary(container, form)
    expect(container.querySelector('[role="group"]')).not.toBeNull()
    expect(document.activeElement).toBe(document.body)
  })

  it('does not focus when submit validation throws, even over visible errors', async () => {
    const container = document.body.appendChild(document.createElement('div'))
    const port = await adapterFor(schema)
    let fail = false
    const flaky: SchemaEvaluationPort = {
      ...port,
      validate: (...args: Parameters<SchemaEvaluationPort['validate']>) =>
        fail ? Promise.reject(new Error('evaluator down')) : port.validate(...args),
    }
    runtime = createFormRuntime(flaky, {
      initialData: { first: '', second: '' },
      validationDebounceMs: 0,
      hints: { '/first': { validationTrigger: 'blur' } },
    })
    const rt = runtime
    mountErrorSummary(container, mountForm(container, rt, { registry, idPrefix: 'f' }))
    rt.dispatch({ type: 'SetTouched', nodeId: nodeAt(rt, '/first') })
    await flush()
    expect(container.querySelector('[role="group"]')).not.toBeNull()

    fail = true
    const input = container.querySelector('input')!
    input.focus()
    rt.dispatch({ type: 'Submit' })
    await flush()
    expect(rt.submission.getSnapshot().error).toBeDefined()
    expect(document.activeElement).toBe(input)
  })

  it('follows a messages switch on the mounted summary without losing focus', async () => {
    const container = document.body.appendChild(document.createElement('div'))
    const rt = await makeRuntime()
    const form = mountForm(container, rt, { registry, idPrefix: 'f' })
    const summary = mountErrorSummary(container, form)
    rt.dispatch({ type: 'Submit' })
    await flush()
    const group = container.querySelector('[role="group"]')!
    const link = container.querySelector('a')!
    summary.setMessages({
      ...englishMessages,
      errorSummaryHeading: ({ count }) => `Il y a ${count} problèmes`,
      errorSummaryDetail: ({ messages }) => ` : ${messages.join(', ')}`,
    })
    expect(container.querySelector('[role="group"]')).toBe(group)
    expect(container.querySelector('a')).toBe(link)
    expect(group.querySelector('h2')!.textContent).toBe('Il y a 2 problèmes')
    expect(container.querySelector('li')!.textContent).toMatch(/^First : ./)
    expect(document.activeElement).toBe(group)
  })
})

function element(): TexarynFormElement {
  const el = document.createElement('texaryn-form') as TexarynFormElement
  el.registry = registry
  return el
}

async function failSubmit(rt: FormRuntime): Promise<void> {
  rt.dispatch({ type: 'Submit' })
  await flush()
}

describe('<texaryn-form error-summary>', () => {
  it('mounts the summary from the attribute, first in its form', async () => {
    const rt = await makeRuntime()
    const el = element()
    el.setAttribute('error-summary', '')
    el.runtime = rt
    document.body.append(el)
    expect(el.errorSummary).toBe(true)
    await failSubmit(rt)

    const form = el.querySelector('form')!
    expect(form.firstElementChild!.querySelector('ul')).not.toBeNull()
    expect(form.querySelectorAll('ul')).toHaveLength(1)
    const href = form.querySelector('a')!.getAttribute('href') ?? ''
    expect(document.getElementById(href.slice(1))).toBe(form.querySelector('input'))
  })

  it('reflects the property to the attribute and toggles live both ways', async () => {
    const rt = await makeRuntime()
    const el = element()
    el.runtime = rt
    document.body.append(el)
    await failSubmit(rt)
    const form = el.querySelector('form')!
    expect(form.querySelector('ul')).toBeNull()

    el.errorSummary = true
    expect(el.hasAttribute('error-summary')).toBe(true)
    expect(form.firstElementChild!.querySelector('ul')).not.toBeNull()

    el.removeAttribute('error-summary')
    expect(el.errorSummary).toBe(false)
    expect(form.querySelector('ul')).toBeNull()

    el.errorSummary = true
    expect(form.querySelectorAll('ul')).toHaveLength(1)
  })

  it('keeps the flag while disconnected and applies it on the next mount', async () => {
    const rt = await makeRuntime()
    const el = element()
    el.errorSummary = true
    el.runtime = rt
    expect(el.hasAttribute('error-summary')).toBe(true)
    document.body.append(el)
    await failSubmit(rt)
    expect(el.querySelector('form')!.querySelectorAll('ul')).toHaveLength(1)

    el.remove()
    await flush()
    document.body.append(el)
    await flush()
    expect(el.querySelector('form')!.querySelectorAll('ul')).toHaveLength(1)
  })

  it('survives a reparent with one summary', async () => {
    const rt = await makeRuntime()
    const el = element()
    el.errorSummary = true
    el.runtime = rt
    document.body.append(el)
    await failSubmit(rt)

    const other = document.body.appendChild(document.createElement('section'))
    other.append(el)
    await flush()
    expect(el.querySelector('form')!.querySelectorAll('ul')).toHaveLength(1)
  })

  it('unmounts the summary with the form', async () => {
    const rt = await makeRuntime()
    const el = element()
    el.errorSummary = true
    el.runtime = rt
    document.body.append(el)
    await failSubmit(rt)
    const form = el.querySelector('form')!

    el.remove()
    await flush()
    expect(form.querySelector('ul')).toBeNull()
    rt.dispatch({ type: 'SetValue', nodeId: nodeAt(rt, '/first'), value: 'a' })
    await flush()
    expect(form.querySelector('ul')).toBeNull()
  })

  it('follows a runtime replacement with one summary bound to the new runtime', async () => {
    const a = await makeRuntime()
    const b = createFormRuntime(await adapterFor(schema), {
      initialData: { first: '', second: '' },
      validationDebounceMs: 0,
      hints: { '/first': { validationTrigger: 'change' }, '/second': { validationTrigger: 'change' } },
    })
    const el = element()
    el.errorSummary = true
    el.runtime = a
    document.body.append(el)
    await failSubmit(a)

    const form = el.querySelector('form')!
    const oldSummary = form.firstElementChild!
    const firstHref = form.querySelector('a')!.getAttribute('href') ?? ''
    const firstTarget = document.getElementById(firstHref.slice(1))
    expect(firstTarget).toBeInstanceOf(HTMLInputElement)
    expect(form.contains(firstTarget)).toBe(true)

    el.runtime = b
    await flush()
    expect(form.querySelectorAll('ul')).toHaveLength(0)
    expect(oldSummary.isConnected).toBe(false)

    await failSubmit(b)
    expect(form.querySelectorAll('ul')).toHaveLength(1)
    const newHref = form.querySelector('a')!.getAttribute('href') ?? ''
    const newTarget = document.getElementById(newHref.slice(1))
    expect(newTarget).toBeInstanceOf(HTMLInputElement)
    expect(form.contains(newTarget)).toBe(true)
    expect(newTarget!.id).toContain(nodeAt(b, '/first'))

    a.dispatch({ type: 'SetValue', nodeId: nodeAt(a, '/first'), value: 'a' })
    await flush()
    expect(form.querySelectorAll('li')).toHaveLength(2)

    b.destroy()
  })

  it('rebuilds the summary when the managed port is replaced', async () => {
    const el = element()
    el.errorSummary = true
    el.options = { initialData: { first: '', second: '' }, validationDebounceMs: 0 }
    el.port = await adapterFor(schema)
    document.body.append(el)
    await flush()

    const first = el.runtime!
    await failSubmit(first)
    const form = el.querySelector('form')!
    const oldSummary = form.firstElementChild!
    expect(form.querySelectorAll('ul')).toHaveLength(1)

    el.port = await adapterFor(schema)
    await flush()
    expect(el.runtime).not.toBe(first)
    expect(form.querySelectorAll('ul')).toHaveLength(0)
    expect(oldSummary.isConnected).toBe(false)

    await failSubmit(el.runtime!)
    expect(form.querySelectorAll('ul')).toHaveLength(1)
    const href = form.querySelector('a')!.getAttribute('href') ?? ''
    const target = document.getElementById(href.slice(1))
    expect(target).toBeInstanceOf(HTMLInputElement)
    expect(form.contains(target)).toBe(true)
  })

  it('reads no-focus from the attribute and reflects errorSummaryFocus', async () => {
    const rt = await makeRuntime()
    const el = element()
    el.setAttribute('error-summary', 'no-focus')
    el.runtime = rt
    document.body.append(el)
    expect(el.errorSummary).toBe(true)
    expect(el.errorSummaryFocus).toBe(false)
    const input = el.querySelector('input')!
    input.focus()
    await failSubmit(rt)
    expect(el.querySelector('[role="group"]')).not.toBeNull()
    expect(document.activeElement).toBe(input)

    el.errorSummaryFocus = true
    expect(el.getAttribute('error-summary')).toBe('')
    input.focus()
    await failSubmit(rt)
    expect(document.activeElement).toBe(el.querySelector('[role="group"]'))

    el.errorSummaryFocus = false
    expect(el.getAttribute('error-summary')).toBe('no-focus')
    el.errorSummary = false
    expect(el.hasAttribute('error-summary')).toBe(false)
    el.errorSummary = true
    expect(el.getAttribute('error-summary')).toBe('no-focus')
  })

  it('forwards a messages change to the summary', async () => {
    const rt = await makeRuntime()
    const el = element()
    el.errorSummary = true
    el.runtime = rt
    document.body.append(el)
    await failSubmit(rt)
    el.messages = {
      ...englishMessages,
      errorSummaryHeading: ({ count }) => `Il y a ${count} problèmes`,
      errorSummaryDetail: ({ messages }) => ` : ${messages.join(', ')}`,
    }
    expect(el.querySelector('h2')!.textContent).toBe('Il y a 2 problèmes')
  })
})

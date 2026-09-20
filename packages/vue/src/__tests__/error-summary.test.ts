import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createFormRuntime, createStore } from '@texaryn/core'
import type {
  FormRuntime,
  InitializationReport,
  JsonPointer,
  NodeId,
  SubmissionState,
  UIDocument,
  VisibleError,
} from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { provideFormRuntime } from '../context.js'
import { ErrorSummary } from '../components/ErrorSummary.js'
import { FormRoot } from '../components/FormRoot.js'
import { createDefaultRegistry } from '../widgets/default-registry.js'

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

async function settle(): Promise<void> {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

function nodeAt(rt: FormRuntime, pointer: string): NodeId {
  const doc = rt.document.getSnapshot()
  const node = Object.values(doc.nodes).find((n) => n.dataPointer === pointer)
  if (!node) throw new Error(`no node at ${pointer}`)
  return node.id
}

function mountSummary(rt: FormRuntime, withForm: boolean): HTMLElement {
  const host = document.body.appendChild(document.createElement('div'))
  mount(
    defineComponent({
      setup() {
        provideFormRuntime(rt)
        return () =>
          withForm ? [h(ErrorSummary), h(FormRoot, { registry: createDefaultRegistry() })] : h(ErrorSummary)
      },
    }),
    { attachTo: host },
  )
  return host
}

async function liveForm(): Promise<{ host: HTMLElement; rt: FormRuntime }> {
  runtime = createFormRuntime(await createJsonSchemaAdapter(schema), {
    initialData: { first: '', second: '' },
    validationDebounceMs: 0,
    hints: { '/first': { validationTrigger: 'change' }, '/second': { validationTrigger: 'change' } },
  })
  const host = mountSummary(runtime, true)
  await settle()
  return { host, rt: runtime }
}

function mockRuntime(visibleErrors: VisibleError[]): FormRuntime {
  return {
    document: createStore<UIDocument>({ version: 1, rootId: 'node_1' as NodeId, nodes: {} }),
    data: createStore<unknown>({}),
    submission: createStore<SubmissionState>({ status: 'idle', attempts: 0 }),
    visibleErrors: createStore<VisibleError[]>(visibleErrors),
    initialization: createStore<InitializationReport | undefined>(undefined),
    dispatch: () => {},
    getNodeState: () => undefined,
    destroy: () => {},
  }
}

describe('ErrorSummary over a live runtime', () => {
  it('renders nothing before a submit', async () => {
    const { host } = await liveForm()
    expect(host.querySelector('ul')).toBeNull()
    expect(host.querySelectorAll('a')).toHaveLength(0)
  })

  it('links each visible error to the input the renderer mounted', async () => {
    const { host, rt } = await liveForm()
    rt.dispatch({ type: 'Submit' })
    await settle()

    const items = [...host.querySelectorAll('li')]
    expect(items.map((li) => li.querySelector('a')!.textContent)).toEqual(['First', 'Second'])
    for (const li of items) {
      const href = li.querySelector('a')!.getAttribute('href') ?? ''
      const target = document.getElementById(href.slice(1))
      expect(target).toBeInstanceOf(HTMLInputElement)
      expect(host.contains(target)).toBe(true)
      expect(li.textContent).toMatch(/^(First|Second): ./)
    }
  })

  it('follows the store down to nothing', async () => {
    const { host, rt } = await liveForm()
    rt.dispatch({ type: 'Submit' })
    await settle()
    const list = host.querySelector('ul')!
    expect(list.querySelectorAll('li')).toHaveLength(2)

    rt.dispatch({ type: 'SetValue', nodeId: nodeAt(rt, '/first'), value: 'a' })
    await settle()
    expect(host.querySelector('ul')).toBe(list)
    expect(list.querySelectorAll('li')).toHaveLength(1)
    expect(list.querySelector('a')!.textContent).toBe('Second')

    rt.dispatch({ type: 'SetValue', nodeId: nodeAt(rt, '/second'), value: 'b' })
    await settle()
    expect(host.querySelector('ul')).toBeNull()
  })

  it('is not a live region', async () => {
    const { host, rt } = await liveForm()
    rt.dispatch({ type: 'Submit' })
    await settle()
    const container = host.querySelector('ul')!.parentElement!
    expect(container.closest('[aria-live], [role="alert"]')).toBeNull()
    expect(container.querySelector('[aria-live], [role="alert"]')).toBeNull()
  })
})

describe('ErrorSummary fallbacks', () => {
  it('uses the pointer, then the node id, then the keyword', () => {
    const host = mountSummary(
      mockRuntime([
        {
          nodeId: 'node_2' as NodeId,
          fieldTitle: undefined,
          pointer: '/name' as JsonPointer,
          errors: [{ instancePointer: '/name', keyword: 'minLength', params: {} }],
        },
        {
          nodeId: 'node_3' as NodeId,
          fieldTitle: undefined,
          pointer: null,
          errors: [{ instancePointer: '/x', keyword: 'required', message: 'Required', params: {} }],
        },
      ]),
      false,
    )
    const items = [...host.querySelectorAll('li')]
    expect(items.map((li) => li.textContent)).toEqual(['/name: minLength', 'node_3: Required'])
    expect(items[0].querySelector('a')!.getAttribute('href')).toMatch(/^#texaryn-[0-9a-z_]+-node_2-input$/)
  })
})

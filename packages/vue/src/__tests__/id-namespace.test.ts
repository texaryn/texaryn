import { describe, it, expect } from 'vitest'
import { createSSRApp, defineComponent, h, nextTick } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { mount } from '@vue/test-utils'
import { createFormRuntime } from '@texaryn/core'
import type { FormRuntime, SchemaEvaluationPort } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { FormRoot } from '../components/FormRoot.js'
import { provideFormRuntime } from '../context.js'
import { createDefaultRegistry } from '../widgets/default-registry.js'

const registry = createDefaultRegistry()

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Full Name', description: 'Legal name', minLength: 1 },
    address: {
      type: 'object',
      title: 'Address',
      properties: { city: { type: 'string', title: 'City' } },
    },
  },
  required: ['name'],
}

function makePort(): Promise<SchemaEvaluationPort> {
  return createJsonSchemaAdapter(schema)
}

function makeRuntime(port: SchemaEvaluationPort): FormRuntime {
  return createFormRuntime(port, { initialData: { name: '', address: { city: '' } } })
}

/** One component that provides, so a later sibling of FormRoot shares the scope. */
function formComponent(runtime: FormRuntime) {
  return defineComponent({
    setup() {
      provideFormRuntime(runtime)
      return () => h(FormRoot, { registry })
    },
  })
}

function idsIn(root: Element): string[] {
  return [...root.querySelectorAll('[id]')].map((el) => el.id)
}

function referencedIds(root: Element): string[] {
  const out: string[] = []
  for (const el of root.querySelectorAll('[for],[aria-describedby],[aria-labelledby]')) {
    for (const attribute of ['for', 'aria-describedby', 'aria-labelledby']) {
      const value = el.getAttribute(attribute)
      if (value) out.push(...value.split(' ').filter(Boolean))
    }
  }
  return out
}

describe('id namespace', () => {
  it('gives two forms in one Vue app disjoint ids', async () => {
    const port = await makePort()
    const a = makeRuntime(port)
    const b = makeRuntime(port)
    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h('div', [
              h('section', { 'data-testid': 'a' }, [h(formComponent(a))]),
              h('section', { 'data-testid': 'b' }, [h(formComponent(b))]),
            ])
        },
      }),
    )
    await nextTick()

    const first = wrapper.element.querySelector('[data-testid=a]')!
    const second = wrapper.element.querySelector('[data-testid=b]')!
    const firstIds = idsIn(first)
    const secondIds = idsIn(second)

    expect(firstIds.length).toBeGreaterThan(0)
    expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([])
    for (const reference of referencedIds(first)) {
      expect(firstIds).toContain(reference)
    }
    for (const reference of referencedIds(second)) {
      expect(secondIds).toContain(reference)
    }
    wrapper.unmount()
  })

  it('gives one runtime provided twice different ids', async () => {
    const port = await makePort()
    const shared = makeRuntime(port)
    const wrapper = mount(
      defineComponent({
        setup() {
          return () =>
            h('div', [
              h('section', { 'data-testid': 'a' }, [h(formComponent(shared))]),
              h('section', { 'data-testid': 'b' }, [h(formComponent(shared))]),
            ])
        },
      }),
    )
    await nextTick()

    const firstIds = idsIn(wrapper.element.querySelector('[data-testid=a]')!)
    const secondIds = idsIn(wrapper.element.querySelector('[data-testid=b]')!)
    expect(firstIds.length).toBe(secondIds.length)
    expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([])
    wrapper.unmount()
  })

  it('produces ids usable as a selector without escaping', async () => {
    const port = await makePort()
    const wrapper = mount(formComponent(makeRuntime(port)), { attachTo: document.body })
    await nextTick()

    const ids = idsIn(wrapper.element)
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) {
      expect(document.querySelector(`#${id}`)).toBe(document.getElementById(id))
    }
    wrapper.unmount()
  })

  it('separates independent Vue apps given distinct idPrefix', async () => {
    const port = await makePort()
    const wrappers = ['app1', 'app2'].map((idPrefix) =>
      mount(formComponent(makeRuntime(port)), { global: { config: { idPrefix } } }),
    )
    await nextTick()

    const firstIds = idsIn(wrappers[0]!.element)
    const secondIds = idsIn(wrappers[1]!.element)
    expect(firstIds.length).toBeGreaterThan(0)
    expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([])
    for (const wrapper of wrappers) wrapper.unmount()
  })

  it('refuses to render a field with no provided scope', () => {
    expect(() => mount(FormRoot, { props: { registry } })).toThrow(/provideFormRuntime/)
  })

  // The peer floor moved to 3.5 for useId precisely because a counter cannot
  // survive hydration, so the claim is proven rather than asserted.
  it('hydrates a server render of two scopes without changing ids', async () => {
    const port = await makePort()
    const a = makeRuntime(port)
    const b = makeRuntime(port)
    const Root = defineComponent({
      setup() {
        return () =>
          h('div', [
            h('section', { 'data-testid': 'a' }, [h(formComponent(a))]),
            h('section', { 'data-testid': 'b' }, [h(formComponent(b))]),
          ])
      },
    })

    const html = await renderToString(createSSRApp(Root))
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.appendChild(host)
    const serverIds = idsIn(host)
    expect(serverIds.length).toBeGreaterThan(0)

    const warnings: unknown[] = []
    const originalWarn = console.warn
    const originalError = console.error
    console.warn = (...args: unknown[]) => { warnings.push(args) }
    console.error = (...args: unknown[]) => { warnings.push(args) }
    const app = createSSRApp(Root)
    app.mount(host)
    await nextTick()
    console.warn = originalWarn
    console.error = originalError

    expect(warnings).toEqual([])
    expect(idsIn(host)).toEqual(serverIds)

    app.unmount()
    host.remove()
  })
})

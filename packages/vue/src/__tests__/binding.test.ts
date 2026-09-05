import { describe, it, expect, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { mountExample, example, settle } from './harness.js'
import { provideFormRuntime, useField, useForm, FormRoot, createDefaultRegistry } from '../index.js'

function labelled(wrapper: ReturnType<typeof mount>, text: string): HTMLInputElement | undefined {
  const label = wrapper.findAll('label').find((l) => l.text() === text)
  if (!label) return undefined
  const id = label.attributes('for')
  return wrapper.findAll('input, select, textarea').find((el) => el.attributes('id') === id)
    ?.element as HTMLInputElement | undefined
}

describe('the document reaches the DOM', () => {
  it('renders a widget for every active field', async () => {
    const { wrapper } = await mountExample('basics-object')
    expect(wrapper.findAll('input').length).toBeGreaterThan(0)
    expect(labelled(wrapper, 'First name')).toBeDefined()
    expect(labelled(wrapper, 'Age')).toBeDefined()
    wrapper.unmount()
  })

  it('renders a select for an enum rather than a text box', async () => {
    const { wrapper } = await mountExample('basics-enum-string')
    expect(wrapper.findAll('select').length).toBe(1)
    wrapper.unmount()
  })
})

describe('typing reaches the runtime and comes back', () => {
  it('writes what was typed into form data', async () => {
    const { wrapper, form } = await mountExample('basics-string')
    const input = wrapper.find('input').element as HTMLInputElement

    input.value = 'Ada'
    input.dispatchEvent(new Event('input'))
    await settle()

    expect(form.data.value).toMatchObject({ name: 'Ada' })
    wrapper.unmount()
  })

  it('shows a value the runtime changed without the DOM asking', async () => {
    const { wrapper, form } = await mountExample('basics-string')
    const rootId = form.document.value.rootId
    const nameId = (form.document.value.nodes[rootId] as { children: string[] }).children[0]

    form.dispatch({ type: 'SetValue', nodeId: nameId as never, value: 'Grace' })
    await settle()

    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('Grace')
    wrapper.unmount()
  })

  it('keeps a numeric field numeric', async () => {
    const { wrapper, form } = await mountExample('runtime-numeric-coercion')
    const input = wrapper.find('input[type="number"]').element as HTMLInputElement

    input.value = '42'
    input.dispatchEvent(new Event('input'))
    await settle()

    const values = Object.values(form.data.value as Record<string, unknown>)
    expect(values.some((v) => v === 42)).toBe(true)
    wrapper.unmount()
  })
})

describe('conditional recompilation moves the rendered tree', () => {
  it('adds and removes branch fields as the discriminator changes', async () => {
    const { wrapper } = await mountExample('conditional-if-then-else', {
      initialData: { accountType: 'personal' },
    })

    expect(labelled(wrapper, 'Nickname'), 'the personal branch should render').toBeDefined()
    expect(labelled(wrapper, 'Company name'), 'the business branch should not').toBeUndefined()

    const select = wrapper.find('select').element as HTMLSelectElement
    select.value = 'business'
    select.dispatchEvent(new Event('change'))
    await settle()

    expect(labelled(wrapper, 'Company name'), 'the business branch should appear').toBeDefined()
    expect(labelled(wrapper, 'Nickname'), 'the personal branch should go').toBeUndefined()
  })

  it('lets a field that appeared after a recompile be typed into', async () => {
    const { wrapper, form } = await mountExample('conditional-if-then-else', {
      initialData: { accountType: 'personal' },
    })

    const select = wrapper.find('select').element as HTMLSelectElement
    select.value = 'business'
    select.dispatchEvent(new Event('change'))
    await settle()

    // A field created by a recompile has a bundle that did not exist when the
    // form mounted. If the binding resolved node state once, this input would
    // render and then swallow everything typed into it.
    const company = labelled(wrapper, 'Company name')
    expect(company).toBeDefined()
    company!.value = 'Texaryn Ltd'
    company!.dispatchEvent(new Event('input'))
    await settle()

    expect(form.data.value).toMatchObject({ accountType: 'business', companyName: 'Texaryn Ltd' })
  })
})

describe('validation and touched state drive what is shown', () => {
  it('stays quiet before the field is touched', async () => {
    const { wrapper } = await mountExample('accessibility-error-association')
    await settle()
    expect(wrapper.findAll('[role="alert"]').length).toBe(0)
    wrapper.unmount()
  })

  it('reports the error once the field is blurred', async () => {
    const { wrapper } = await mountExample('accessibility-error-association')
    const input = wrapper.find('input').element as HTMLInputElement

    // minLength is 3, so this has to be short enough to actually fail.
    input.value = 'ab'
    input.dispatchEvent(new Event('input'))
    await settle()
    input.dispatchEvent(new Event('blur'))
    await settle()

    expect(wrapper.findAll('[role="alert"]').length).toBeGreaterThan(0)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toContain('error')
    wrapper.unmount()
  })

  it('marks a blurred field touched without changing its value', async () => {
    const { wrapper, form } = await mountExample('basics-string')
    const rootId = form.document.value.rootId
    const nameId = (form.document.value.nodes[rootId] as { children: string[] }).children[0]

    expect(form.runtime.getNodeState(nameId as never)?.touched.getSnapshot()).toBe(false)

    ;(wrapper.find('input').element as HTMLInputElement).dispatchEvent(new Event('blur'))
    await settle()

    expect(form.runtime.getNodeState(nameId as never)?.touched.getSnapshot()).toBe(true)
    wrapper.unmount()
  })
})

describe('node state is re-resolved, not resolved once', () => {
  // The runtime drops a node's state bundle when its id leaves the document
  // and builds a new one if the id comes back. A widget keyed on stable item
  // identity unmounts in between and never notices, but a component that
  // holds a field across the gap does: probing the runtime directly, the
  // bundle before and after is not the same object.
  it('follows the replacement bundle after an id is dropped and recreated', async () => {
    const ex = example('runtime-array-interactions')
    const port = await createJsonSchemaAdapter(ex.schema, {})

    let field!: ReturnType<typeof useField>
    let form!: ReturnType<typeof useForm>
    let arrayId = ''

    // A child, because inject reads the parent chain: a component never sees
    // what it provided itself.
    const Holder = defineComponent({
      props: { nodeId: { type: String, required: true } },
      setup(props) {
        field = useField(() => props.nodeId as never)
        return () => h('div')
      },
    })

    const wrapper = mount(
      defineComponent({
        setup() {
          form = useForm(port, { initialData: ex.initialData, validationDebounceMs: 0 })
          provideFormRuntime(form.runtime)
          const doc = form.document.value
          arrayId = (doc.nodes[doc.rootId] as { children: string[] }).children[0]
          const secondItem = (doc.nodes[arrayId] as { children: string[] }).children[1]
          return () => h(Holder, { nodeId: secondItem })
        },
      }),
    )
    await nextTick()
    expect(field.value.value).toBe('bread')

    form.dispatch({ type: 'RemoveItem', containerId: arrayId as never, index: 1 })
    await settle()

    form.dispatch({ type: 'InsertItem', containerId: arrayId as never, index: 1, value: 'eggs' })
    await settle()

    expect(field.value.value, 'the field should read the new bundle').toBe('eggs')

    field.onChange('cheese')
    await settle()
    expect(form.data.value).toEqual({ items: ['milk', 'cheese'] })

    wrapper.unmount()
  })
})

describe('the runtime is owned by the component that made it', () => {
  it('destroys the runtime when the owner unmounts', async () => {
    const ex = example('basics-string')
    const port = await createJsonSchemaAdapter(ex.schema, {})
    const destroy = vi.fn()

    const wrapper = mount(
      defineComponent({
        setup() {
          const form = useForm(port, { initialData: ex.initialData })
          const original = form.runtime.destroy.bind(form.runtime)
          form.runtime.destroy = () => { destroy(); original() }
          provideFormRuntime(form.runtime)
          return () => h(FormRoot, { registry: createDefaultRegistry() })
        },
      }),
    )
    await nextTick()

    expect(destroy).not.toHaveBeenCalled()
    wrapper.unmount()
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('refuses to render outside a provided runtime', () => {
    // Vue reports the failed render as a warning as well as throwing.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const bare = defineComponent({
      setup: () => () => h(FormRoot, { registry: createDefaultRegistry() }),
    })
    expect(() => mount(bare)).toThrow(/provideFormRuntime/)
    warn.mockRestore()
  })
})

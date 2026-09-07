// A select and a checkbox have no native readonly attribute. They say so
// through ARIA, which describes rather than prevents, so the binding has to
// refuse the change as well or the DOM shows an edit the runtime rejected.
import { describe, it, expect } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { provideFormRuntime, useForm } from '../index.js'
import { FormRoot } from '../components/FormRoot.js'
import { createDefaultRegistry } from '../widgets/default-registry.js'

const schema = {
  type: 'object',
  properties: {
    code: { type: 'string', title: 'Code', readOnly: true },
    role: { type: 'string', title: 'Role', enum: ['dev', 'pm'], readOnly: true },
    agree: { type: 'boolean', title: 'Agree', readOnly: true },
    name: { type: 'string', title: 'Name' },
  },
}

async function mountForm() {
  const port = await createJsonSchemaAdapter(schema, {})
  let form!: ReturnType<typeof useForm>
  const wrapper = mount(
    defineComponent({
      setup() {
        form = useForm(port, {
          initialData: { code: 'abc', role: 'dev', agree: false, name: '' },
          validationDebounceMs: 0,
        })
        provideFormRuntime(form.runtime)
        return () => h(FormRoot, { registry: createDefaultRegistry() })
      },
    }),
  )
  await nextTick()
  return { wrapper, form: form! }
}

describe('read-only controls', () => {
  it('uses the native attribute where HTML has one and ARIA where it does not', async () => {
    const { wrapper } = await mountForm()
    const root = wrapper.element as HTMLElement
    const code = root.querySelector<HTMLInputElement>('input[type="text"]')!
    const select = root.querySelector<HTMLSelectElement>('select')!
    const checkbox = root.querySelector<HTMLInputElement>('input[type="checkbox"]')!

    expect(code.readOnly).toBe(true)
    expect(code.disabled).toBe(false)
    expect(select.getAttribute('aria-readonly')).toBe('true')
    expect(checkbox.getAttribute('aria-readonly')).toBe('true')
    expect(select.disabled).toBe(false)
    expect(checkbox.disabled).toBe(false)
  })

  it('refuses a select change and a checkbox toggle', async () => {
    const { wrapper, form } = await mountForm()
    const root = wrapper.element as HTMLElement
    const select = root.querySelector<HTMLSelectElement>('select')!
    const checkbox = root.querySelector<HTMLInputElement>('input[type="checkbox"]')!

    select.value = 'pm'
    select.dispatchEvent(new Event('change'))
    checkbox.checked = true
    checkbox.dispatchEvent(new Event('change'))
    await nextTick()

    const data = form.data.value as { role: string; agree: boolean }
    expect(data.role).toBe('dev')
    expect(data.agree).toBe(false)
  })

  it('leaves an editable neighbour alone', async () => {
    const { wrapper } = await mountForm()
    const root = wrapper.element as HTMLElement
    const editable = [...root.querySelectorAll<HTMLInputElement>('input[type="text"]')].at(-1)!
    expect(editable.readOnly).toBe(false)
  })
})

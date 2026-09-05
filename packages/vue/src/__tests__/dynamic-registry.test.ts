import { describe, it, expect } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { createRendererRegistry } from '@texaryn/core'
import type { RendererRegistry } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { example, settle } from './harness.js'
import {
  ArrayControl,
  FormRoot,
  ObjectLayout,
  provideFormRuntime,
  useFieldWidget,
  useForm,
  type WidgetComponent,
} from '../index.js'
import type { FieldNode, UINode } from '@texaryn/core'

// Two registries that differ only in the element they render, so a test can
// tell which one a mounted tree is actually resolving through.
function markedRegistry(mark: string): RendererRegistry<WidgetComponent> {
  const registry = createRendererRegistry<WidgetComponent>()

  const Widget = defineComponent({
    props: { node: { type: Object as () => UINode, required: true } },
    setup(props) {
      const field = useFieldWidget(() => props.node as FieldNode)
      return () =>
        h('input', {
          'data-registry': mark,
          value: field.display.value,
          onInput: (event: Event) => field.setRaw((event.target as HTMLInputElement).value),
        })
    },
  })

  registry.register({ test: (node) => node.type === 'field', rank: 1 }, Widget)
  // Containers use the real layout, so the test is about which field widget
  // resolves rather than about a stub that renders no children.
  registry.register(
    { test: (node) => node.type === 'container' && node.containerType === 'object', rank: 1 },
    ObjectLayout,
  )
  registry.register(
    { test: (node) => node.type === 'container' && node.containerType === 'array', rank: 1 },
    ArrayControl,
  )
  return registry
}

describe('the rendered tree follows a changed registry', () => {
  // The playground switches renderer by swapping this prop and deliberately
  // does not remount the form, because the runtime belongs to the example
  // rather than to the presentation over it. A registry provided once would
  // leave the tree rendering through the renderer the user just left.
  it('re-resolves widgets without remounting the form', async () => {
    const ex = example('basics-string')
    const port = await createJsonSchemaAdapter(ex.schema, {})
    const registry = ref(markedRegistry('a'))

    let runtime!: ReturnType<typeof useForm>
    const wrapper = mount(
      defineComponent({
        setup() {
          runtime = useForm(port, { initialData: ex.initialData, validationDebounceMs: 0 })
          provideFormRuntime(runtime.runtime)
          return () => h(FormRoot, { registry: registry.value })
        },
      }),
    )
    await nextTick()

    const input = wrapper.find('input').element as HTMLInputElement
    expect(input.getAttribute('data-registry')).toBe('a')

    input.value = 'Ada'
    input.dispatchEvent(new Event('input'))
    await settle()
    expect(runtime.data.value).toMatchObject({ name: 'Ada' })

    registry.value = markedRegistry('b')
    await nextTick()

    expect(
      (wrapper.find('input').element as HTMLInputElement).getAttribute('data-registry'),
      'the tree should resolve through the new registry',
    ).toBe('b')

    expect(
      runtime.data.value,
      'switching presentation must not disturb the data',
    ).toMatchObject({ name: 'Ada' })
    expect(
      (wrapper.find('input').element as HTMLInputElement).value,
      'the new widget should show the value that was already there',
    ).toBe('Ada')

    wrapper.unmount()
  })

  it('accepts a getter so a caller can own where the registry comes from', async () => {
    const ex = example('basics-string')
    const port = await createJsonSchemaAdapter(ex.schema, {})
    const selected = ref('a')

    const wrapper = mount(
      defineComponent({
        setup() {
          const form = useForm(port, { initialData: ex.initialData })
          provideFormRuntime(form.runtime)
          const registries = { a: markedRegistry('a'), b: markedRegistry('b') }
          return () =>
            h(FormRoot, { registry: registries[selected.value as 'a' | 'b'] })
        },
      }),
    )
    await nextTick()
    expect(wrapper.find('input').attributes('data-registry')).toBe('a')

    selected.value = 'b'
    await nextTick()
    expect(wrapper.find('input').attributes('data-registry')).toBe('b')

    wrapper.unmount()
  })
})

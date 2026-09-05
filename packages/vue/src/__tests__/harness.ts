import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { getExample } from '@texaryn/examples'
import type { TexarynExample } from '@texaryn/examples'
import type { FormRuntimeOptions } from '@texaryn/core'
import { provideFormRuntime, useForm } from '../index.js'
import { FormRoot } from '../components/FormRoot.js'
import { createDefaultRegistry } from '../widgets/default-registry.js'

export function example(id: string): TexarynExample {
  const found = getExample(id)
  if (!found) throw new Error(`no example ${id}`)
  return found
}

/**
 * Mounts a catalog example through the whole binding, the way a consumer
 * would. Assertions read the DOM rather than the composables, because the
 * questions this package has to answer are about what a user sees and what
 * ends up in the data.
 */
export async function mountExample(id: string, options: FormRuntimeOptions = {}) {
  const ex = example(id)
  const port = await createJsonSchemaAdapter(ex.schema, {})

  let form!: ReturnType<typeof useForm>
  const wrapper = mount(
    defineComponent({
      setup() {
        form = useForm(port, {
          initialData: ex.initialData,
          hints: ex.hints,
          // Every debounce here would be a real timer, and a test that sleeps
          // through one is a flake waiting for a slow machine.
          validationDebounceMs: 0,
          ...options,
        })
        provideFormRuntime(form.runtime)
        return () => h(FormRoot, { registry: createDefaultRegistry() })
      },
    }),
  )

  await nextTick()
  return { wrapper, form: form!, example: ex }
}

/** Vue batches renders to a microtask, and the runtime's validation lands on
 * a macrotask, so a settle has to cover both. */
export async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

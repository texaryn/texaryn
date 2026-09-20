import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { createFormRuntime, englishMessages } from '@texaryn/core'
import type { FormMessages, FormRuntime } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { provideFormRuntime } from '../context.js'
import { FormRoot } from '../components/FormRoot.js'
import { createDefaultRegistry } from '../widgets/default-registry.js'

const schema = {
  type: 'object',
  properties: {
    tags: { type: 'array', title: 'Tags', items: { type: 'string', title: 'Tag' } },
    name: { type: 'string', title: 'Name' },
  },
  required: ['name'],
}

const french: FormMessages = {
  addItem: () => ({ label: 'Ajouter', accessibleName: 'Ajouter un élément' }),
  removeItem: ({ position }) => ({ label: 'Retirer', accessibleName: `Retirer élément ${position}` }),
  moveItemUp: ({ position }) => ({ label: 'Monter', accessibleName: `Monter élément ${position}` }),
  requiredIndicator: () => ({ text: '(obligatoire)', placement: 'before' }),
}

let runtime: FormRuntime | undefined

afterEach(() => {
  runtime?.destroy()
  runtime = undefined
  document.body.replaceChildren()
})

async function mountWith(messages: ReturnType<typeof ref<FormMessages | undefined>>) {
  runtime = createFormRuntime(await createJsonSchemaAdapter(schema), {
    initialData: { tags: ['a', 'b'], name: '' },
    hints: { '/tags': { canReorder: true } },
  })
  const host = document.body.appendChild(document.createElement('div'))
  const wrapper = mount(
    defineComponent({
      setup() {
        provideFormRuntime(runtime!, { messages })
        return () => h(FormRoot, { registry: createDefaultRegistry() })
      },
    }),
    { attachTo: host },
  )
  await nextTick()
  return { wrapper, host }
}

describe('messages in Vue', () => {
  it('renders both surfaces of every control and the marker from the provided set', async () => {
    const { host } = await mountWith(ref(french))
    const remove = host.querySelector<HTMLButtonElement>('button[aria-label="Retirer élément 1"]')
    expect(remove).not.toBeNull()
    expect(remove!.textContent).toBe('Retirer')

    const moveUp = host.querySelector<HTMLButtonElement>('button[aria-label="Monter élément 2"]')
    expect(moveUp).not.toBeNull()
    expect(moveUp!.textContent).toBe('Monter')

    const add = host.querySelector<HTMLButtonElement>('button[aria-label="Ajouter un élément"]')
    expect(add).not.toBeNull()
    expect(add!.textContent).toBe('Ajouter')

    const label = [...host.querySelectorAll('label')].find((l) => l.textContent?.includes('Name'))!
    expect(label.textContent).toBe('(obligatoire) Name')
    const marker = label.querySelector('span[aria-hidden="true"]')
    expect(marker).not.toBeNull()
    expect(marker!.getAttribute('aria-hidden')).toBe('true')
    const withoutMarker = [...label.childNodes]
      .filter((n) => !(n instanceof HTMLElement && n.getAttribute('aria-hidden') === 'true'))
      .map((n) => n.textContent)
      .join('')
    expect(withoutMarker).toBe('Name')
  })

  it('follows a change to the ref without remounting the controls', async () => {
    const messages = ref<FormMessages | undefined>(englishMessages)
    const { host } = await mountWith(messages)
    const input = host.querySelector('input')!
    input.focus()
    const remove = host.querySelector<HTMLButtonElement>('button[aria-label="Remove Tag 1 from Tags"]')
    expect(remove).not.toBeNull()

    messages.value = french
    await nextTick()

    const removeAfter = host.querySelector<HTMLButtonElement>('button[aria-label="Retirer élément 1"]')
    expect(removeAfter).toBe(remove)
    expect(removeAfter!.textContent).toBe('Retirer')
    expect(document.activeElement).toBe(input)
  })

  it('renders English when nothing is provided', async () => {
    const { host } = await mountWith(ref(undefined))
    const add = host.querySelector<HTMLButtonElement>('button[aria-label="Add item to Tags"]')
    expect(add).not.toBeNull()
    expect(add!.textContent).toBe('Add')
  })
})

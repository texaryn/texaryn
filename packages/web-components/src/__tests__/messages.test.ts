import { afterEach, describe, expect, it } from 'vitest'
import { createFormRuntime, englishMessages } from '@texaryn/core'
import type { FormMessages, FormRuntime } from '@texaryn/core'
import { createDefaultRegistry, defineTexarynForm, mountForm } from '../index.js'
import type { TexarynFormElement } from '../index.js'
import { adapterFor, flush } from './harness.js'

defineTexarynForm()
const registry = createDefaultRegistry()

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

async function makeRuntime(): Promise<FormRuntime> {
  runtime = createFormRuntime(await adapterFor(schema), {
    initialData: { tags: ['a', 'b'], name: '' },
    hints: { '/tags': { canReorder: true } },
    validationDebounceMs: 0,
  })
  return runtime
}

describe('messages through mountForm', () => {
  it('renders both surfaces of every control and the marker from the given set', async () => {
    const container = document.body.appendChild(document.createElement('div'))
    mountForm(container, await makeRuntime(), { registry, idPrefix: 'f', messages: french })

    const remove = container.querySelector<HTMLButtonElement>('button[aria-label="Retirer élément 1"]')
    expect(remove).not.toBeNull()
    expect(remove!.textContent).toBe('Retirer')

    const up = container.querySelector<HTMLButtonElement>('button[aria-label="Monter élément 2"]')
    expect(up).not.toBeNull()
    expect(up!.textContent).toBe('Monter')

    const add = container.querySelector<HTMLButtonElement>('button[aria-label="Ajouter un élément"]')
    expect(add).not.toBeNull()
    expect(add!.textContent).toBe('Ajouter')

    const label = [...container.querySelectorAll('label')].find((l) => l.textContent?.includes('Name'))!
    expect(label.textContent).toBe('(obligatoire) Name')
    const marker = label.querySelector('span')!
    expect(marker.getAttribute('aria-hidden')).toBe('true')
    const withoutMarker = [...label.childNodes]
      .filter((n) => !(n instanceof HTMLElement && n.getAttribute('aria-hidden') === 'true'))
      .map((n) => n.textContent)
      .join('')
    expect(withoutMarker).toBe('Name')
  })

  it('switches in place through setMessages, keeping the controls and the focus', async () => {
    const container = document.body.appendChild(document.createElement('div'))
    const mount = mountForm(container, await makeRuntime(), { registry, idPrefix: 'f' })
    const input = container.querySelector('input')!
    input.focus()
    const remove = container.querySelector<HTMLButtonElement>('button[aria-label="Remove Tag 1 from Tags"]')
    expect(remove).not.toBeNull()

    mount.setMessages(french)

    expect(container.querySelector<HTMLButtonElement>('button[aria-label="Retirer élément 1"]')).toBe(remove)
    expect(remove!.textContent).toBe('Retirer')
    expect(document.activeElement).toBe(input)

    mount.setMessages(englishMessages)
    expect(remove!.textContent).toBe('Remove')
  })
})

describe('messages on <texaryn-form>', () => {
  it('reads the property before connection and follows it after', async () => {
    const el = document.createElement('texaryn-form') as TexarynFormElement
    el.registry = registry
    el.messages = french
    el.runtime = await makeRuntime()
    document.body.append(el)
    await flush()

    const add = el.querySelector<HTMLButtonElement>('button[aria-label="Ajouter un élément"]')
    expect(add).not.toBeNull()
    expect(add!.textContent).toBe('Ajouter')

    el.messages = englishMessages
    const addEn = el.querySelector<HTMLButtonElement>('button[aria-label="Add item to Tags"]')
    expect(addEn).not.toBeNull()
    expect(addEn!.textContent).toBe('Add')
    expect(addEn).toBe(add)
    expect(el.messages).toBe(englishMessages)
  })
})

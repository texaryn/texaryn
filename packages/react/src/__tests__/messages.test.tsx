import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, within } from '@testing-library/react'
import React from 'react'
import { createFormRuntime, englishMessages } from '@texaryn/core'
import type { FormMessages } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { FormProvider } from '../context.js'
import { useFormMessages } from '../messages.js'
import { FormRoot } from '../components/FormRoot.js'
import { createDefaultRegistry } from '../widgets/index.js'

afterEach(() => {
  cleanup()
})

const schema = { type: 'object', properties: { name: { type: 'string', title: 'Name' } } }

const french: FormMessages = {
  addItem: () => ({ label: 'Ajouter', accessibleName: 'Ajouter un élément' }),
  removeItem: ({ position }) => ({ label: 'Retirer', accessibleName: `Retirer élément ${position}` }),
  moveItemUp: ({ position }) => ({ label: 'Monter', accessibleName: `Monter élément ${position}` }),
  requiredIndicator: () => ({ text: '(obligatoire)', placement: 'before' }),
  errorSummaryHeading: ({ count }) => (count === 1 ? 'Il y a un problème' : `Il y a ${count} problèmes`),
  errorSummaryDetail: ({ messages }) => ` : ${messages.join(', ')}`,
}

function Probe({ onRead }: { onRead: (messages: FormMessages) => void }) {
  onRead(useFormMessages())
  return null
}

describe('useFormMessages', () => {
  it('returns the English set when no provider is above it', () => {
    let seen: FormMessages | undefined
    render(<Probe onRead={(m) => (seen = m)} />)
    expect(seen).toBe(englishMessages)
  })

  it('returns the set FormProvider was given, and follows a change to it', async () => {
    const runtime = createFormRuntime(await createJsonSchemaAdapter(schema), { initialData: {} })
    let seen: FormMessages | undefined
    const view = render(
      <FormProvider value={runtime} messages={french}>
        <Probe onRead={(m) => (seen = m)} />
      </FormProvider>,
    )
    expect(seen).toBe(french)

    view.rerender(
      <FormProvider value={runtime}>
        <Probe onRead={(m) => (seen = m)} />
      </FormProvider>,
    )
    expect(seen).toBe(englishMessages)
    runtime.destroy()
  })

  it('renders every built-in word, both surfaces of each control, from the configured set', async () => {
    const listSchema = {
      type: 'object',
      properties: {
        tags: { type: 'array', title: 'Tags', items: { type: 'string', title: 'Tag' } },
        name: { type: 'string', title: 'Name' },
      },
      required: ['name'],
    }
    const runtime = createFormRuntime(await createJsonSchemaAdapter(listSchema), {
      initialData: { tags: ['a'], name: '' },
    })
    const registry = createDefaultRegistry()
    const view = render(
      <FormProvider value={runtime} messages={french}>
        <FormRoot registry={registry} />
      </FormProvider>,
    )
    const q = within(view.container)

    const remove = q.getByRole('button', { name: 'Retirer élément 1' })
    expect(remove.textContent).toBe('Retirer')
    const add = q.getByRole('button', { name: 'Ajouter un élément' })
    expect(add.textContent).toBe('Ajouter')

    const name = q.getByRole('textbox', { name: 'Name' })
    const label = view.container.querySelector(`label[for="${name.id}"]`)!
    expect(label.textContent).toBe('(obligatoire) Name')

    view.rerender(
      <FormProvider value={runtime}>
        <FormRoot registry={registry} />
      </FormProvider>,
    )
    expect(q.getByRole('button', { name: 'Remove Tag 1 from Tags' }).textContent).toBe('Remove')
    expect(label.textContent).toBe('Name (required)')
    runtime.destroy()
  })
})

import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import React from 'react'
import { createFormRuntime, englishMessages } from '@texaryn/core'
import type { FormMessages } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { FormProvider } from '../context.js'
import { useFormMessages } from '../messages.js'

afterEach(() => {
  cleanup()
})

const schema = { type: 'object', properties: { name: { type: 'string', title: 'Name' } } }

const french: FormMessages = {
  addItem: () => ({ label: 'Ajouter', accessibleName: 'Ajouter un élément' }),
  removeItem: ({ position }) => ({ label: 'Retirer', accessibleName: `Retirer élément ${position}` }),
  moveItemUp: ({ position }) => ({ label: 'Monter', accessibleName: `Monter élément ${position}` }),
  requiredIndicator: () => ({ text: '(obligatoire)', placement: 'before' }),
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
})

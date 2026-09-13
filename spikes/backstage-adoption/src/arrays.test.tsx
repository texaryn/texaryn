import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { render, cleanup, fireEvent, act } from '@testing-library/react'
import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import type { RJSFSchema } from '@rjsf/utils'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { TexarynStepForm } from './candidate/TexarynStepForm.js'

/**
 * The array acceptance criterion: add, remove and reorder on the kitchen
 * sink's array of objects.
 *
 * Compared as controls rather than as commands, because the control a person
 * can reach is the observable thing. `@texaryn/core` exports a `MoveItem`
 * command and an `ArrayHints.canReorder` flag, and `@texaryn/react` exports
 * `moveUpActionName`, so reordering exists below the binding. What decides
 * whether a template's array is reorderable is whether the rendered form
 * offers it.
 */
const contactsStep = {
  title: 'Nested objects and arrays',
  properties: {
    contacts: {
      title: 'Contacts',
      type: 'array',
      items: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { title: 'Name', type: 'string' },
          role: { title: 'Role', type: 'string', enum: ['PM', 'Engineer', 'Designer'] },
          primary: { title: 'Primary contact', type: 'boolean' },
        },
      },
    },
  },
}

const twoContacts = {
  contacts: [
    { name: 'Ada', role: 'Engineer', primary: true },
    { name: 'Grace', role: 'PM', primary: false },
  ],
}

const buttons = (container: HTMLElement) => Array.from(container.querySelectorAll('button'))

const accessibleName = (button: HTMLButtonElement) =>
  (button.getAttribute('aria-label') ?? button.textContent ?? '').trim()

async function renderTexaryn(data: unknown) {
  const port = await createJsonSchemaAdapter(contactsStep, {
    defaultDialect: 'draft-07',
  })
  return render(createElement(TexarynStepForm, { port, initialData: data }))
}

describe('array controls', () => {
  it('RJSF renders reorder controls, and gives none of them a name', () => {
    const { container } = render(
      createElement(Form, {
        schema: contactsStep as RJSFSchema,
        validator,
        formData: twoContacts,
      }),
    )

    const classes = buttons(container).map((button) => button.className)
    expect(classes.filter((c) => c.includes('array-item-move-up'))).toHaveLength(2)
    expect(classes.filter((c) => c.includes('array-item-move-down'))).toHaveLength(2)
    expect(classes.filter((c) => c.includes('array-item-remove'))).toHaveLength(2)
    expect(classes.filter((c) => c.includes('btn-add'))).toHaveLength(1)

    // Every one of those seven is an icon with no text and no `aria-label`, so
    // the only thing distinguishing them is a class name. Recorded because it
    // is the reference implementation's weakness rather than Texaryn's, and
    // because it is why this test matches on classes at all.
    const named = buttons(container).filter((button) => accessibleName(button) !== '')
    expect(named.map(accessibleName)).toEqual(['Submit'])

    cleanup()
  })

  it('Texaryn names every control it renders, and renders no reorder control', async () => {
    const { container } = await renderTexaryn(twoContacts)
    const names = buttons(container).map(accessibleName)

    expect(names).toEqual([
      'Remove item 1 from Contacts',
      'Remove item 2 from Contacts',
      'Add item to Contacts',
    ])
    // The finding, as the absence it is: two rows, and nothing that moves
    // either of them. `canReorder` and `MoveItem` are reachable from core, so
    // this is a gap in `@texaryn/react-mui` rather than in the runtime.
    expect(names.filter((name) => /^move /i.test(name))).toEqual([])

    cleanup()
  })

  it('add and remove both work through the rendered controls', async () => {
    const { container } = await renderTexaryn(twoContacts)
    const pointers = () =>
      Array.from(container.querySelectorAll('input'))
        .map((input) => input.name)
        .filter((name) => name.endsWith('/name'))

    expect(pointers()).toEqual(['/contacts/0/name', '/contacts/1/name'])

    const named = (name: string) =>
      buttons(container).find((button) => accessibleName(button) === name)!

    await act(async () => {
      fireEvent.click(named('Add item to Contacts'))
    })
    expect(pointers()).toEqual(['/contacts/0/name', '/contacts/1/name', '/contacts/2/name'])

    await act(async () => {
      fireEvent.click(named('Remove item 1 from Contacts'))
    })
    expect(pointers()).toEqual(['/contacts/0/name', '/contacts/1/name'])

    // The row that was removed is the one that is gone, rather than the last.
    const values = Array.from(container.querySelectorAll('input'))
      .filter((input) => input.name.endsWith('/name'))
      .map((input) => input.value)
    expect(values).toEqual(['Grace', ''])

    cleanup()
  })
})

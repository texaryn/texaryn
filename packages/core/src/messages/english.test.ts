import { describe, it, expect } from 'vitest'
import { englishMessages } from './english.js'
import type { FormMessages } from './types.js'

describe('englishMessages', () => {
  it('names the add control from the container, else the item template, else nothing', () => {
    expect(englishMessages.addItem({ itemTemplateTitle: 'Tag', containerTitle: 'Tags' })).toEqual({
      label: 'Add',
      accessibleName: 'Add item to Tags',
    })
    expect(englishMessages.addItem({ itemTemplateTitle: 'Tag' })).toEqual({
      label: 'Add',
      accessibleName: 'Add Tag',
    })
    expect(englishMessages.addItem({})).toEqual({ label: 'Add', accessibleName: 'Add item' })
  })

  it('names a remove control by position, and drops the container clause when there is none', () => {
    expect(
      englishMessages.removeItem({ position: 2, itemTitle: 'Tag', containerTitle: 'Tags' }),
    ).toEqual({ label: 'Remove', accessibleName: 'Remove Tag 2 from Tags' })
    expect(englishMessages.removeItem({ position: 2 })).toEqual({
      label: 'Remove',
      accessibleName: 'Remove item 2',
    })
  })

  it('names a move-up control the same way, with its own preposition', () => {
    expect(
      englishMessages.moveItemUp({ position: 1, itemTitle: 'Tag', containerTitle: 'Tags' }),
    ).toEqual({ label: 'Up', accessibleName: 'Move up Tag 1 in Tags' })
    expect(englishMessages.moveItemUp({ position: 1 })).toEqual({
      label: 'Up',
      accessibleName: 'Move up item 1',
    })
  })

  it('places the required marker after the label', () => {
    expect(englishMessages.requiredIndicator()).toEqual({ text: '(required)', placement: 'after' })
  })

  // Label in Name: a speech-input user says the word on the button, and the
  // accessible name has to contain it. "Up" sits inside "Move up", so the
  // comparison is case-insensitive.
  it('keeps every accessible name containing its visible label', () => {
    const contexts = [
      { position: 1 },
      { position: 3, itemTitle: 'Contact' },
      { position: 2, containerTitle: 'Contacts' },
      { position: 5, itemTitle: 'Contact', containerTitle: 'Contacts' },
    ]
    const actions: Array<(m: FormMessages) => { label: string; accessibleName: string }[]> = [
      (m) => contexts.map((c) => m.removeItem(c)),
      (m) => contexts.map((c) => m.moveItemUp(c)),
      (m) => [
        m.addItem({}),
        m.addItem({ itemTemplateTitle: 'Contact' }),
        m.addItem({ containerTitle: 'Contacts' }),
        m.addItem({ itemTemplateTitle: 'Contact', containerTitle: 'Contacts' }),
      ],
    ]
    for (const produce of actions) {
      for (const { label, accessibleName } of produce(englishMessages)) {
        expect(accessibleName.toLowerCase()).toContain(label.toLowerCase())
      }
    }
  })
})

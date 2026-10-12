import { describe, it, expect } from 'vitest'
import { englishMessages } from './english.js'
import type { FormMessages } from './types.js'

describe('englishMessages', () => {
  it('names recursion and budget expansion controls by boundary and position', () => {
    expect(englishMessages.expandBoundary!({
      boundary: 'recursion',
      containerTitle: 'Nodes',
      position: 2,
      count: 2,
    })).toEqual({ label: 'Expand', accessibleName: 'Expand recursive fields 2 in Nodes' })

    expect(englishMessages.expandBoundary!({
      boundary: 'budget',
      position: 1,
      count: 1,
    })).toEqual({ label: 'Show more fields', accessibleName: 'Show more fields' })

    expect(englishMessages.expandBoundary!({
      boundary: 'budget',
      containerTitle: 'Rows',
      position: 3,
      count: 2,
    })).toEqual({ label: 'Show more fields', accessibleName: 'Show more fields 3 in Rows' })
  })

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

  it('names a move-down control the same way, with its own preposition', () => {
    expect(
      englishMessages.moveItemDown({ position: 2, itemTitle: 'Tag', containerTitle: 'Tags' }),
    ).toEqual({ label: 'Down', accessibleName: 'Move down Tag 2 in Tags' })
    expect(englishMessages.moveItemDown({ position: 2 })).toEqual({
      label: 'Down',
      accessibleName: 'Move down item 2',
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
      (m) => contexts.map((c) => m.moveItemDown(c)),
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

  it('heads the summary by the number of items', () => {
    expect(englishMessages.errorSummaryHeading({ count: 1 })).toBe('There is a problem')
    expect(englishMessages.errorSummaryHeading({ count: 3 })).toBe('There are 3 problems')
  })

  it('writes the whole detail after a link, punctuation included', () => {
    expect(englishMessages.errorSummaryDetail({ messages: ['Required'] })).toBe(': Required')
    expect(englishMessages.errorSummaryDetail({ messages: ['Too short', 'Bad format'] })).toBe(': Too short, Bad format')
    expect(englishMessages.errorSummaryDetail({ messages: [] })).toBe(': ')
  })

  it('uses safe validation copy and ignores evaluator diagnostics', () => {
    expect(englishMessages.validationMessage({
      instancePointer: '/secret',
      keyword: 'required',
      message: 'secret value at /secret is missing',
      params: { missingProperty: 'secret' },
    })).toBe('This field is required.')
    expect(englishMessages.validationMessage({
      instancePointer: '/name',
      keyword: 'minLength',
      message: 'raw user content from evaluator',
      params: { limit: 3 },
    })).toBe('Enter at least 3 characters.')
    expect(englishMessages.validationMessage({
      instancePointer: '/name',
      keyword: 'futureKeyword',
      message: 'untrusted evaluator copy',
      params: { submittedValue: 'private' },
    })).toBe('This value is invalid.')
  })

  it('formats standard validation keywords from safe parameters', () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ['minLength', {}, 'This value is too short.'],
      ['maxLength', { limit: 4 }, 'Enter no more than 4 characters.'],
      ['minimum', {}, 'This value is below the minimum.'],
      ['exclusiveMinimum', { limit: 2 }, 'Enter a value greater than 2.'],
      ['maximum', { limit: 9 }, 'Enter a value of at most 9.'],
      ['exclusiveMaximum', {}, 'This value must be below the maximum.'],
      ['minItems', { limit: 2 }, 'Add at least 2 items.'],
      ['maxItems', {}, 'Remove some items.'],
      ['minProperties', {}, 'Add more fields.'],
      ['maxProperties', { limit: 3 }, 'Provide no more than 3 fields.'],
      ['format', { format: 'email' }, 'Enter a valid email address.'],
      ['format', { format: 'uri' }, 'Enter a valid URL.'],
      ['format', { format: 'url' }, 'Enter a valid URL.'],
      ['format', { format: 'date' }, 'Enter a valid date.'],
      ['format', { format: 'date-time' }, 'Enter a valid date and time.'],
      ['format', {}, 'Enter a value in the required format.'],
      ['pattern', {}, 'Enter a value in the required format.'],
      ['type', {}, 'Enter a value of the expected type.'],
      ['enum', {}, 'Choose an allowed value.'],
      ['const', {}, 'Choose an allowed value.'],
      ['uniqueItems', {}, 'Each item must be unique.'],
      ['dependentRequired', {}, 'Complete the related required fields.'],
      ['additionalProperties', {}, 'Remove unrecognized fields.'],
      ['oneOf', {}, 'Choose a value that matches an allowed option.'],
      ['anyOf', {}, 'Choose a value that matches an allowed option.'],
      ['not', {}, 'This value is invalid.'],
    ]

    for (const [keyword, params, expected] of cases) {
      expect(englishMessages.validationMessage({
        instancePointer: '/field',
        keyword,
        params,
      })).toBe(expected)
    }
  })

  it('uses constraint specific fallback copy for invalid numeric parameters', () => {
    for (const limit of [-1, Number.NaN, Number.POSITIVE_INFINITY, '3']) {
      expect(englishMessages.validationMessage({
        instancePointer: '/field',
        keyword: 'minLength',
        params: { limit },
      })).toBe('This value is too short.')
    }
  })
})

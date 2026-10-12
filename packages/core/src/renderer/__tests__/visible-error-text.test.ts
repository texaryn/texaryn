import { describe, expect, it } from 'vitest'
import { englishMessages } from '../../messages/english.js'
import type { FormMessages } from '../../messages/types.js'
import type { JsonPointer, NodeId, VisibleError } from '../../types.js'
import { visibleErrorLabel, visibleErrorMessages, visibleFieldLabel } from '../visible-error-text.js'

const base: VisibleError = {
  nodeId: 'node_2' as NodeId,
  fieldTitle: 'Name',
  pointer: '/name' as JsonPointer,
  errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }],
}

describe('visibleErrorLabel', () => {
  it('prefers the field title', () => {
    expect(visibleErrorLabel(base)).toBe('Name')
  })

  it('uses a readable pointer segment and a generic label without a pointer', () => {
    expect(visibleErrorLabel({ ...base, fieldTitle: undefined })).toBe('Name')
    expect(visibleErrorLabel({ ...base, fieldTitle: undefined, pointer: '/contact_name' as JsonPointer })).toBe('Contact name')
    expect(visibleErrorLabel({ ...base, fieldTitle: undefined, pointer: '/items/0/name' as JsonPointer })).toBe('Name')
    expect(visibleErrorLabel({ ...base, fieldTitle: undefined, pointer: '/items/0' as JsonPointer })).toBe('Item 1')
    expect(visibleErrorLabel({ ...base, fieldTitle: undefined, pointer: '/-_' as JsonPointer })).toBe('Field')
    expect(visibleErrorLabel({ ...base, fieldTitle: undefined, pointer: null })).toBe('Field')
  })

  it('uses localized fallback words for untitled fields and array items', () => {
    const french: FormMessages = {
      ...englishMessages,
      fieldLabel: ({ fieldName, itemPosition }) =>
        fieldName ?? (itemPosition === undefined ? 'Champ' : `Élément ${itemPosition}`),
    }

    expect(visibleFieldLabel(undefined, '/first_name', french)).toBe('First name')
    expect(visibleFieldLabel(undefined, '/items/0', french)).toBe('Élément 1')
    expect(visibleErrorLabel({ ...base, fieldTitle: undefined, pointer: null }, french)).toBe('Champ')
  })
})

describe('visibleErrorMessages', () => {
  it('uses safe localized copy instead of evaluator diagnostics', () => {
    const errors = [
      { instancePointer: '/name', keyword: 'required', message: 'Required', params: {} },
      { instancePointer: '/name', keyword: 'minLength', params: {} },
    ]
    expect(visibleErrorMessages({ ...base, errors })).toEqual([
      'This field is required.',
      'This value is too short.',
    ])
    expect(visibleErrorMessages({ ...base, errors }, {
      ...englishMessages,
      validationMessage: () => 'Translated',
    })).toEqual(['Translated', 'Translated'])
  })

  it('is empty for an entry with no errors', () => {
    expect(visibleErrorMessages({ ...base, errors: [] })).toEqual([])
  })
})

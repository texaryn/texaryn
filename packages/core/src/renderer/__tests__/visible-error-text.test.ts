import { describe, expect, it } from 'vitest'
import { englishMessages } from '../../messages/english.js'
import type { JsonPointer, NodeId, VisibleError } from '../../types.js'
import { visibleErrorLabel, visibleErrorMessages } from '../visible-error-text.js'

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

  it('falls back to the pointer, then the node id', () => {
    expect(visibleErrorLabel({ ...base, fieldTitle: undefined })).toBe('/name')
    expect(visibleErrorLabel({ ...base, fieldTitle: undefined, pointer: null })).toBe('node_2')
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

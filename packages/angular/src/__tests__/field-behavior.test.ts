import { describe, expect, it } from 'vitest'
import type { FieldNode, ValidationError } from '@texaryn/core'
import { coerce, displayValue, fieldKind } from '../../dist/use-field-widget.js'
import { fieldAria, fieldLabel } from '../../dist/field-props.js'

function node(overrides: Partial<FieldNode> = {}): FieldNode {
  return {
    id: 'name',
    type: 'field',
    fieldType: 'string',
    dataPointer: '/name',
    annotations: {},
    constraints: {},
    ...overrides,
  } as unknown as FieldNode
}

const error: ValidationError = {
  instancePointer: '/name',
  keyword: 'minLength',
  message: 'Enter a name',
  params: {},
}

describe('Angular field behavior', () => {
  it('selects a widget kind from enum and primitive schema types', () => {
    expect(fieldKind(node({ enumValues: [{ value: 'a' }] }))).toBe('enum')
    expect(fieldKind(node({ enumValues: [] }))).toBe('string')
    expect(fieldKind(node({ fieldType: 'boolean' }))).toBe('boolean')
    expect(fieldKind(node({ fieldType: 'number' }))).toBe('number')
    expect(fieldKind(node({ fieldType: 'integer' }))).toBe('number')
    expect(fieldKind(node({ fieldType: 'string' }))).toBe('string')
  })

  it('formats values and coerces raw input for each widget kind', () => {
    const enumNode = node({ enumValues: [{ value: 1 }, { value: 'one' }] })
    expect(displayValue('number', 3)).toBe(3)
    expect(displayValue('number', '3')).toBe('3')
    expect(displayValue('string', 'text')).toBe('text')
    expect(displayValue('string', false)).toBe('false')
    expect(displayValue('boolean', null)).toBe('')
    expect(displayValue('boolean', false)).toBe('false')
    expect(coerce('number', node(), '')).toBeUndefined()
    expect(coerce('number', node(), '12')).toBe(12)
    expect(coerce('enum', enumNode, '1')).toBe(1)
    expect(coerce('enum', enumNode, 'missing')).toBe('missing')
    expect(coerce('enum', node(), 'missing')).toBe('missing')
    expect(coerce('string', node(), 'text')).toBe('text')
    expect(displayValue('boolean', undefined)).toBe('')
  })

  it('builds readable labels from title and pointer', () => {
    expect(fieldLabel(node({ annotations: { title: 'Name' } }))).toBe('Name')
    expect(fieldLabel(node({ dataPointer: '/profile/name' }))).toBe('Name')
    expect(fieldLabel(node({ dataPointer: undefined }))).toBe('Field')
    expect(fieldLabel(node({ annotations: { title: undefined }, dataPointer: undefined }))).toBe('Field')
  })

  it('builds ARIA metadata for descriptions, visible errors, and read-only controls', () => {
    const field = node({
      readOnly: true,
      helpText: 'Use your public name',
      placeholder: 'Ada',
      constraints: { required: true },
    })
    expect(fieldAria(field, { disabled: false, showErrors: true, errors: [error] }, 'form'))
      .toEqual({
        id: 'form-name-input',
        name: '/name',
        disabled: false,
        readonly: true,
        'aria-required': true,
        'aria-invalid': true,
        'aria-describedby': 'form-name-description form-name-error',
        placeholder: 'Ada',
      })

    expect(fieldAria(field, { disabled: true, showErrors: false, errors: [error] }, 'form', false))
      .toMatchObject({
        disabled: true,
        'aria-readonly': true,
        'aria-required': true,
        'aria-invalid': undefined,
        'aria-describedby': 'form-name-description',
      })

    expect(fieldAria(node({ annotations: { description: 'Description' } }), {
      disabled: false,
      showErrors: true,
      errors: [],
    }, 'form')).toMatchObject({
      'aria-invalid': undefined,
      'aria-describedby': 'form-name-description',
      placeholder: undefined,
    })

    expect(fieldAria(node({ constraints: { required: false } }), {
      disabled: false,
      showErrors: false,
      errors: [],
    }, 'form')).toMatchObject({
      'aria-required': false,
      'aria-describedby': undefined,
    })

    expect(fieldAria(node({ dataPointer: '' }), {
      disabled: false,
      showErrors: false,
      errors: [],
    }, 'form').name).toBe('name')
  })
})

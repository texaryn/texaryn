// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { createElement } from 'react'
import { cleanup, render } from '@testing-library/react'
import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'
import type { RJSFSchema, UiSchema } from '@rjsf/utils'

afterEach(() => {
  cleanup()
})

function show(schema: RJSFSchema, uiSchema: UiSchema, formData?: unknown): HTMLElement {
  return render(createElement(Form, { schema, uiSchema, formData, validator })).container
}

describe('what RJSF 5.24.13 renders for the cells @texaryn/hints-rjsf reports', () => {
  it('labels the empty option of an enum select with ui:placeholder', () => {
    const view = show({ type: 'object', properties: { size: { type: 'string', enum: ['s', 'l'] } } }, { size: { 'ui:placeholder': 'Pick a size' } })
    expect(view.querySelector('select option[value=""]')?.textContent).toBe('Pick a size')
  })

  it('shows ui:description and ui:help on an object and on an array', () => {
    const view = show(
      {
        type: 'object',
        properties: {
          place: { type: 'object', properties: { city: { type: 'string' } } },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
      {
        place: { 'ui:description': 'Where you live', 'ui:help': 'Postal address' },
        tags: { 'ui:description': 'Free words', 'ui:help': 'One per row' },
      },
    )
    for (const text of ['Where you live', 'Postal address', 'Free words', 'One per row']) expect(view.textContent).toContain(text)
  })

  it('gives a textarea the rows of ui:options', () => {
    const view = show({ type: 'object', properties: { bio: { type: 'string' } } }, { bio: { 'ui:widget': 'textarea', 'ui:options': { rows: 7 } } })
    expect(view.querySelector('textarea')?.getAttribute('rows')).toBe('7')
  })

  it('renders ui:widget hidden as a hidden input', () => {
    const view = show({ type: 'object', properties: { token: { type: 'string' } } }, { token: { 'ui:widget': 'hidden' } }, { token: 'abc' })
    expect(view.querySelector('input[type="hidden"]')).not.toBeNull()
    expect(view.querySelector('input[type="text"]')).toBeNull()
  })

  it('renders a property twice when ui:order names it twice', () => {
    const view = show({ type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } } }, { 'ui:order': ['a', 'a', '*'] })
    expect(view.querySelectorAll('#root_a')).toHaveLength(2)
  })

  it('renders a configuration error instead of the object when ui:order misses a property and has no *', () => {
    const view = show({ type: 'object', properties: { a: { type: 'string' }, b: { type: 'string' } } }, { 'ui:order': ['a'] })
    expect(view.textContent).toContain('uiSchema order list does not contain')
    expect(view.querySelector('#root_a')).toBeNull()
  })

  it('switches a oneOf option uiSchema with the data', () => {
    const schema: RJSFSchema = {
      type: 'object',
      oneOf: [
        { title: 'A', properties: { kind: { const: 'a' }, x: { type: 'string' } }, required: ['kind'] },
        { title: 'B', properties: { kind: { const: 'b' }, x: { type: 'string' } }, required: ['kind'] },
      ],
    }
    const uiSchema: UiSchema = { oneOf: [{ x: { 'ui:placeholder': 'from A' } }, { x: { 'ui:placeholder': 'from B' } }] }
    expect(show(schema, uiSchema, { kind: 'a' }).querySelector('#root_x')?.getAttribute('placeholder')).toBe('from A')
    cleanup()
    expect(show(schema, uiSchema, { kind: 'b' }).querySelector('#root_x')?.getAttribute('placeholder')).toBe('from B')
  })

  it('shows reorder controls on an array by default', () => {
    const view = show({ type: 'object', properties: { tags: { type: 'array', items: { type: 'string' } } } }, {}, { tags: ['one', 'two'] })
    expect(view.querySelectorAll('button[title="Move down"]').length).toBeGreaterThan(0)
  })
})

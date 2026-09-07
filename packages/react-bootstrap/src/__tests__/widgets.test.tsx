import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import type { SchemaEvaluationPort, SchemaProjection, NodeProjection, ChildProjection, JsonPointer, UIHints, ValidationResult } from '@texaryn/core'
import { FormProvider, FormRoot, useForm } from '@texaryn/react'
import { createBootstrapRegistry } from '../index.js'

function toPointer(s: string): JsonPointer { return s as JsonPointer }

function makeProjection(entries: Array<[string, Partial<NodeProjection> & { children?: ChildProjection[] }]>): SchemaProjection {
  const nodes = new Map<JsonPointer, NodeProjection>()
  for (const [pointer, partial] of entries) {
    nodes.set(toPointer(pointer), {
      type: partial.type ?? 'string',
      constraints: partial.constraints ?? {},
      active: partial.active ?? true,
      annotations: partial.annotations ?? {},
      children: partial.children,
      enumValues: partial.enumValues,
      format: partial.format,
    })
  }
  return { nodes }
}

function renderForm(proj: SchemaProjection, data: unknown, hints?: UIHints, validate?: () => ValidationResult) {
  const port: SchemaEvaluationPort = { project: () => proj, validate: validate ?? (() => ({ valid: true, errors: [] })) }
  function TestForm() {
    const form = useForm(port, { initialData: data, hints })
    return (
      <FormProvider value={form.runtime}>
        <FormRoot registry={createBootstrapRegistry()} />
      </FormProvider>
    )
  }
  return render(<TestForm />)
}

const fields = makeProjection([
  ['', { type: 'object', children: [
    { pointer: toPointer('/name'), key: 'name', required: true },
    { pointer: toPointer('/age'), key: 'age', required: false },
    { pointer: toPointer('/bio'), key: 'bio', required: false },
    { pointer: toPointer('/role'), key: 'role', required: false },
    { pointer: toPointer('/agree'), key: 'agree', required: false },
  ] }],
  ['/name', { type: 'string', annotations: { title: 'Name', description: 'Legal name' } }],
  ['/age', { type: 'integer', annotations: { title: 'Age' } }],
  ['/bio', { type: 'string', annotations: { title: 'Bio' } }],
  ['/role', { type: 'string', enumValues: [{ value: 'dev' }, { value: 'pm' }], annotations: { title: 'Role' } }],
  ['/agree', { type: 'boolean', annotations: { title: 'Agree' } }],
])

afterEach(() => { cleanup() })

describe('Bootstrap field widgets', () => {
  it('renders Bootstrap classes for each control kind', () => {
    renderForm(fields, { name: 'A', age: 1, bio: '', role: 'dev', agree: false }, { '/bio': { widget: 'textarea' } })
    const name = screen.getByLabelText(/^Name/)
    expect(name.className).toContain('form-control')
    expect(name.closest('.mb-3')).not.toBeNull()
    expect(screen.getByText('Name').className).toContain('form-label')
    expect(screen.getByText('Legal name').className).toContain('form-text')
    expect(screen.getByLabelText(/^Age/).className).toContain('form-control')
    expect((screen.getByLabelText(/^Age/) as HTMLInputElement).type).toBe('number')
    expect(screen.getByLabelText(/^Bio/).tagName).toBe('TEXTAREA')
    expect(screen.getByLabelText(/^Bio/).className).toContain('form-control')
    expect(screen.getByLabelText(/^Role/).className).toContain('form-select')
    const agree = screen.getByLabelText(/^Agree/)
    expect(agree.className).toContain('form-check-input')
    expect(agree.closest('.form-check')).not.toBeNull()
    expect(screen.getByText('Agree').className).toContain('form-check-label')
  })

  it('applies is-invalid and invalid-feedback only once the field is touched and invalid', async () => {
    const invalid: ValidationResult = { valid: false, errors: [{ instancePointer: '/name', keyword: 'minLength', message: 'Too short', params: {} }] }
    renderForm(fields, { name: '' }, { '/name': { validationTrigger: 'blur' } }, () => invalid)
    const name = screen.getByLabelText(/^Name/)
    expect(name.className).not.toContain('is-invalid')
    expect(screen.queryByText('Too short')).toBeNull()
    fireEvent.blur(name)
    await waitFor(() => { expect(name.className).toContain('is-invalid') })
    const feedback = screen.getByText('Too short')
    expect(feedback.className).toContain('invalid-feedback')
    expect(feedback.className).toContain('d-block')
    const region = feedback.closest('[aria-live="polite"]')
    expect(region).not.toBeNull()
    expect(name.getAttribute('aria-describedby')).toContain(region!.id)
  })

  it('does not set the HTML required attribute, only aria-required', () => {
    renderForm(fields, { name: '' })
    const name = screen.getByLabelText(/^Name/) as HTMLInputElement
    expect(name.required).toBe(false)
    expect(name.getAttribute('aria-required')).toBe('true')
  })
})

describe('Bootstrap containers', () => {
  it('renders object children and array items with Bootstrap buttons', () => {
    const proj = makeProjection([
      ['', { type: 'object', children: [{ pointer: toPointer('/tags'), key: 'tags', required: false }] }],
      ['/tags', { type: 'array', annotations: { title: 'Tags' }, children: [
        { pointer: toPointer('/tags/0'), key: '0', required: false },
      ] }],
      // The realistic shape: a schema gives every item the same title, so this
      // is 'Tag' rather than a per-row 'Tag 1' no real schema produces.
      ['/tags/0', { type: 'string', annotations: { title: 'Tag' } }],
    ])
    renderForm(proj, { tags: ['a'] })
    expect(screen.getByLabelText(/^Tag/)).toBeTruthy()
    // The accessible name now carries the row context, while the visible word
    // stays short; this test cares about the Bootstrap classes.
    const add = screen.getByRole('button', { name: 'Add item to Tags' })
    expect(add.className).toContain('btn-primary')
    const remove = screen.getByRole('button', { name: 'Remove Tag 1 from Tags' })
    expect(remove.className).toContain('btn-outline-danger')
    expect(remove.className).toContain('btn-sm')
    const itemWrapper = remove.closest('.mb-3')
    expect(itemWrapper).not.toBeNull()
    expect(itemWrapper!.className).toContain('mb-3')
  })
})

// Bootstrap spreads the props useFieldBinding builds, so this confirms the
// shared mapping arrives rather than re-testing the refusal itself.
describe('Bootstrap read-only controls', () => {
  const readOnlyFields = makeProjection([
    [
      '',
      {
        type: 'object',
        children: [
          { pointer: toPointer('/code'), key: 'code', required: false },
          { pointer: toPointer('/agree'), key: 'agree', required: false },
        ],
      },
    ],
    ['/code', { type: 'string', annotations: { title: 'Code', readOnly: true } }],
    ['/agree', { type: 'boolean', annotations: { title: 'Agree', readOnly: true } }],
  ])

  it('uses the native attribute for text and ARIA for a checkbox', () => {
    renderForm(readOnlyFields, { code: 'abc', agree: false })
    const code = screen.getByLabelText(/^Code/) as HTMLInputElement
    const agree = screen.getByLabelText(/^Agree/) as HTMLInputElement
    expect(code.readOnly).toBe(true)
    expect(code.disabled).toBe(false)
    expect(agree.getAttribute('aria-readonly')).toBe('true')
    expect(agree.disabled).toBe(false)
  })
})

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import type { SchemaEvaluationPort, SchemaProjection, NodeProjection, ChildProjection, JsonPointer, UIHints, ValidationResult } from '@texaryn/core'
import { FormContext, FormRoot, useForm } from '@texaryn/react'
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
      <FormContext.Provider value={form.runtime}>
        <FormRoot registry={createBootstrapRegistry()} />
      </FormContext.Provider>
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
    const name = screen.getByLabelText('Name')
    expect(name.className).toContain('form-control')
    expect(name.closest('.mb-3')).not.toBeNull()
    expect(screen.getByText('Name').className).toContain('form-label')
    expect(screen.getByText('Legal name').className).toContain('form-text')
    expect(screen.getByLabelText('Age').className).toContain('form-control')
    expect((screen.getByLabelText('Age') as HTMLInputElement).type).toBe('number')
    expect(screen.getByLabelText('Bio').tagName).toBe('TEXTAREA')
    expect(screen.getByLabelText('Bio').className).toContain('form-control')
    expect(screen.getByLabelText('Role').className).toContain('form-select')
    const agree = screen.getByLabelText('Agree')
    expect(agree.className).toContain('form-check-input')
    expect(agree.closest('.form-check')).not.toBeNull()
    expect(screen.getByText('Agree').className).toContain('form-check-label')
  })

  it('applies is-invalid and invalid-feedback only once the field is touched and invalid', async () => {
    const invalid: ValidationResult = { valid: false, errors: [{ instancePointer: '/name', keyword: 'minLength', message: 'Too short', params: {} }] }
    renderForm(fields, { name: '' }, { '/name': { validationTrigger: 'blur' } }, () => invalid)
    const name = screen.getByLabelText('Name')
    expect(name.className).not.toContain('is-invalid')
    expect(screen.queryByText('Too short')).toBeNull()
    fireEvent.blur(name)
    await waitFor(() => { expect(name.className).toContain('is-invalid') })
    const feedback = screen.getByText('Too short')
    expect(feedback.className).toContain('invalid-feedback')
    expect(feedback.closest('[role="alert"]')).not.toBeNull()
    expect(name.getAttribute('aria-describedby')).toContain(feedback.closest('[role="alert"]')!.id)
  })

  it('does not set the HTML required attribute, only aria-required', () => {
    renderForm(fields, { name: '' })
    const name = screen.getByLabelText('Name') as HTMLInputElement
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
      ['/tags/0', { type: 'string', annotations: { title: 'Tag 1' } }],
    ])
    renderForm(proj, { tags: ['a'] })
    expect(screen.getByLabelText('Tag 1')).toBeTruthy()
    const add = screen.getByRole('button', { name: 'Add' })
    expect(add.className).toContain('btn-primary')
    const remove = screen.getByRole('button', { name: 'Remove' })
    expect(remove.className).toContain('btn-outline-danger')
  })
})

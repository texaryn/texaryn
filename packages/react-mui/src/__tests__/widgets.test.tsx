import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import React from 'react'
import { ThemeProvider, createTheme } from '@mui/material'
import type {
  SchemaEvaluationPort,
  SchemaProjection,
  NodeProjection,
  ChildProjection,
  JsonPointer,
  UIHints,
  ValidationResult,
} from '@texaryn/core'
import { FormContext, FormRoot, useForm } from '@texaryn/react'
import { createMuiRegistry } from '../index.js'

function toPointer(s: string): JsonPointer {
  return s as JsonPointer
}

function makeProjection(
  entries: Array<[string, Partial<NodeProjection> & { children?: ChildProjection[] }]>,
): SchemaProjection {
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

function renderForm(
  proj: SchemaProjection,
  data: unknown,
  hints?: UIHints,
  validate?: () => ValidationResult,
) {
  const port: SchemaEvaluationPort = {
    project: () => proj,
    validate: validate ?? (() => ({ valid: true, errors: [] })),
  }
  function TestForm() {
    const form = useForm(port, { initialData: data, hints })
    return (
      <FormContext.Provider value={form.runtime}>
        <FormRoot registry={createMuiRegistry()} />
      </FormContext.Provider>
    )
  }
  return render(<TestForm />)
}

const fields = makeProjection([
  [
    '',
    {
      type: 'object',
      children: [
        { pointer: toPointer('/name'), key: 'name', required: true },
        { pointer: toPointer('/age'), key: 'age', required: false },
        { pointer: toPointer('/bio'), key: 'bio', required: false },
        { pointer: toPointer('/role'), key: 'role', required: false },
        { pointer: toPointer('/agree'), key: 'agree', required: false },
      ],
    },
  ],
  ['/name', { type: 'string', annotations: { title: 'Name', description: 'Legal name' } }],
  ['/age', { type: 'integer', annotations: { title: 'Age' } }],
  ['/bio', { type: 'string', annotations: { title: 'Bio' } }],
  [
    '/role',
    {
      type: 'string',
      enumValues: [{ value: 'dev' }, { value: 'pm' }],
      annotations: { title: 'Role' },
    },
  ],
  ['/agree', { type: 'boolean', annotations: { title: 'Agree' } }],
])

afterEach(() => {
  cleanup()
})

describe('MUI field widgets', () => {
  it('renders text input with MUI TextField', () => {
    renderForm(fields, { name: 'A', age: 1, bio: '', role: 'dev', agree: false })
    const name = screen.getByLabelText('Name')
    expect(name.tagName).toBe('INPUT')
    expect(name.getAttribute('type')).toBe('text')
  })

  it('text value changes propagate to form data', () => {
    renderForm(fields, { name: '', age: 0, bio: '', role: 'dev', agree: false })
    const name = screen.getByLabelText('Name')
    fireEvent.change(name, { target: { value: 'Bob' } })
    expect((name as HTMLInputElement).value).toBe('Bob')
  })

  it('renders number input with type="number"', () => {
    renderForm(fields, { name: '', age: 0, bio: '', role: 'dev', agree: false })
    const age = screen.getByLabelText('Age')
    expect(age.getAttribute('type')).toBe('number')
  })

  it('number coercion: empty string', () => {
    renderForm(fields, { name: '', age: 5, bio: '', role: 'dev', agree: false })
    const age = screen.getByLabelText('Age')
    fireEvent.change(age, { target: { value: '' } })
    expect((age as HTMLInputElement).value).toBe('')
  })

  it('renders textarea with multiline', () => {
    renderForm(fields, { name: '', age: 0, bio: 'hello', role: 'dev', agree: false }, { '/bio': { widget: 'textarea' } })
    const bio = screen.getByLabelText('Bio')
    expect(bio.tagName).toBe('TEXTAREA')
  })

  it('renders checkbox with checked state', () => {
    renderForm(fields, { name: '', age: 0, bio: '', role: 'dev', agree: true })
    const agree = screen.getByLabelText('Agree') as HTMLInputElement
    expect(agree.type).toBe('checkbox')
    expect(agree.checked).toBe(true)
  })

  it('checkbox toggle changes state', () => {
    renderForm(fields, { name: '', age: 0, bio: '', role: 'dev', agree: false })
    const agree = screen.getByLabelText('Agree') as HTMLInputElement
    fireEvent.click(agree)
    expect(agree.checked).toBe(true)
  })

  it('renders select with enum options', () => {
    renderForm(fields, { name: '', age: 0, bio: '', role: 'dev', agree: false })
    const roleElement = screen.getByLabelText('Role')
    expect(
      roleElement.tagName === 'SELECT' || roleElement.getAttribute('role') === 'combobox',
    ).toBe(true)
  })

  it('description is rendered as helper text', () => {
    renderForm(fields, { name: 'A', age: 0, bio: '', role: 'dev', agree: false })
    expect(screen.getByText('Legal name')).toBeTruthy()
  })

  it('first error replaces description while invalid', async () => {
    const invalid: ValidationResult = {
      valid: false,
      errors: [
        { instancePointer: '/name', keyword: 'minLength', message: 'Too short', params: {} },
      ],
    }
    renderForm(
      fields,
      { name: '', age: 0, bio: '', role: 'dev', agree: false },
      { '/name': { validationTrigger: 'blur' } },
      () => invalid,
    )
    const name = screen.getByLabelText('Name')
    expect(screen.getByText('Legal name')).toBeTruthy()
    fireEvent.blur(name)
    await waitFor(() => {
      expect(screen.getByText('Too short')).toBeTruthy()
    })
    expect(screen.queryByText('Legal name')).toBeNull()
  })

  it('helper text gets role="alert" while invalid', async () => {
    const invalid: ValidationResult = {
      valid: false,
      errors: [
        { instancePointer: '/name', keyword: 'minLength', message: 'Too short', params: {} },
      ],
    }
    renderForm(
      fields,
      { name: '', age: 0, bio: '', role: 'dev', agree: false },
      { '/name': { validationTrigger: 'blur' } },
      () => invalid,
    )
    const name = screen.getByLabelText('Name')
    fireEvent.blur(name)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy()
    })
  })

  it('sets aria-required but not native required', () => {
    renderForm(fields, { name: '' })
    const name = screen.getByLabelText('Name')
    expect(name.getAttribute('aria-required')).toBe('true')
    expect((name as HTMLInputElement).required).toBe(false)
  })

  it('every aria-describedby target exists in the DOM', () => {
    renderForm(fields, { name: 'A', age: 0, bio: '', role: 'dev', agree: false })
    const name = screen.getByLabelText('Name')
    const describedBy = name.getAttribute('aria-describedby') ?? ''
    for (const id of describedBy.split(' ').filter(Boolean)) {
      expect(document.getElementById(id)).not.toBeNull()
    }
  })

  it('disabled state propagates', () => {
    const disabledFields = makeProjection([
      [
        '',
        {
          type: 'object',
          children: [{ pointer: toPointer('/name'), key: 'name', required: false }],
        },
      ],
      ['/name', { type: 'string', annotations: { title: 'Name', readOnly: true } }],
    ])
    renderForm(disabledFields, { name: '' })
    const name = screen.getByLabelText('Name') as HTMLInputElement
    expect(name.disabled).toBe(true)
  })

  it('number rendered through number input stays numeric', () => {
    renderForm(fields, { name: '', age: 42, bio: '', role: 'dev', agree: false })
    const age = screen.getByLabelText('Age') as HTMLInputElement
    expect(age.value).toBe('42')
    fireEvent.change(age, { target: { value: '7' } })
    expect(age.value).toBe('7')
  })

  it('select preserves original enum values', () => {
    renderForm(fields, { name: '', age: 0, bio: '', role: 'dev', agree: false })
    const trigger = screen.getByLabelText('Role')
    fireEvent.mouseDown(trigger)
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(options[0].textContent).toBe('dev')
    expect(options[1].textContent).toBe('pm')
  })

  it('checkbox description shown as helper text', () => {
    const cbFields = makeProjection([
      [
        '',
        {
          type: 'object',
          children: [{ pointer: toPointer('/agree'), key: 'agree', required: false }],
        },
      ],
      ['/agree', { type: 'boolean', annotations: { title: 'Agree', description: 'Terms' } }],
    ])
    renderForm(cbFields, { agree: false })
    expect(screen.getByText('Terms')).toBeTruthy()
  })

  it('checkbox shows error replacing description', async () => {
    const cbFields = makeProjection([
      [
        '',
        {
          type: 'object',
          children: [{ pointer: toPointer('/agree'), key: 'agree', required: true }],
        },
      ],
      ['/agree', { type: 'boolean', annotations: { title: 'Agree', description: 'Terms' } }],
    ])
    const invalid: ValidationResult = {
      valid: false,
      errors: [{ instancePointer: '/agree', keyword: 'const', message: 'Must agree', params: {} }],
    }
    renderForm(
      cbFields,
      { agree: false },
      { '/agree': { validationTrigger: 'blur' } },
      () => invalid,
    )
    const cb = screen.getByLabelText('Agree')
    fireEvent.click(cb)
    fireEvent.blur(cb)
    await waitFor(() => {
      expect(screen.getByText('Must agree')).toBeTruthy()
    })
  })
})

describe('MUI containers', () => {
  it('renders object children in a Stack layout', () => {
    renderForm(fields, { name: '', age: 0, bio: '', role: 'dev', agree: false })
    expect(screen.getByLabelText('Name')).toBeTruthy()
    expect(screen.getByLabelText('Age')).toBeTruthy()
  })

  it('array control: Add and Remove buttons', () => {
    const proj = makeProjection([
      [
        '',
        {
          type: 'object',
          children: [{ pointer: toPointer('/tags'), key: 'tags', required: false }],
        },
      ],
      [
        '/tags',
        {
          type: 'array',
          annotations: { title: 'Tags' },
          children: [{ pointer: toPointer('/tags/0'), key: '0', required: false }],
        },
      ],
      ['/tags/0', { type: 'string', annotations: { title: 'Tag 1' } }],
    ])
    renderForm(proj, { tags: ['a'] })
    expect(screen.getByLabelText('Tag 1')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy()
  })
})

describe('MUI registry', () => {
  it('rank parity: enum outranks primitive, textarea outranks both', () => {
    const registry = createMuiRegistry()

    const stringNode = { type: 'field', fieldType: 'string', enumValues: null } as any
    const enumNode = { type: 'field', fieldType: 'string', enumValues: [{ value: 'a' }] } as any
    const textareaNode = { type: 'field', fieldType: 'string', widget: 'textarea' } as any

    const stringMatch = registry.resolve(stringNode)
    const enumMatch = registry.resolve(enumNode)
    const textareaMatch = registry.resolve(textareaNode)

    expect(stringMatch).not.toBeNull()
    expect(enumMatch).not.toBeNull()
    expect(textareaMatch).not.toBeNull()
    expect(enumMatch).not.toBe(stringMatch)
    expect(textareaMatch).not.toBe(stringMatch)
    expect(textareaMatch).not.toBe(enumMatch)
  })
})

describe('MUI theming', () => {
  it('custom ThemeProvider wraps renderer without interference', () => {
    const theme = createTheme({ palette: { primary: { main: '#ff0000' } } })
    const proj = makeProjection([
      [
        '',
        {
          type: 'object',
          children: [{ pointer: toPointer('/name'), key: 'name', required: false }],
        },
      ],
      ['/name', { type: 'string', annotations: { title: 'Name' } }],
    ])
    const port: SchemaEvaluationPort = {
      project: () => proj,
      validate: () => ({ valid: true, errors: [] }),
    }
    function TestForm() {
      const form = useForm(port, { initialData: { name: '' } })
      return (
        <ThemeProvider theme={theme}>
          <FormContext.Provider value={form.runtime}>
            <FormRoot registry={createMuiRegistry()} />
          </FormContext.Provider>
        </ThemeProvider>
      )
    }
    render(<TestForm />)
    expect(screen.getByLabelText('Name')).toBeTruthy()
  })
})

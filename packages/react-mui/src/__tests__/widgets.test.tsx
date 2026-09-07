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
import { FormProvider, FormRoot, useForm } from '@texaryn/react'
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
      <FormProvider value={form.runtime}>
        <FormRoot registry={createMuiRegistry()} />
      </FormProvider>
    )
  }
  return render(<TestForm />)
}

function renderFormWithData(
  proj: SchemaProjection,
  data: unknown,
  hints?: UIHints,
) {
  const dataRef = { current: data }
  const port: SchemaEvaluationPort = {
    project: () => proj,
    validate: () => ({ valid: true, errors: [] }),
  }
  function TestForm() {
    const form = useForm(port, { initialData: data, hints })
    dataRef.current = form.data
    return (
      <FormProvider value={form.runtime}>
        <FormRoot registry={createMuiRegistry()} />
      </FormProvider>
    )
  }
  const result = render(<TestForm />)
  return { ...result, getData: () => dataRef.current }
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

  // MUI renders no helper line for empty helperText, so the live region has to
  // be a stable child of that line rather than the line itself.
  it('keeps one live region in the helper line and fills it when invalid', async () => {
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
    const region = document.querySelector('[aria-live="polite"]')!
    expect(region.textContent).toBe('')

    fireEvent.blur(name)
    await waitFor(() => {
      expect(region.textContent).toBe('Too short')
    })
    expect(document.querySelector('[aria-live="polite"]')).toBe(region)
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })

  it('sets aria-required but not native required', () => {
    renderForm(fields, { name: '' })
    const name = screen.getByLabelText('Name')
    expect(name.getAttribute('aria-required')).toBe('true')
    expect((name as HTMLInputElement).required).toBe(false)
  })

  it('required select exposes aria-required on the combobox, not the hidden input', () => {
    const proj = makeProjection([
      [
        '',
        {
          type: 'object',
          children: [{ pointer: toPointer('/role'), key: 'role', required: true }],
        },
      ],
      [
        '/role',
        {
          type: 'string',
          enumValues: [{ value: 'dev' }, { value: 'pm' }],
          annotations: { title: 'Role' },
        },
      ],
    ])
    renderForm(proj, { role: 'dev' })

    const combobox = screen.getByLabelText('Role')
    expect(combobox.getAttribute('role')).toBe('combobox')
    expect(combobox.getAttribute('aria-required')).toBe('true')

    const hiddenInput = document.querySelector('input')
    expect(hiddenInput?.getAttribute('aria-hidden')).toBe('true')
    expect(hiddenInput?.required).toBe(false)
  })

  // The invalid state has to reach the combobox, which is the element a
  // screen reader interacts with. MUI derives it from the `error` prop, so no
  // slotProps override is involved, and it must stay that way.
  it('select exposes aria-invalid on the combobox once invalid', async () => {
    const proj = makeProjection([
      [
        '',
        {
          type: 'object',
          children: [{ pointer: toPointer('/role'), key: 'role', required: true }],
        },
      ],
      [
        '/role',
        {
          type: 'string',
          enumValues: [{ value: 'dev' }, { value: 'pm' }],
          annotations: { title: 'Role' },
        },
      ],
    ])
    const invalid: ValidationResult = {
      valid: false,
      errors: [{ instancePointer: '/role', keyword: 'enum', message: 'Pick one', params: {} }],
    }
    renderForm(proj, { role: 'dev' }, { '/role': { validationTrigger: 'blur' } }, () => invalid)

    const combobox = screen.getByLabelText('Role')
    // Valid: the attribute is absent rather than "false", so nothing is
    // announced as invalid before the field has been touched.
    expect(combobox.hasAttribute('aria-invalid')).toBe(false)

    fireEvent.blur(combobox)

    await waitFor(() => {
      expect(screen.getByLabelText('Role').getAttribute('aria-invalid')).toBe('true')
    })
  })

  it('every aria-describedby target exists in the DOM', () => {
    renderForm(fields, { name: 'A', age: 0, bio: '', role: 'dev', agree: false })
    const name = screen.getByLabelText('Name')
    const describedBy = name.getAttribute('aria-describedby') ?? ''
    for (const id of describedBy.split(' ').filter(Boolean)) {
      expect(document.getElementById(id)).not.toBeNull()
    }
  })

  // MUI does not pass readOnly through to the DOM the way it passes disabled,
  // so this pins the slot the mapping actually goes through.
  it('renders a readOnly field as read only rather than disabled', () => {
    const readOnlyField = makeProjection([
      [
        '',
        {
          type: 'object',
          children: [{ pointer: toPointer('/name'), key: 'name', required: false }],
        },
      ],
      ['/name', { type: 'string', annotations: { title: 'Name', readOnly: true } }],
    ])
    renderForm(readOnlyField, { name: 'set by the server' })
    const name = screen.getByLabelText('Name') as HTMLInputElement
    expect(name.readOnly).toBe(true)
    expect(name.disabled).toBe(false)
  })

  it('number rendered through number input stays numeric', () => {
    renderForm(fields, { name: '', age: 42, bio: '', role: 'dev', agree: false })
    const age = screen.getByLabelText('Age') as HTMLInputElement
    expect(age.value).toBe('42')
    fireEvent.change(age, { target: { value: '7' } })
    expect(age.value).toBe('7')
  })

  it('number rendered through textarea stays numeric', async () => {
    const proj = makeProjection([
      [
        '',
        {
          type: 'object',
          children: [{ pointer: toPointer('/count'), key: 'count', required: false }],
        },
      ],
      ['/count', { type: 'integer', annotations: { title: 'Count' } }],
    ])
    const { getData } = renderFormWithData(proj, { count: 10 }, { '/count': { widget: 'textarea' } })
    const el = screen.getByLabelText('Count')
    expect(el.tagName).toBe('TEXTAREA')
    fireEvent.change(el, { target: { value: '7' } })
    await waitFor(() => {
      const data = getData() as Record<string, unknown>
      expect(typeof data.count).toBe('number')
      expect(data.count).toBe(7)
    })
  })

  it('select preserves original enum values with numeric enums', async () => {
    const proj = makeProjection([
      [
        '',
        {
          type: 'object',
          children: [{ pointer: toPointer('/level'), key: 'level', required: false }],
        },
      ],
      [
        '/level',
        {
          type: 'integer',
          enumValues: [{ value: 1 }, { value: 2 }, { value: 3 }],
          annotations: { title: 'Level' },
        },
      ],
    ])
    const { getData } = renderFormWithData(proj, { level: 1 })
    const trigger = screen.getByLabelText('Level')
    fireEvent.mouseDown(trigger)
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(3)
    fireEvent.click(options[1])
    await waitFor(() => {
      const data = getData() as Record<string, unknown>
      expect(typeof data.level).toBe('number')
      expect(data.level).toBe(2)
    })
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
      ['/tags/0', { type: 'string', annotations: { title: 'Tag' } }],
    ])
    renderForm(proj, { tags: ['a'] })
    expect(screen.getByLabelText('Tag')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add item to Tags' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove Tag 1 from Tags' })).toBeTruthy()
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
          <FormProvider value={form.runtime}>
            <FormRoot registry={createMuiRegistry()} />
          </FormProvider>
        </ThemeProvider>
      )
    }
    render(<TestForm />)
    expect(screen.getByLabelText('Name')).toBeTruthy()
  })
})

// MUI routes both through slots rather than spreading DOM props, so the
// mapping is worth pinning separately from the other React widget sets.
describe('MUI read-only controls', () => {
  const readOnlyProjection = makeProjection([
    [
      '',
      {
        type: 'object',
        children: [
          { pointer: toPointer('/role'), key: 'role', required: false },
          { pointer: toPointer('/agree'), key: 'agree', required: false },
        ],
      },
    ],
    [
      '/role',
      {
        type: 'string',
        enumValues: [{ value: 'dev' }, { value: 'pm' }],
        annotations: { title: 'Role', readOnly: true },
      },
    ],
    ['/agree', { type: 'boolean', annotations: { title: 'Agree', readOnly: true } }],
  ])

  it('marks the combobox and the checkbox read only without disabling them', () => {
    renderForm(readOnlyProjection, { role: 'dev', agree: false })
    const combobox = screen.getByRole('combobox', { name: 'Role' })
    const checkbox = screen.getByLabelText('Agree') as HTMLInputElement
    expect(combobox.getAttribute('aria-readonly')).toBe('true')
    expect(checkbox.getAttribute('aria-readonly')).toBe('true')
    expect(checkbox.disabled).toBe(false)
  })

  it('refuses a checkbox toggle', () => {
    renderForm(readOnlyProjection, { role: 'dev', agree: false })
    fireEvent.click(screen.getByLabelText('Agree'))
    expect((screen.getByLabelText('Agree') as HTMLInputElement).checked).toBe(false)
  })
})

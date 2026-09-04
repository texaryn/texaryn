import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import React from 'react'
import { createRendererRegistry } from '@texaryn/core'
import type { SchemaEvaluationPort, SchemaProjection, NodeProjection, ChildProjection, JsonPointer, UIHints } from '@texaryn/core'
import { FormContext } from '../../context.js'
import { useForm } from '../../hooks/use-form.js'
import { FormRoot } from '../../components/FormRoot.js'
import { createDefaultRegistry } from '../default-registry.js'

function toPointer(s: string): JsonPointer { return s as JsonPointer }

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

// Form data of the most recent render, so a test can assert what a change event
// stored rather than what the control displays.
let latestData: unknown

function renderForm(proj: SchemaProjection, data: unknown, hints?: UIHints) {
  const port: SchemaEvaluationPort = {
    project: () => proj,
    validate: () => ({ valid: true, errors: [] }),
  }

  function TestForm() {
    const form = useForm(port, { initialData: data, hints })
    latestData = form.data
    return (
      <FormContext.Provider value={form.runtime}>
        <FormRoot registry={createDefaultRegistry()} />
      </FormContext.Provider>
    )
  }

  return render(<TestForm />)
}

// Node ids are deterministic per FormRuntime (node_1, node_2, ...), so two
// renders in the same document would collide on id unless the previous
// render's DOM is torn down first.
afterEach(() => {
  cleanup()
  latestData = undefined
})

describe('RendererRegistry (re-exported from @texaryn/core)', () => {
  it('is usable from the react package entry point', () => {
    const registry = createRendererRegistry<string>()
    expect(registry).toBeDefined()
  })
})

describe('Default widgets', () => {
  it('renders a text input for string field', () => {
    const proj = makeProjection([
      ['', { type: 'object', children: [
        { pointer: toPointer('/name'), key: 'name', required: false },
      ] }],
      ['/name', { type: 'string', annotations: { title: 'Name' } }],
    ])
    renderForm(proj, { name: 'Alice' })
    const input = screen.getByLabelText('Name') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.value).toBe('Alice')
  })

  it('renders the placeholder hint on text, number and textarea widgets', () => {
    const proj = makeProjection([
      ['', { type: 'object', children: [
        { pointer: toPointer('/email'), key: 'email', required: false },
        { pointer: toPointer('/age'), key: 'age', required: false },
        { pointer: toPointer('/bio'), key: 'bio', required: false },
        { pointer: toPointer('/name'), key: 'name', required: false },
      ] }],
      ['/email', { type: 'string', annotations: { title: 'Email' } }],
      ['/age', { type: 'integer', annotations: { title: 'Age' } }],
      ['/bio', { type: 'string', annotations: { title: 'Bio' } }],
      ['/name', { type: 'string', annotations: { title: 'Name' } }],
    ])
    renderForm(proj, {}, {
      '/email': { placeholder: 'you@example.com' },
      '/age': { placeholder: '18' },
      '/bio': { widget: 'textarea', placeholder: 'Tell us about yourself' },
    })
    expect((screen.getByLabelText('Email') as HTMLInputElement).placeholder).toBe('you@example.com')
    expect((screen.getByLabelText('Age') as HTMLInputElement).placeholder).toBe('18')
    const bio = screen.getByLabelText('Bio') as HTMLTextAreaElement
    expect(bio.tagName).toBe('TEXTAREA')
    expect(bio.placeholder).toBe('Tell us about yourself')
    expect((screen.getByLabelText('Name') as HTMLInputElement).hasAttribute('placeholder')).toBe(false)
  })

  it('renders helpText as the field description on every default field widget, preferring it over the schema description', () => {
    const proj = makeProjection([
      ['', { type: 'object', children: [
        { pointer: toPointer('/bio'), key: 'bio', required: false },
        { pointer: toPointer('/nick'), key: 'nick', required: false },
        { pointer: toPointer('/name'), key: 'name', required: false },
        { pointer: toPointer('/age'), key: 'age', required: false },
        { pointer: toPointer('/agree'), key: 'agree', required: false },
        { pointer: toPointer('/role'), key: 'role', required: false },
        { pointer: toPointer('/notes'), key: 'notes', required: false },
      ] }],
      ['/bio', { type: 'string', annotations: { title: 'Bio', description: 'From the schema' } }],
      ['/nick', { type: 'string', annotations: { title: 'Nickname' } }],
      ['/name', { type: 'string', annotations: { title: 'Name', description: 'Schema only' } }],
      ['/age', { type: 'integer', annotations: { title: 'Age' } }],
      ['/agree', { type: 'boolean', annotations: { title: 'Agree' } }],
      ['/role', { type: 'string', annotations: { title: 'Role' }, enumValues: [{ value: 'a' }, { value: 'b' }] }],
      ['/notes', { type: 'string', annotations: { title: 'Notes' } }],
    ])
    renderForm(proj, {}, {
      '/bio': { helpText: 'From the hint' },
      '/nick': { helpText: 'Hint without schema description' },
      '/age': { helpText: 'Number help' },
      '/agree': { helpText: 'Checkbox help' },
      '/role': { helpText: 'Select help' },
      '/notes': { widget: 'textarea', helpText: 'Textarea help' },
    })
    for (const [label, text] of [['Age', 'Number help'], ['Agree', 'Checkbox help'], ['Role', 'Select help'], ['Notes', 'Textarea help']] as const) {
      const el = screen.getByLabelText(label)
      expect(document.getElementById(el.getAttribute('aria-describedby')!)!.textContent).toBe(text)
    }
    const bio = screen.getByLabelText('Bio') as HTMLInputElement
    expect(document.getElementById(bio.getAttribute('aria-describedby')!)!.textContent).toBe('From the hint')
    expect(screen.queryByText('From the schema')).toBeNull()
    const nick = screen.getByLabelText('Nickname') as HTMLInputElement
    expect(document.getElementById(nick.getAttribute('aria-describedby')!)!.textContent).toBe('Hint without schema description')
    expect(screen.getByText('Schema only')).toBeTruthy()
  })

  it('renders a number input for integer field', () => {
    const proj = makeProjection([
      ['', { type: 'object', children: [
        { pointer: toPointer('/age'), key: 'age', required: false },
      ] }],
      ['/age', { type: 'integer', annotations: { title: 'Age' } }],
    ])
    renderForm(proj, { age: 30 })
    const input = screen.getByLabelText('Age') as HTMLInputElement
    expect(input.getAttribute('type')).toBe('number')
  })

  it('renders a checkbox for boolean field', () => {
    const proj = makeProjection([
      ['', { type: 'object', children: [
        { pointer: toPointer('/agree'), key: 'agree', required: false },
      ] }],
      ['/agree', { type: 'boolean', annotations: { title: 'I agree' } }],
    ])
    renderForm(proj, { agree: false })
    const input = screen.getByLabelText('I agree') as HTMLInputElement
    expect(input.getAttribute('type')).toBe('checkbox')
  })

  it('renders a select for enum field', () => {
    const proj = makeProjection([
      ['', { type: 'object', children: [
        { pointer: toPointer('/role'), key: 'role', required: false },
      ] }],
      ['/role', {
        type: 'string',
        annotations: { title: 'Role' },
        enumValues: [{ value: 'dev' }, { value: 'design' }],
      }],
    ])
    renderForm(proj, { role: 'dev' })
    expect(screen.getByLabelText('Role').tagName).toBe('SELECT')
  })

  it('renders children of object container', () => {
    const proj = makeProjection([
      ['', { type: 'object', children: [
        { pointer: toPointer('/first'), key: 'first', required: false },
        { pointer: toPointer('/last'), key: 'last', required: false },
      ] }],
      ['/first', { type: 'string', annotations: { title: 'First' } }],
      ['/last', { type: 'string', annotations: { title: 'Last' } }],
    ])
    renderForm(proj, { first: 'A', last: 'B' })
    expect(screen.getByLabelText('First')).toBeTruthy()
    expect(screen.getByLabelText('Last')).toBeTruthy()
  })

  it('hides fields with visible: false', () => {
    const proj = makeProjection([
      ['', { type: 'object', children: [
        { pointer: toPointer('/hidden'), key: 'hidden', required: false },
      ] }],
      ['/hidden', { type: 'string', annotations: { title: 'Hidden' }, active: false }],
    ])
    renderForm(proj, { hidden: 'x' })
    expect(screen.queryByLabelText('Hidden')).toBeNull()
  })

  it('stores a number when a number field is rendered as a textarea', () => {
    const proj = makeProjection([
      ['', { type: 'object', children: [
        { pointer: toPointer('/age'), key: 'age', required: false },
      ] }],
      ['/age', { type: 'integer', annotations: { title: 'Age' } }],
    ])
    renderForm(proj, {}, { '/age': { widget: 'textarea' } })
    const control = screen.getByLabelText('Age') as HTMLTextAreaElement
    expect(control.tagName).toBe('TEXTAREA')
    fireEvent.change(control, { target: { value: '42' } })
    expect((latestData as { age?: unknown }).age).toBe(42)
  })
})

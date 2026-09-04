import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react'
import React from 'react'
import type {
  FieldNode,
  SchemaEvaluationPort,
  SchemaProjection,
  NodeProjection,
  ChildProjection,
  JsonPointer,
  UIHints,
  ValidationResult,
} from '@texaryn/core'
import { FormContext } from '../../context.js'
import { useForm } from '../use-form.js'
import { useFieldBinding } from '../use-field-binding.js'
import type { FieldBinding } from '../use-field-binding.js'

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

// Captures the binding of the single field under test so assertions can read
// it after events, and renders a plain input so DOM events reach onChange.
let captured: FieldBinding | undefined

function Probe({ node }: { node: FieldNode }) {
  const binding = useFieldBinding(node)
  captured = binding
  const props = binding.domInputProps
  return 'checked' in props
    ? <input {...props} type="checkbox" data-testid="control" />
    : <input {...props} data-testid="control" />
}

function mount(
  field: Partial<NodeProjection>,
  options: { data?: unknown; hints?: UIHints; validate?: () => ValidationResult } = {},
) {
  const proj = makeProjection([
    ['', { type: 'object', children: [{ pointer: toPointer('/f'), key: 'f', required: field.constraints?.required ?? false }] }],
    ['/f', field],
  ])
  const port: SchemaEvaluationPort = {
    project: () => proj,
    validate: options.validate ?? (() => ({ valid: true, errors: [] })),
  }
  function Host() {
    const form = useForm(port, { initialData: options.data ?? {}, hints: options.hints })
    const node = Object.values(form.document.nodes).find((n) => n.dataPointer === '/f') as FieldNode
    return (
      <FormContext.Provider value={form.runtime}>
        <Probe node={node} />
      </FormContext.Provider>
    )
  }
  render(<Host />)
  const control = screen.getByTestId('control') as HTMLInputElement
  return { control, binding: () => captured! }
}

afterEach(() => {
  cleanup()
  captured = undefined
})

describe('useFieldBinding: derivations', () => {
  it('derives label from title, then pointer, then id', () => {
    const { binding } = mount({ type: 'string', annotations: { title: 'Full Name' } })
    expect(binding().label).toBe('Full Name')
    cleanup()
    const { binding: b2 } = mount({ type: 'string' })
    expect(b2().label).toBe('/f')
  })

  it('prefers helpText over the schema description and ignores validation state', () => {
    const { binding } = mount(
      { type: 'string', annotations: { description: 'From schema' } },
      { hints: { '/f': { helpText: 'From hint' } } },
    )
    expect(binding().description).toBe('From hint')
    cleanup()
    const { binding: b2 } = mount({ type: 'string', annotations: { description: 'From schema' } })
    expect(b2().description).toBe('From schema')
  })

  it('exposes placeholder and required from the node', () => {
    const { binding } = mount(
      { type: 'string', constraints: { required: true } },
      { hints: { '/f': { placeholder: 'you@example.com' } } },
    )
    expect(binding().placeholder).toBe('you@example.com')
    expect(binding().required).toBe(true)
    expect(binding().domInputProps['aria-required']).toBe(true)
    expect('required' in binding().domInputProps).toBe(false)
  })

  it('gates errors on showErrors and derives error and invalid from them', async () => {
    const invalid: ValidationResult = {
      valid: false,
      errors: [
        { instancePointer: '/f', keyword: 'minLength', message: 'Too short', params: {} },
        { instancePointer: '/f', keyword: 'pattern', params: {} },
      ],
    }
    const { control, binding } = mount(
      { type: 'string' },
      { data: { f: '' }, hints: { '/f': { validationTrigger: 'blur' } }, validate: () => invalid },
    )
    expect(binding().errors).toEqual([])
    expect(binding().error).toBeUndefined()
    expect(binding().invalid).toBe(false)
    await act(async () => { fireEvent.blur(control) })
    expect(binding().errors).toHaveLength(2)
    expect(binding().error).toBe('Too short')
    expect(binding().invalid).toBe(true)
    expect(binding().domInputProps['aria-invalid']).toBe(true)
  })

  it('falls back to keyword when the first visible error has no message', async () => {
    const invalid: ValidationResult = {
      valid: false,
      errors: [{ instancePointer: '/f', keyword: 'pattern', params: {} }],
    }
    const { control, binding } = mount(
      { type: 'string' },
      { data: { f: 'x' }, hints: { '/f': { validationTrigger: 'blur' } }, validate: () => invalid },
    )
    await act(async () => { fireEvent.blur(control) })
    expect(binding().error).toBe('pattern')
  })

  it('returns the three prop getters unchanged', () => {
    const { binding } = mount({ type: 'string', annotations: { description: 'd' } })
    const id = binding().node.id
    expect(binding().labelProps).toEqual({ id: `texaryn-${id}-label`, htmlFor: `texaryn-${id}-input` })
    expect(binding().descriptionProps).toEqual({ id: `texaryn-${id}-description` })
    expect(binding().errorProps).toEqual({ id: `texaryn-${id}-error`, role: 'alert' })
  })
})

describe('useFieldBinding: domInputProps display value and coercion', () => {
  it('string: shows the string, empty for null, String() otherwise, and passes the raw value through', async () => {
    const { control, binding } = mount({ type: 'string' }, { data: { f: 'Alice' } })
    expect(control.value).toBe('Alice')
    await act(async () => { binding().setValue(undefined) })
    expect(control.value).toBe('')
    await act(async () => { binding().setValue(42) })
    expect(control.value).toBe('42')
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(control, 'Bob')
      control.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(binding().value).toBe('Bob')
  })

  it('number and integer: shows the number, empty for null, coerces "" to undefined and text to Number', async () => {
    const { control, binding } = mount({ type: 'integer' }, { data: { f: 30 } })
    expect(control.value).toBe('30')
    await act(async () => { binding().setValue(undefined) })
    expect(control.value).toBe('')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => { setter.call(control, '42'); control.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(binding().value).toBe(42)
    await act(async () => { setter.call(control, ''); control.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(binding().value).toBeUndefined()
  })

  it('boolean: exposes checked and coerces from event.target.checked', async () => {
    const { control, binding } = mount({ type: 'boolean' }, { data: { f: false } })
    expect('checked' in binding().domInputProps).toBe(true)
    expect(control.checked).toBe(false)
    await act(async () => { control.click() })
    expect(binding().value).toBe(true)
    expect(control.checked).toBe(true)
  })

  it('enum: shows String(value), maps the DOM string back to the option value, passes unknown strings through', async () => {
    const { control, binding } = mount(
      { type: 'integer', enumValues: [{ value: 1, title: 'One' }, { value: 2, title: 'Two' }] },
      { data: { f: 2 } },
    )
    expect(control.value).toBe('2')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    await act(async () => { setter.call(control, '1'); control.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(binding().value).toBe(1)
    await act(async () => { setter.call(control, 'zzz'); control.dispatchEvent(new Event('input', { bubbles: true })) })
    expect(binding().value).toBe('zzz')
  })

  it('a boolean field with enum values is treated as an enum', () => {
    const { binding } = mount({ type: 'boolean', enumValues: [{ value: true }, { value: false }] }, { data: { f: true } })
    expect('checked' in binding().domInputProps).toBe(false)
    expect('value' in binding().domInputProps).toBe(true)
  })

  it('carries id, name, disabled, aria attributes, placeholder and onBlur from getInputProps', () => {
    const { binding } = mount(
      { type: 'string', annotations: { description: 'd' } },
      { hints: { '/f': { placeholder: 'p' } } },
    )
    const p = binding().domInputProps
    expect(p.id).toBe(`texaryn-${binding().node.id}-input`)
    expect(p.name).toBe('/f')
    expect(p.disabled).toBe(false)
    expect(p['aria-describedby']).toBe(`texaryn-${binding().node.id}-description`)
    expect(p.placeholder).toBe('p')
    expect(typeof p.onBlur).toBe('function')
  })
})

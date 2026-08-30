import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'
import { createRendererRegistry } from '@texaryn/core'
import type { SchemaEvaluationPort, SchemaProjection, NodeProjection, ChildProjection, JsonPointer } from '@texaryn/core'
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

function renderForm(proj: SchemaProjection, data: unknown) {
  const port: SchemaEvaluationPort = {
    project: () => proj,
    validate: () => ({ valid: true, errors: [] }),
  }

  function TestForm() {
    const form = useForm(port, { initialData: data })
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
})

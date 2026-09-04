import { describe, it, expect } from 'vitest'
import { getInputProps, getLabelProps, getErrorProps, getDescriptionProps } from '../field-props.js'
import type { FieldNode, NodeId, JsonPointer } from '@texaryn/core'

function makeFieldNode(overrides?: Partial<FieldNode>): FieldNode {
  return {
    id: 'node_1' as NodeId,
    type: 'field',
    parentId: null,
    dataPointer: '/name' as JsonPointer,
    order: 0,
    visible: true,
    disabled: false,
    annotations: { title: 'Full Name', description: 'Enter your name' },
    fieldType: 'string',
    constraints: {},
    ...overrides,
  }
}

function makeFieldState(overrides?: Record<string, unknown>) {
  return {
    value: '' as unknown,
    errors: [] as Array<{ instancePointer: string; keyword: string; message?: string; params: Record<string, unknown> }>,
    dirty: false,
    touched: false,
    visible: true,
    disabled: false,
    showErrors: false,
    onChange: () => {},
    onBlur: () => {},
    ...overrides,
  }
}

describe('getInputProps', () => {
  it('returns correct id and name', () => {
    const node = makeFieldNode()
    const props = getInputProps(node, makeFieldState())
    expect(props.id).toBe('texaryn-node_1-input')
    expect(props.name).toBe('/name')
  })

  it('sets aria-required when node has required constraint', () => {
    const node = makeFieldNode({ constraints: { required: true } })
    const props = getInputProps(node, makeFieldState())
    expect(props['aria-required']).toBe(true)
  })

  it('passes the node placeholder through', () => {
    const node = makeFieldNode({ placeholder: 'you@example.com' })
    const props = getInputProps(node, makeFieldState())
    expect(props.placeholder).toBe('you@example.com')
  })

  it('omits placeholder when the node has none', () => {
    const props = getInputProps(makeFieldNode(), makeFieldState())
    expect('placeholder' in props).toBe(false)
  })

  it('links aria-describedby to the description when only helpText is set', () => {
    const node = makeFieldNode({ annotations: { title: 'Bio' }, helpText: 'Tell us about yourself.' })
    const props = getInputProps(node, makeFieldState())
    expect(props['aria-describedby']).toBe('texaryn-node_1-description')
  })

  it('has no aria-describedby without description, helpText or visible errors', () => {
    const node = makeFieldNode({ annotations: { title: 'Bio' } })
    const props = getInputProps(node, makeFieldState())
    expect(props['aria-describedby']).toBeUndefined()
  })

  it('aria-invalid is absent when showErrors is false even with errors', () => {
    const node = makeFieldNode()
    const state = makeFieldState({
      errors: [{ instancePointer: '/name', keyword: 'minLength', params: {} }],
      showErrors: false,
    })
    const props = getInputProps(node, state)
    expect(props['aria-invalid']).toBeUndefined()
  })

  it('aria-invalid is true when showErrors is true and errors exist', () => {
    const node = makeFieldNode()
    const state = makeFieldState({
      errors: [{ instancePointer: '/name', keyword: 'minLength', params: {} }],
      showErrors: true,
    })
    const props = getInputProps(node, state)
    expect(props['aria-invalid']).toBe(true)
  })

  it('aria-describedby includes error ID only when showErrors is true', () => {
    const node = makeFieldNode()
    const state = makeFieldState({
      errors: [{ instancePointer: '/name', keyword: 'minLength', params: {} }],
      showErrors: true,
    })
    const props = getInputProps(node, state)
    expect(props['aria-describedby']).toBe('texaryn-node_1-description texaryn-node_1-error')
  })

  it('aria-describedby has only description when showErrors is false with errors', () => {
    const node = makeFieldNode()
    const state = makeFieldState({
      errors: [{ instancePointer: '/name', keyword: 'minLength', params: {} }],
      showErrors: false,
    })
    const props = getInputProps(node, state)
    expect(props['aria-describedby']).toBe('texaryn-node_1-description')
  })

  it('aria-describedby has only description when no errors', () => {
    const node = makeFieldNode()
    const props = getInputProps(node, makeFieldState())
    expect(props['aria-describedby']).toBe('texaryn-node_1-description')
  })

  it('aria-describedby is undefined when no description and showErrors is false', () => {
    const node = makeFieldNode({ annotations: {} })
    const props = getInputProps(node, makeFieldState())
    expect(props['aria-describedby']).toBeUndefined()
  })

  it('sets disabled from field state', () => {
    const node = makeFieldNode()
    const props = getInputProps(node, makeFieldState({ disabled: true }))
    expect(props.disabled).toBe(true)
  })
})

describe('getLabelProps', () => {
  it('returns htmlFor matching input id', () => {
    const node = makeFieldNode()
    const props = getLabelProps(node)
    expect(props.htmlFor).toBe('texaryn-node_1-input')
    expect(props.id).toBe('texaryn-node_1-label')
  })
})

describe('getErrorProps', () => {
  it('returns role alert without aria-live', () => {
    const node = makeFieldNode()
    const props = getErrorProps(node)
    expect(props.id).toBe('texaryn-node_1-error')
    expect(props.role).toBe('alert')
    expect(props).not.toHaveProperty('aria-live')
  })
})

describe('getDescriptionProps', () => {
  it('returns correct id', () => {
    const node = makeFieldNode()
    const props = getDescriptionProps(node)
    expect(props.id).toBe('texaryn-node_1-description')
  })
})

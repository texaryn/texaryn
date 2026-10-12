import { describe, expect, it, vi } from 'vitest'
import { get, readable, writable } from 'svelte/store'
import { createStore } from '@texaryn/core'
import type { FieldNode, FormMessages, NodeId, NodeState, UIDocument, ValidationError } from '@texaryn/core'
import { createFieldBinding, displayValue, fieldKind, sameEnumValue } from '../src/lib/field.js'
import type { SvelteFormBinding } from '../src/lib/form.js'

function field(overrides: Partial<FieldNode> = {}): FieldNode {
  return {
    id: 'field',
    type: 'field',
    parentId: null,
    dataPointer: '/field',
    order: 0,
    visible: true,
    disabled: false,
    readOnly: false,
    annotations: {},
    fieldType: 'string',
    constraints: {},
    ...overrides,
  }
}

describe('Svelte field helpers', () => {
  it('classifies primitive and enum fields', () => {
    expect(fieldKind(undefined)).toBe('string')
    expect(fieldKind(field({ enumValues: [{ value: 'x' }] }))).toBe('enum')
    expect(fieldKind(field({ fieldType: 'boolean' }))).toBe('boolean')
    expect(fieldKind(field({ fieldType: 'number' }))).toBe('number')
    expect(fieldKind(field({ fieldType: 'integer' }))).toBe('number')
    expect(fieldKind(field({ enumValues: [] }))).toBe('string')
    expect(fieldKind(field())).toBe('string')
  })

  it('formats values for text and numeric controls', () => {
    expect(displayValue('number', 0)).toBe(0)
    expect(displayValue('number', '12')).toBe('12')
    expect(displayValue('string', 'Ada')).toBe('Ada')
    expect(displayValue('boolean', false)).toBe('false')
    expect(displayValue('string', undefined)).toBe('')
    expect(displayValue('string', null)).toBe('')
  })

  it('compares JSON enum values recursively without conflating types', () => {
    expect(sameEnumValue(1, 1)).toBe(true)
    expect(sameEnumValue(1, '1')).toBe(false)
    expect(sameEnumValue(null, null)).toBe(true)
    expect(sameEnumValue([1, { label: 'A' }], [1, { label: 'A' }])).toBe(true)
    expect(sameEnumValue([1], [1, 2])).toBe(false)
    expect(sameEnumValue({ b: 2, a: 1 }, { a: 1, b: 2 })).toBe(true)
    expect(sameEnumValue({ a: 1 }, { a: '1' })).toBe(false)
    expect(sameEnumValue({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(sameEnumValue({ a: 1 }, null)).toBe(false)
  })

  it('tracks field state and writes typed number and enum values', () => {
    const numberField = field({
      id: 'age' as NodeId,
      fieldType: 'number',
      dataPointer: '/age',
      helpText: 'Years old',
      constraints: { required: true },
    })
    const enumField = field({
      id: 'age' as NodeId,
      enumValues: [{ value: 1 }, { value: 'one' }],
    })
    const document = writable({
      version: 1,
      rootId: numberField.id,
      nodes: { [numberField.id]: numberField },
    } as UIDocument)
    const nodeId = writable(numberField.id)
    const value = createStore<unknown>(7)
    const errors = createStore<ValidationError[]>([])
    const showErrors = createStore(false)
    const state = {
      value,
      errors,
      dirty: createStore(false),
      touched: createStore(false),
      visible: createStore(true),
      disabled: createStore(false),
      showErrors,
    } as unknown as NodeState
    const dispatch = vi.fn()
    const form = {
      document,
      dispatch,
      getNodeState: () => state,
    } as unknown as SvelteFormBinding
    const binding = createFieldBinding(form, nodeId, 'test', readable({} as FormMessages))

    expect(get(binding.kind)).toBe('number')
    expect(get(binding.display)).toBe(7)
    expect(get(binding.label)).toBe('Age')
    expect(get(binding.description)).toBe('Years old')
    expect(get(binding.labelFor)).toBe('test-age-input')
    expect(get(binding.aria)?.['aria-required']).toBe(true)
    value.set(8.5)
    expect(get(binding.display)).toBe(8.5)

    binding.setRaw('')
    binding.setRaw('9')
    binding.setValue('direct')
    binding.onBlur()
    expect(dispatch.mock.calls.map(([command]) => command)).toEqual([
      { type: 'SetValue', nodeId: 'age', value: undefined },
      { type: 'SetValue', nodeId: 'age', value: 9 },
      { type: 'SetValue', nodeId: 'age', value: 'direct' },
      { type: 'SetTouched', nodeId: 'age' },
    ])

    document.set({
      version: 1,
      rootId: enumField.id,
      nodes: { [enumField.id]: enumField },
    } as UIDocument)
    expect(get(binding.kind)).toBe('enum')
    binding.setRaw('', 'invalid')
    binding.setRaw('', '-1')
    binding.setRaw('', '8')
    expect(dispatch).toHaveBeenCalledTimes(4)
    binding.setRaw('', '1')
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'SetValue', nodeId: 'age', value: 'one' })

    const error: ValidationError = {
      instancePointer: '/age',
      keyword: 'minimum',
      message: 'Too small',
      params: {},
    }
    errors.set([error])
    expect(get(binding.visibleErrors)).toEqual([])
    showErrors.set(true)
    expect(get(binding.visibleErrors)).toEqual([error])
  })

  it('uses fallbacks for absent node state and refuses writes to read only fields', () => {
    const lockedField = field({ id: 'locked' as NodeId, readOnly: true })
    const document = writable({
      version: 1,
      rootId: lockedField.id,
      nodes: { [lockedField.id]: lockedField },
    } as UIDocument)
    const nodeId = writable(lockedField.id)
    const dispatch = vi.fn()
    const form = {
      document,
      dispatch,
      getNodeState: () => undefined,
    } as unknown as SvelteFormBinding
    const binding = createFieldBinding(form, nodeId, 'test', readable({} as FormMessages))

    expect(get(binding.value)).toBeUndefined()
    expect(get(binding.visibleErrors)).toEqual([])
    expect(get(binding.visible)).toBe(true)
    binding.setRaw('changed')
    binding.setValue('changed')
    expect(dispatch).not.toHaveBeenCalled()

    document.set({ version: 1, rootId: 'missing' as NodeId, nodes: {} } as UIDocument)
    nodeId.set('missing' as NodeId)
    expect(get(binding.node)).toBeUndefined()
    expect(get(binding.label)).toBe('')
    expect(get(binding.labelFor)).toBe('test-missing-input')
    expect(get(binding.descriptionId)).toBe('test-missing-description')
    expect(get(binding.errorId)).toBe('test-missing-error')
    expect(get(binding.aria)).toBeUndefined()
    binding.setRaw('ignored')
    binding.setValue('ignored')
    binding.onBlur()
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'SetTouched', nodeId: 'missing' })
  })
})

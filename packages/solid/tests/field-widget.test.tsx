import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { createStore, englishMessages } from '@texaryn/core'
import type { FieldNode, FormRuntime, NodeId, UIDocument } from '@texaryn/core'
import { createDefaultRegistry } from '../src/registry.js'
import { FormContext } from '../src/context.js'
import type { SolidFormContext } from '../src/context.js'
import { FieldWidget } from '../src/widgets/FieldWidget.js'

afterEach(cleanup)

describe('Solid field widget', () => {
  it('matches arrays nested in an object enum and rejects the object option', () => {
    const id = 'choice' as NodeId
    const node: FieldNode = {
      id,
      type: 'field',
      fieldType: 'object',
      parentId: null,
      dataPointer: null,
      order: 0,
      visible: true,
      disabled: false,
      readOnly: false,
      annotations: {},
      constraints: {},
      enumValues: [
        { value: { nested: [1, { active: true }] }, title: 'Nested list' },
        { value: { active: true }, title: 'Object' },
      ],
    }
    const value = createStore<unknown>({ nested: [1, { active: true }] })
    const state = {
      value,
      errors: createStore([]),
      dirty: createStore(false),
      touched: createStore(false),
      visible: createStore(true),
      disabled: createStore(false),
      validationStatus: createStore<'idle' | 'pending' | 'valid' | 'invalid'>('idle'),
      showErrors: createStore(false),
    }
    const dispatch = vi.fn()
    const form = { dispatch, getNodeState: () => state } as unknown as FormRuntime
    const document: UIDocument = { version: 1, rootId: id, nodes: { [id]: node } }
    const context: SolidFormContext = {
      form: () => form,
      document: () => document,
      registry: () => createDefaultRegistry(),
      messages: () => englishMessages,
      idPrefix: () => 'enum-test',
    }

    render(() => <FormContext.Provider value={context}><FieldWidget node={node} /></FormContext.Provider>)

    const select = screen.getByRole('combobox', { name: 'Field' }) as HTMLSelectElement
    expect(select.value).toBe('0')
    fireEvent.change(select, { target: { value: '1' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'SetValue', nodeId: id, value: { active: true } })
  })
})

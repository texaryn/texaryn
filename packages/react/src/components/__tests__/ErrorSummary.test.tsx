import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'
import { createStore } from '@texaryn/core'
import type { FormRuntime, NodeId, JsonPointer, VisibleError, UIDocument, SubmissionState } from '@texaryn/core'
import { FormContext } from '../../context.js'
import { ErrorSummary } from '../ErrorSummary.js'

afterEach(() => {
  cleanup()
})

function makeMockRuntime(visibleErrors: VisibleError[]): FormRuntime {
  return {
    document: createStore<UIDocument>({ version: 1, rootId: 'node_1' as NodeId, nodes: {} }),
    data: createStore<unknown>({}),
    submission: createStore<SubmissionState>({ status: 'idle', attempts: 0 }),
    visibleErrors: createStore<VisibleError[]>(visibleErrors),
    dispatch: () => {},
    getNodeState: () => undefined,
    destroy: () => {},
  }
}

function renderWithRuntime(runtime: FormRuntime) {
  return render(
    <FormContext.Provider value={runtime}>
      <ErrorSummary />
    </FormContext.Provider>,
  )
}

describe('ErrorSummary', () => {
  it('renders nothing when no visible errors', () => {
    const { container } = renderWithRuntime(makeMockRuntime([]))
    expect(container.innerHTML).toBe('')
  })

  it('renders error list when visible errors exist', () => {
    const errors: VisibleError[] = [{
      nodeId: 'node_2' as NodeId,
      fieldTitle: 'Name',
      pointer: '/name' as JsonPointer,
      errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }],
    }]
    renderWithRuntime(makeMockRuntime(errors))
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText(/Name/)).toBeTruthy()
    expect(screen.getByText(/Required/)).toBeTruthy()
  })

  it('links each error to the field input by anchor', () => {
    const errors: VisibleError[] = [{
      nodeId: 'node_2' as NodeId,
      fieldTitle: 'Email',
      pointer: '/email' as JsonPointer,
      errors: [{ instancePointer: '/email', keyword: 'format', message: 'Invalid email', params: {} }],
    }]
    renderWithRuntime(makeMockRuntime(errors))
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('#texaryn-node_2-input')
  })

  it('falls back to pointer when fieldTitle is undefined', () => {
    const errors: VisibleError[] = [{
      nodeId: 'node_2' as NodeId,
      fieldTitle: undefined,
      pointer: '/name' as JsonPointer,
      errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }],
    }]
    renderWithRuntime(makeMockRuntime(errors))
    expect(screen.getByText(/\/name/)).toBeTruthy()
  })

  it('falls back to nodeId when both fieldTitle and pointer are null', () => {
    const errors: VisibleError[] = [{
      nodeId: 'node_2' as NodeId,
      fieldTitle: undefined,
      pointer: null,
      errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }],
    }]
    renderWithRuntime(makeMockRuntime(errors))
    expect(screen.getByText(/node_2/)).toBeTruthy()
  })

  it('falls back to keyword when message is undefined', () => {
    const errors: VisibleError[] = [{
      nodeId: 'node_2' as NodeId,
      fieldTitle: 'Name',
      pointer: '/name' as JsonPointer,
      errors: [{ instancePointer: '/name', keyword: 'minLength', params: {} }],
    }]
    renderWithRuntime(makeMockRuntime(errors))
    expect(screen.getByText(/minLength/)).toBeTruthy()
  })

  it('renders multiple fields with errors', () => {
    const errors: VisibleError[] = [
      {
        nodeId: 'node_2' as NodeId,
        fieldTitle: 'Name',
        pointer: '/name' as JsonPointer,
        errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }],
      },
      {
        nodeId: 'node_3' as NodeId,
        fieldTitle: 'Age',
        pointer: '/age' as JsonPointer,
        errors: [{ instancePointer: '/age', keyword: 'minimum', message: 'Too low', params: {} }],
      },
    ]
    renderWithRuntime(makeMockRuntime(errors))
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
  })
})

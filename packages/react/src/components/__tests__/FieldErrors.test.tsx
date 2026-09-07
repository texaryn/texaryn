import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import React from 'react'
import type { FieldNode, NodeId, JsonPointer, ValidationError } from '@texaryn/core'
import { FieldErrors } from '../FieldErrors.js'
import { FormProvider } from '../../context.js'

afterEach(() => {
  cleanup()
})

function makeFieldNode(overrides?: Partial<FieldNode>): FieldNode {
  return {
    id: 'node_1' as NodeId,
    type: 'field',
    parentId: null,
    dataPointer: '/name' as JsonPointer,
    order: 0,
    visible: true,
    disabled: false,
    readOnly: false,
    annotations: { title: 'Name' },
    fieldType: 'string',
    constraints: {},
    ...overrides,
  }
}

const sampleErrors: ValidationError[] = [
  { instancePointer: '/name', keyword: 'required', message: 'Required', params: {} },
]

// The id scope comes from the provider, not the runtime, so a null runtime is
// enough to render a field-level widget on its own.
function renderScoped(ui: React.ReactNode) {
  return render(<FormProvider value={null}>{ui}</FormProvider>)
}

describe('FieldErrors', () => {
  // The region stays mounted and goes empty instead of unmounting: one that
  // arrives with its content already in place is not reliably announced.
  it('stays mounted and says nothing when showErrors is false', () => {
    const { container } = renderScoped(
      <FieldErrors node={makeFieldNode()} errors={sampleErrors} showErrors={false} />,
    )
    const region = container.querySelector('[aria-live="polite"]')
    expect(region).not.toBeNull()
    expect(region!.textContent).toBe('')
  })

  it('stays mounted and says nothing when the errors array is empty', () => {
    const { container } = renderScoped(
      <FieldErrors node={makeFieldNode()} errors={[]} showErrors={true} />,
    )
    const region = container.querySelector('[aria-live="polite"]')
    expect(region).not.toBeNull()
    expect(region!.textContent).toBe('')
  })

  it('renders errors when showErrors is true', () => {
    renderScoped(
      <FieldErrors node={makeFieldNode()} errors={sampleErrors} showErrors={true} />,
    )
    expect(screen.getByText('Required')).toBeTruthy()
  })

  it('is a polite atomic live region carrying the field error id', () => {
    const { container } = renderScoped(
      <FieldErrors node={makeFieldNode()} errors={sampleErrors} showErrors={true} />,
    )
    const region = container.querySelector('[aria-live="polite"]')!
    expect(region.id).toMatch(/^texaryn-[0-9a-z_]+-node_1-error$/)
    expect(region.getAttribute('aria-atomic')).toBe('true')
    expect(region.getAttribute('role')).toBeNull()
  })

  it('falls back to keyword when message is undefined', () => {
    const errors: ValidationError[] = [
      { instancePointer: '/name', keyword: 'minLength', params: {} },
    ]
    renderScoped(
      <FieldErrors node={makeFieldNode()} errors={errors} showErrors={true} />,
    )
    expect(screen.getByText('minLength')).toBeTruthy()
  })

  it('renders multiple errors', () => {
    const errors: ValidationError[] = [
      { instancePointer: '/name', keyword: 'required', message: 'Required', params: {} },
      { instancePointer: '/name', keyword: 'minLength', message: 'Too short', params: {} },
    ]
    renderScoped(
      <FieldErrors node={makeFieldNode()} errors={errors} showErrors={true} />,
    )
    expect(screen.getByText('Required')).toBeTruthy()
    expect(screen.getByText('Too short')).toBeTruthy()
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { InspectorTree } from '../InspectorTree.js'

afterEach(cleanup)

describe('inspector value tree', () => {
  it('distinguishes unset, null, and typed map keys in the structured view', () => {
    render(
      <InspectorTree
        label="Data"
        value={{
          unset: undefined,
          nil: null,
          lookup: new Map<unknown, unknown>([[1, 'number key'], ['1', 'string key']]),
        }}
      />,
    )

    expect(screen.getByText('undefined')).toBeTruthy()
    expect(screen.getByText('null')).toBeTruthy()
    expect(screen.getByText('unset')).toBeTruthy()
    expect(screen.getByText('nil')).toBeTruthy()

    fireEvent.click(screen.getByLabelText('Hide unset values'))
    expect(screen.queryByText('unset')).toBeNull()
    expect(screen.getByText('nil')).toBeTruthy()

    fireEvent.click(screen.getByText('Raw diagnostic JSON'))
    expect(screen.getByText(/"\$texarynInspectorValue": "undefined"/)).toBeTruthy()
    expect(screen.getByText(/"\$texarynInspectorValue": "Map"/)).toBeTruthy()
    expect(screen.getAllByText(/"number key"/)).toHaveLength(2)
    expect(screen.getAllByText(/"string key"/)).toHaveLength(2)
  })
})

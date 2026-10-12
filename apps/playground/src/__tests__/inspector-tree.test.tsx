import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { InspectorTree } from '../InspectorTree.js'

afterEach(cleanup)

describe('inspector value tree', () => {
  it('sorts object fields with locale-independent key ordering', () => {
    const { container } = render(
      <InspectorTree
        label="Data"
        value={{ B: 1, a: 2, ä: 3, '10': 10, '2': 2 }}
      />,
    )

    const keys = Array.from(
      container.querySelectorAll('.pg-tree__children > .pg-tree__leaf .pg-tree__key'),
      (element) => element.textContent,
    )
    expect(keys).toEqual(['10', '2', 'B', 'a', 'ä'])
  })

  it('mounts descendants only when their parent branch is expanded', async () => {
    render(
      <InspectorTree label="Data" value={{ user: { profile: { name: 'Ada' } } }} />,
    )

    expect(screen.queryByText('profile')).toBeNull()
    fireEvent.click(screen.getByText('user'))
    await waitFor(() => expect(screen.getByText('profile')).toBeTruthy())
    expect(screen.queryByText('name')).toBeNull()
    fireEvent.click(screen.getByText('profile'))
    await waitFor(() => expect(screen.getByText('name')).toBeTruthy())
  })

  it('distinguishes unset, null, and typed map keys in the structured view', async () => {
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
    fireEvent.click(screen.getByText('lookup'))
    await waitFor(() => expect(screen.getAllByText(/"number key"/)).toHaveLength(2))
    expect(screen.getAllByText(/"string key"/)).toHaveLength(2)
  })
})

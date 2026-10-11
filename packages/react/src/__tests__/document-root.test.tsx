import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDocumentRuntime } from '@texaryn/core'
import type { UIDocumentV2 } from '@texaryn/core'
import { DocumentRoot } from '../components/DocumentRoot.js'
import type { JsonPointer, NodeId } from '@texaryn/core'

const id = (value: string) => value as NodeId
const pointer = (value: string) => value as JsonPointer

afterEach(cleanup)

function fixture(): UIDocumentV2 {
  return {
    version: 2,
    rootId: id('root'),
    nodes: {
      root: {
        id: id('root'), type: 'container', parentId: null,
        annotations: { title: 'People' }, containerType: 'group',
        children: [id('heading'), id('list'), id('table'), id('action')],
      },
      heading: {
        id: id('heading'), type: 'text', parentId: id('root'), annotations: {},
        textRole: 'heading', content: 'Directory',
      },
      list: {
        id: id('list'), type: 'list', parentId: id('root'), annotations: {},
        collectionId: 'people-list', dataPointer: pointer('/people'), valuePointer: pointer('/name'),
        rowKeyPointer: pointer('/id'),
      },
      table: {
        id: id('table'), type: 'table', parentId: id('root'), annotations: {},
        collectionId: 'people-table', dataPointer: pointer('/people'), rowKeyPointer: pointer('/id'),
        columns: [{ id: 'name', label: 'Name', valuePointer: pointer('/name') }],
      },
      action: {
        id: id('action'), type: 'action', parentId: id('root'), annotations: {},
        actionType: 'refresh', label: 'Refresh', buttonRole: 'button',
      },
    },
  }
}

describe('DocumentRoot', () => {
  it('renders accessible groups, text, lists, tables, and host actions', async () => {
    const onRefresh = vi.fn()
    const runtime = createDocumentRuntime(fixture(), {
      initialData: { people: [{ id: 'one', name: 'Ada' }] },
      actions: { refresh: onRefresh },
    })

    render(<DocumentRoot runtime={runtime} />)

    expect(screen.getByRole('group', { name: 'People' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Directory' })).toBeTruthy()
    expect(screen.getByRole('listitem').textContent).toBe('Ada')
    expect(within(screen.getByRole('table')).getByRole('columnheader', { name: 'Name' })).toBeTruthy()
    expect(within(screen.getByRole('table')).getByRole('cell').textContent).toBe('Ada')

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Refresh' })))
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('tracks data updates and reports action failures through the host callback', async () => {
    const onActionError = vi.fn()
    const actionFailure = new Error('network unavailable')
    const runtime = createDocumentRuntime(fixture(), {
      initialData: { people: [{ id: 'one', name: 'Ada' }] },
      actions: { refresh: () => Promise.reject(actionFailure) },
    })
    render(<DocumentRoot runtime={runtime} onActionError={onActionError} />)

    act(() => runtime.setData({ people: [{ id: 'two', name: 'Grace' }] }))
    expect(screen.getByRole('listitem').textContent).toBe('Grace')

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Refresh' })))
    expect(onActionError).toHaveBeenCalledWith(actionFailure)
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@solidjs/testing-library'
import { createDocumentRuntime } from '@texaryn/core'
import type { UIDocumentV2 } from '@texaryn/core'
import { DocumentRoot } from '../src/components/DocumentRoot.js'
import type { JsonPointer, NodeId } from '@texaryn/core'

afterEach(cleanup)

const id = (value: string) => value as NodeId
const pointer = (value: string) => value as JsonPointer

function fixture(): UIDocumentV2 {
  return {
    version: 2,
    rootId: id('root'),
    nodes: {
      root: { id: id('root'), type: 'container', parentId: null, annotations: { title: 'People' }, containerType: 'group', children: [id('heading'), id('list'), id('table'), id('action')] },
      heading: { id: id('heading'), type: 'text', parentId: id('root'), annotations: {}, textRole: 'heading', content: 'Directory' },
      list: { id: id('list'), type: 'list', parentId: id('root'), annotations: {}, collectionId: 'people-list', dataPointer: pointer('/people'), valuePointer: pointer('/name'), rowKeyPointer: pointer('/id') },
      table: { id: id('table'), type: 'table', parentId: id('root'), annotations: {}, collectionId: 'people-table', dataPointer: pointer('/people'), rowKeyPointer: pointer('/id'), columns: [{ id: 'name', label: 'Name', valuePointer: pointer('/name') }] },
      action: { id: id('action'), type: 'action', parentId: id('root'), annotations: {}, actionType: 'refresh', label: 'Refresh', buttonRole: 'button' },
    },
  }
}

describe('Solid DocumentRoot', () => {
  it('renders display nodes, preserves keyed rows, and invokes host actions', async () => {
    const refresh = vi.fn()
    const runtime = createDocumentRuntime(fixture(), {
      initialData: { people: [{ id: 'ada', name: 'Ada' }] },
      actions: { refresh },
    })
    render(() => <DocumentRoot runtime={runtime} />)

    expect(screen.getByRole('group', { name: 'People' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Directory' })).toBeTruthy()
    const row = screen.getByRole('listitem')
    expect(row.textContent).toBe('Ada')
    const cell = screen.getByRole('cell')
    expect(cell.textContent).toBe('Ada')
    runtime.setData({ people: [{ id: 'ada', name: 'Grace' }] })
    await waitFor(() => expect(screen.getByRole('listitem').textContent).toBe('Grace'))
    await waitFor(() => expect(cell.textContent).toBe('Grace'))
    expect(screen.getByRole('listitem')).toBe(row)
    expect(screen.getByRole('cell')).toBe(cell)
    const next = fixture()
    const heading = next.nodes.heading
    if (heading.type !== 'text') throw new Error('expected text node')
    heading.content = 'Updated directory'
    runtime.replaceDocument(next)
    await waitFor(() => expect(screen.getByRole('heading').textContent).toBe('Updated directory'))
    expect(screen.getByRole('listitem')).toBe(row)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
  })

  it('reports host action failures', async () => {
    const error = new Error('refresh failed')
    const onActionError = vi.fn()
    const runtime = createDocumentRuntime(fixture(), {
      initialData: { people: [] },
      actions: { refresh: () => Promise.reject(error) },
    })
    render(() => <DocumentRoot runtime={runtime} onActionError={onActionError} />)
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(onActionError).toHaveBeenCalledWith(error))
  })
})

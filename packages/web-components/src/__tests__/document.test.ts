import { describe, expect, it, vi } from 'vitest'
import { createDocumentRuntime, createRendererRegistry } from '@texaryn/core'
import type { DocumentNode, UIDocumentV2 } from '@texaryn/core'
import { mountDocument } from '../document.js'
import type { JsonPointer, NodeId } from '@texaryn/core'
import type { DocumentWidgetFactory } from '../document.js'

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

describe('mountDocument', () => {
  it('renders accessible display nodes, updates collection rows, and invokes actions', async () => {
    const refresh = vi.fn()
    const runtime = createDocumentRuntime(fixture(), {
      initialData: { people: [{ id: 'ada', name: 'Ada' }] },
      actions: { refresh },
    })
    const host = document.createElement('main')
    const mounted = mountDocument(host, runtime)

    expect(host.querySelector('fieldset legend')?.textContent).toBe('People')
    expect(host.querySelector('h2')?.textContent).toBe('Directory')
    expect(host.querySelector('ul li')?.textContent).toBe('Ada')
    expect(host.querySelector('th')?.textContent).toBe('Name')
    expect(host.querySelector('td')?.textContent).toBe('Ada')

    const firstListItem = host.querySelector('li')
    runtime.setData({ people: [{ id: 'ada', name: 'Grace' }] })
    expect(host.querySelector('li')?.textContent).toBe('Grace')
    expect(host.querySelector('li')).toBe(firstListItem)
    host.querySelector('button')?.click()
    await Promise.resolve()
    expect(refresh).toHaveBeenCalledOnce()

    mounted.unmount()
    expect(host.childNodes).toHaveLength(0)
    expect(runtime.data.getSnapshot()).toEqual({ people: [{ id: 'ada', name: 'Grace' }] })
  })

  it('reports action errors and replaces the document after full replacement', async () => {
    const error = new Error('request failed')
    const onActionError = vi.fn()
    const runtime = createDocumentRuntime(fixture(), {
      initialData: { people: [] },
      actions: { refresh: () => Promise.reject(error) },
    })
    const host = document.createElement('main')
    const mounted = mountDocument(host, runtime, { onActionError })
    const firstListItem = host.querySelector('li')
    const firstCell = host.querySelector('td')
    const fieldset = host.querySelector('fieldset')
    const action = host.querySelector('button')
    const next = fixture()
    const text = next.nodes.heading
    if (text.type !== 'text') throw new Error('expected text node')
    text.content = 'Updated directory'
    runtime.replaceDocument(next)
    expect(host.querySelector('h2')?.textContent).toBe('Updated directory')
    expect(host.querySelector('fieldset')).toBe(fieldset)
    expect(host.querySelector('li')).toBe(firstListItem)
    expect(host.querySelector('td')).toBe(firstCell)
    expect(host.querySelector('button')).toBe(action)
    expect(host.querySelector('fieldset')).toBe(fieldset)
    expect(host.querySelector('li')).toBe(firstListItem)
    expect(host.querySelector('td')).toBe(firstCell)
    expect(host.querySelector('button')).toBe(action)
    host.querySelector('button')?.click()
    await Promise.resolve()
    await Promise.resolve()
    expect(onActionError).toHaveBeenCalledWith(error)
    mounted.unmount()
  })

  it('keeps added children and newly selected registry widgets during reconciliation', () => {
    const runtime = createDocumentRuntime(fixture(), { initialData: { people: [] } })
    const registry = createRendererRegistry<DocumentWidgetFactory, DocumentNode>()
    const destroy = vi.fn()
    registry.register({ rank: 1, test: (node) => node.id === 'heading' && node.type === 'text' && node.content === 'Custom' }, () => {
      const element = document.createElement('strong')
      element.textContent = 'Custom renderer'
      return { element, destroy }
    })
    const host = document.createElement('main')
    const mounted = mountDocument(host, runtime, { registry })
    expect(host.querySelector('h2')?.textContent).toBe('Directory')

    const next = fixture()
    const root = next.nodes.root
    if (root.type !== 'container') throw new Error('expected root container')
    root.children.push(id('extra'))
    next.nodes.extra = {
      id: id('extra'),
      type: 'text',
      parentId: id('root'),
      annotations: {},
      textRole: 'paragraph',
      content: 'Added content',
    }
    const heading = next.nodes.heading
    if (heading.type !== 'text') throw new Error('expected text node')
    heading.content = 'Custom'

    runtime.replaceDocument(next)
    expect(host.querySelector('strong')?.textContent).toBe('Custom renderer')
    expect(host.querySelector('p')?.textContent).toBe('Added content')
    expect(host.textContent).not.toContain('Directory')
    mounted.unmount()
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('rebinds an action when the root action ID changes', async () => {
    const makeAction = (nodeId: string, label: string): UIDocumentV2 => ({
      version: 2,
      rootId: id(nodeId),
      nodes: {
        [nodeId]: {
          id: id(nodeId),
          type: 'action',
          parentId: null,
          annotations: {},
          actionType: 'refresh',
          label,
          buttonRole: 'button',
        },
      },
    })
    const refresh = vi.fn()
    const runtime = createDocumentRuntime(makeAction('old-action', 'Old'), { actions: { refresh } })
    const host = document.createElement('main')
    const mounted = mountDocument(host, runtime)
    const oldButton = host.querySelector('button')

    runtime.replaceDocument(makeAction('new-action', 'New'))
    const newButton = host.querySelector('button')
    expect(newButton).not.toBe(oldButton)
    expect(newButton?.textContent).toBe('New')
    newButton?.click()
    await Promise.resolve()
    expect(refresh).toHaveBeenCalledOnce()
    mounted.unmount()
  })

  it('cleans up staged collection subscriptions when replacement mounting fails', () => {
    const runtime = createDocumentRuntime(fixture(), {
      initialData: { people: [{ id: 'ada', name: 'Ada' }] },
    })
    const listStore = runtime.getCollection(id('list'))
    if (!listStore) throw new Error('expected list collection')
    let activeSubscriptions = 0
    const subscribe = listStore.subscribe.bind(listStore)
    vi.spyOn(listStore, 'subscribe').mockImplementation((listener) => {
      activeSubscriptions += 1
      const unsubscribe = subscribe(listener)
      return () => {
        activeSubscriptions -= 1
        unsubscribe()
      }
    })

    const error = new Error('widget construction failed')
    const registry = createRendererRegistry<DocumentWidgetFactory, DocumentNode>()
    registry.register({ rank: 1, test: (node) => node.id === 'heading' && node.type === 'text' && node.content === 'Explode' }, () => { throw error })
    const host = document.createElement('main')
    const mounted = mountDocument(host, runtime, { registry })
    expect(activeSubscriptions).toBe(1)
    const originalRoot = host.querySelector('fieldset')

    const next = fixture()
    const root = next.nodes.root
    if (root.type !== 'container') throw new Error('expected root container')
    root.children = [id('list'), id('table'), id('heading'), id('action')]
    const heading = next.nodes.heading
    if (heading.type !== 'text') throw new Error('expected text node')
    heading.content = 'Explode'

    expect(() => runtime.replaceDocument(next)).toThrow(error)
    expect(host.querySelector('fieldset')).toBe(originalRoot)
    expect(host.querySelector('h2')?.textContent).toBe('Directory')
    expect(activeSubscriptions).toBe(1)

    mounted.unmount()
    expect(activeSubscriptions).toBe(0)
  })
})

import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createDocumentRuntime } from '@texaryn/core'
import type { UIDocumentV2 } from '@texaryn/core'
import { nextTick } from 'vue'
import { DocumentRoot } from '../components/DocumentRoot.js'
import type { JsonPointer, NodeId } from '@texaryn/core'

const id = (value: string) => value as NodeId
const pointer = (value: string) => value as JsonPointer

function fixture(): UIDocumentV2 {
  return {
    version: 2,
    rootId: id('root'),
    nodes: {
      root: { id: id('root'), type: 'container', parentId: null, annotations: { title: 'People' }, containerType: 'group', children: [id('title'), id('list'), id('table'), id('action')] },
      title: { id: id('title'), type: 'text', parentId: id('root'), annotations: {}, textRole: 'heading', content: 'Directory' },
      list: { id: id('list'), type: 'list', parentId: id('root'), annotations: {}, collectionId: 'people-list', dataPointer: pointer('/people'), valuePointer: pointer('/name'), rowKeyPointer: pointer('/id') },
      table: { id: id('table'), type: 'table', parentId: id('root'), annotations: {}, collectionId: 'people-table', dataPointer: pointer('/people'), rowKeyPointer: pointer('/id'), columns: [{ id: 'name', label: 'Name', valuePointer: pointer('/name') }] },
      action: { id: id('action'), type: 'action', parentId: id('root'), annotations: {}, actionType: 'refresh', label: 'Refresh', buttonRole: 'button' },
    },
  }
}

describe('DocumentRoot', () => {
  it('renders semantic display nodes and invokes host actions', async () => {
    const refresh = vi.fn()
    const runtime = createDocumentRuntime(fixture(), {
      initialData: { people: [{ id: 'ada', name: 'Ada' }] },
      actions: { refresh },
    })
    const wrapper = mount(DocumentRoot, { props: { runtime } })

    expect(wrapper.get('legend').text()).toBe('People')
    expect(wrapper.get('h2').text()).toBe('Directory')
    expect(wrapper.get('ul li').text()).toBe('Ada')
    expect(wrapper.get('th').text()).toBe('Name')
    expect(wrapper.get('td').text()).toBe('Ada')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(refresh).toHaveBeenCalledOnce()

    wrapper.unmount()
    runtime.destroy()
  })

  it('subscribes to collection updates and reports action errors', async () => {
    const onActionError = vi.fn()
    const error = new Error('action failed')
    const runtime = createDocumentRuntime(fixture(), {
      initialData: { people: [{ id: 'ada', name: 'Ada' }] },
      actions: { refresh: () => Promise.reject(error) },
    })
    const wrapper = mount(DocumentRoot, { props: { runtime, onActionError } })
    runtime.setData({ people: [{ id: 'grace', name: 'Grace' }] })
    await nextTick()
    expect(wrapper.get('ul li').text()).toBe('Grace')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(onActionError).toHaveBeenCalledWith(error)
    wrapper.unmount()
    runtime.destroy()
  })
})

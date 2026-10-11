import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createFormRuntime } from '@texaryn/core'
import type { FormRuntime } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { FormProvider } from '../../context.js'
import { FormRoot } from '../../components/FormRoot.js'
import { createDefaultRegistry } from '../default-registry.js'

const schema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {
    items: { type: 'array', items: { type: 'string' } },
    other: { type: 'array', items: { type: 'string' } },
  },
}

let runtime: FormRuntime | null = null

async function mount(initialData: unknown, canReorder = true): Promise<FormRuntime> {
  const adapter = await createJsonSchemaAdapter(schema)
  runtime = createFormRuntime(adapter, {
    initialData,
    hints: { '/items': { canReorder }, '/other': { canReorder } },
  })
  render(
    <FormProvider value={runtime}>
      <FormRoot registry={createDefaultRegistry()} />
    </FormProvider>,
  )
  return runtime
}

function arrayRoot(index = 0): HTMLElement {
  const root = document.querySelectorAll<HTMLElement>('[data-array-container]')[index]
  if (!root) throw new Error(`no array container at index ${index}`)
  return root
}

function transfer(): DataTransfer {
  const values = new Map<string, string>()
  const types: string[] = []
  return {
    get types() { return types },
    effectAllowed: 'none',
    dropEffect: 'none',
    files: [] as unknown as FileList,
    items: [] as unknown as DataTransferItemList,
    getData: (type: string) => values.get(type) ?? '',
    setData(type: string, value: string) {
      values.set(type, value)
      if (!types.includes(type)) types.push(type)
    },
    clearData(type?: string) {
      if (type === undefined) values.clear()
      else values.delete(type)
      types.splice(0, types.length, ...values.keys())
    },
    setDragImage: () => {},
  } as DataTransfer
}

function drag(type: string, target: Element, dataTransfer: DataTransfer, clientY?: number): void {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
  if (clientY !== undefined) Object.defineProperty(event, 'clientY', { value: clientY })
  target.dispatchEvent(event)
}

afterEach(() => {
  cleanup()
  runtime?.destroy()
  runtime = null
})

describe('array drag reorder', () => {
  it('moves the stable source row to the selected insertion boundary', async () => {
    const form = await mount({ items: ['A', 'B', 'C'], other: [] })
    const root = arrayRoot()
    const rows = [...root.querySelectorAll<HTMLElement>('[data-array-row]')]
    const arrayNode = Object.values(form.document.getSnapshot().nodes).find(
      (node) => node.type === 'container' && node.dataPointer === '/items',
    )
    const sourceId = arrayNode?.type === 'container' ? arrayNode.arrayMeta?.itemIds[0] : undefined
    const dataTransfer = transfer()
    const handle = rows[0]!.querySelector<HTMLElement>('[draggable="true"]')!
    expect(handle.tabIndex).toBe(-1)
    expect(handle.getAttribute('aria-hidden')).toBe('true')
    rows[2]!.getBoundingClientRect = () => ({ top: 0, bottom: 100, height: 100 } as DOMRect)
    drag('dragstart', handle, dataTransfer)
    drag('dragover', rows[2]!, dataTransfer, 75)
    drag('drop', rows[2]!, dataTransfer, 75)

    expect(form.data.getSnapshot()).toEqual({ items: ['B', 'C', 'A'], other: [] })
    const movedArray = Object.values(form.document.getSnapshot().nodes).find(
      (node) => node.type === 'container' && node.dataPointer === '/items',
    )
    expect(movedArray?.type === 'container' ? movedArray.arrayMeta?.itemIds[2] : undefined).toBe(sourceId)
    expect(root.hasAttribute('data-array-drag-active')).toBe(false)
  })

  it('does not move a source row into another array', async () => {
    const form = await mount({ items: ['A', 'B'], other: ['X', 'Y'] })
    const sourceRoot = arrayRoot(0)
    const targetRoot = arrayRoot(1)
    const source = sourceRoot.querySelector<HTMLElement>('[data-array-row]')!
    const target = targetRoot.querySelector<HTMLElement>('[data-array-row]')!
    const dataTransfer = transfer()
    drag('dragstart', source.querySelector('[draggable="true"]')!, dataTransfer)
    drag('dragover', target, dataTransfer, 75)
    drag('drop', target, dataTransfer, 75)

    expect(form.data.getSnapshot()).toEqual({ items: ['A', 'B'], other: ['X', 'Y'] })
  })

  it('clears the drag session before a committed move notifies a throwing subscriber', async () => {
    const form = await mount({ items: ['A', 'B'], other: [] })
    const root = arrayRoot()
    const rows = [...root.querySelectorAll<HTMLElement>('[data-array-row]')]
    const dataTransfer = transfer()
    const errors: unknown[] = []
    const onError = (event: ErrorEvent) => {
      errors.push(event.error)
      event.preventDefault()
    }
    window.addEventListener('error', onError)
    const unsubscribe = form.data.subscribe(() => {
      unsubscribe()
      throw new Error('observer failed after commit')
    })

    drag('dragstart', rows[0]!.querySelector('[draggable="true"]')!, dataTransfer)
    drag('dragover', rows[1]!, dataTransfer, 10)
    drag('drop', rows[1]!, dataTransfer, 10)
    window.removeEventListener('error', onError)

    expect(form.data.getSnapshot()).toEqual({ items: ['B', 'A'], other: [] })
    expect(root.hasAttribute('data-array-drag-active')).toBe(false)
    expect(errors).toHaveLength(1)
  })

  it('renders no drag handles when reordering is not allowed', async () => {
    await mount({ items: ['A'], other: [] }, false)
    expect(arrayRoot().querySelector('[draggable="true"]')).toBeNull()
  })
})

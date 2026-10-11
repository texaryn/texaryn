import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library'
import { englishMessages } from '@texaryn/core'
import type { ContainerNode, ExpandBoundaryContext, FormMessages, FormRuntime, JsonPointer, NodeId, UIDocument } from '@texaryn/core'
import { createDefaultRegistry } from '../src/registry.js'
import { FormContext } from '../src/context.js'
import type { SolidFormContext } from '../src/context.js'
import { ObjectLayout } from '../src/widgets/ObjectLayout.js'

afterEach(cleanup)

function makeContainer(options: { parentId?: NodeId; title?: string; boundaryTargets?: ContainerNode['boundaryTargets'] } = {}) {
  const id = 'container' as NodeId
  const node: ContainerNode = {
    id,
    type: 'container',
    containerType: 'object',
    parentId: options.parentId ?? null,
    dataPointer: '' as JsonPointer,
    order: 0,
    visible: true,
    disabled: false,
    readOnly: false,
    annotations: options.title === undefined ? {} : { title: options.title },
    children: [],
    boundaryTargets: options.boundaryTargets,
  }
  const document: UIDocument = { version: 1, rootId: id, nodes: { [id]: node } }
  const dispatch = vi.fn()
  const form = { dispatch } as unknown as FormRuntime
  const context: SolidFormContext = {
    form: () => form,
    document: () => document,
    registry: () => createDefaultRegistry(),
    messages: () => englishMessages,
    idPrefix: () => 'test',
  }
  return { node, document, dispatch, context }
}

describe('Solid object layout', () => {
  it('deduplicates boundary actions by reason and expands the first target', () => {
    const { node, dispatch, context } = makeContainer({
      title: 'Person',
      boundaryTargets: [
        { pointer: '/child' as JsonPointer, reason: 'recursion', token: 'first-recursion' },
        { pointer: '/other' as JsonPointer, reason: 'recursion', token: 'second-recursion' },
        { pointer: '/items/0' as JsonPointer, reason: 'budget', token: 'budget-target' },
      ],
    })
    context.messages = () => ({ ...englishMessages, expandBoundary: undefined })
    render(() => <FormContext.Provider value={context}><ObjectLayout node={node} /></FormContext.Provider>)

    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label')))
      .toEqual(['Show recursion', 'Show budget'])
    fireEvent.click(screen.getByRole('button', { name: 'Show recursion' }))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'ExpandBoundary',
      containerId: node.id,
      targetToken: 'first-recursion',
    })
  })

  it('uses a localized boundary action message with the container title', () => {
    const { node, context } = makeContainer({
      title: 'Person',
      boundaryTargets: [{ pointer: '/child' as JsonPointer, reason: 'recursion', token: 'child' }],
    })
    const expandBoundary = vi.fn((args: ExpandBoundaryContext) => ({
      label: `Reveal ${args.boundary}`,
      accessibleName: `Reveal ${args.boundary} in ${args.containerTitle}`,
    }))
    const messages: FormMessages = { ...englishMessages, expandBoundary }
    context.messages = () => messages
    context.document = () => ({ version: 1, rootId: node.id, nodes: {} })
    render(() => <FormContext.Provider value={context}><ObjectLayout node={node} /></FormContext.Provider>)

    expect(screen.getByRole('button', { name: 'Reveal recursion in Person' }).textContent).toBe('Reveal recursion')
    expect(expandBoundary).toHaveBeenCalledWith({
      boundary: 'recursion',
      containerTitle: 'Person',
      position: 1,
      count: 1,
    })
  })

  it('renders nested untitled objects as unlabelled fieldsets', () => {
    const { node, context } = makeContainer({ parentId: 'parent' as NodeId })
    const { container } = render(() => <FormContext.Provider value={context}><ObjectLayout node={node} /></FormContext.Provider>)

    expect(container.querySelector('fieldset')?.getAttribute('role')).toBe('none')
    expect(container.querySelector('legend')).toBeNull()
  })
})

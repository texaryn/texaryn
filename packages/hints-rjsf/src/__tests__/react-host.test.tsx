import { describe, it, expect, afterEach } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import React from 'react'
import { createFormRuntime } from '@texaryn/core'
import type { UINode } from '@texaryn/core'
import { FormProvider, FormRoot, createDefaultRegistry } from '@texaryn/react'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { componentTester, fromUiSchema } from '../index.js'

afterEach(() => {
  cleanup()
})

const schema = {
  type: 'object',
  properties: {
    repoUrl: { type: 'string', title: 'Repository' },
    entities: { type: 'array', title: 'Entities', items: { type: 'string' } },
    owners: { type: 'array', title: 'Owners', items: { type: 'string' } },
  },
}

const uiSchema = {
  repoUrl: { 'ui:field': 'RepoUrlPicker', 'ui:options': { allowedHosts: ['github.com'] } },
  entities: { 'ui:field': 'MultiEntityPicker', 'ui:options': { catalogFilter: { kind: ['Component'] } } },
  owners: { items: { 'ui:field': 'OwnerPicker', 'ui:options': { allowedKinds: ['Group'] } } },
}

describe('a React host', () => {
  it('renders a registered component on a field, an array and a row added after mount', async () => {
    const port = await createJsonSchemaAdapter(schema)
    const conversion = fromUiSchema(uiSchema, port.project({ owners: [] }))
    const runtime = createFormRuntime(port, { initialData: { owners: [] } })
    function Probe({ node }: { node: UINode }) {
      const options = { ...conversion.uiSchemaAt(node.dataPointer!)?.options }
      delete options.field
      return <output data-testid={node.dataPointer ?? ''}>{JSON.stringify(options)}</output>
    }
    const registry = createDefaultRegistry()
    for (const name of ['RepoUrlPicker', 'MultiEntityPicker', 'OwnerPicker']) registry.register(componentTester(conversion, name), Probe)
    render(
      <FormProvider value={runtime}>
        <FormRoot registry={registry} />
      </FormProvider>,
    )
    expect(screen.getByTestId('/repoUrl').textContent).toBe('{"allowedHosts":["github.com"]}')
    expect(screen.getByTestId('/entities').textContent).toBe('{"catalogFilter":{"kind":["Component"]}}')
    const owners = Object.values(runtime.document.getSnapshot().nodes).find((node) => node.dataPointer === '/owners')
    act(() => {
      runtime.dispatch({ type: 'InsertItem', containerId: owners!.id, index: 0 })
    })
    expect(screen.getByTestId('/owners/0').textContent).toBe('{"allowedKinds":["Group"]}')
  })
})

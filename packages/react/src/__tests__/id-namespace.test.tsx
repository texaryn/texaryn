import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { createFormRuntime } from '@texaryn/core'
import type { FormRuntime, SchemaEvaluationPort } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { FormContext, FormProvider } from '../context.js'
import { FormRoot } from '../components/FormRoot.js'
import { ErrorSummary } from '../components/ErrorSummary.js'
import { createDefaultRegistry } from '../widgets/index.js'

afterEach(() => {
  cleanup()
})

const registry = createDefaultRegistry()

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Full Name', description: 'Legal name', minLength: 1 },
    address: {
      type: 'object',
      title: 'Address',
      properties: { city: { type: 'string', title: 'City' } },
    },
  },
  required: ['name'],
}

async function makePort(): Promise<SchemaEvaluationPort> {
  return createJsonSchemaAdapter(schema)
}

function Form({ runtime, summary }: { runtime: FormRuntime; summary?: boolean }) {
  return (
    <FormProvider value={runtime}>
      {summary ? <ErrorSummary /> : null}
      <FormRoot registry={registry} />
      <button type="button" onClick={() => runtime.dispatch({ type: 'Submit' })}>
        Submit
      </button>
    </FormProvider>
  )
}

function idsIn(root: HTMLElement): string[] {
  return [...root.querySelectorAll('[id]')].map((el) => el.id)
}

function referencedIds(root: HTMLElement): string[] {
  const out: string[] = []
  for (const el of root.querySelectorAll('[for],[aria-describedby],[aria-labelledby]')) {
    for (const attribute of ['for', 'aria-describedby', 'aria-labelledby']) {
      const value = el.getAttribute(attribute)
      if (value) out.push(...value.split(' ').filter(Boolean))
    }
  }
  return out
}

describe('id namespace', () => {
  it('gives two forms in one React tree disjoint ids', async () => {
    const port = await makePort()
    const a = createFormRuntime(port, { initialData: { name: '', address: { city: '' } } })
    const b = createFormRuntime(port, { initialData: { name: '', address: { city: '' } } })
    const { container } = render(
      <>
        <section data-testid="a"><Form runtime={a} /></section>
        <section data-testid="b"><Form runtime={b} /></section>
      </>,
    )
    await waitFor(() => {
      expect(container.querySelectorAll('input').length).toBeGreaterThan(1)
    })

    const first = screen.getByTestId('a') as HTMLElement
    const second = screen.getByTestId('b') as HTMLElement
    const firstIds = idsIn(first)
    const secondIds = idsIn(second)

    expect(firstIds.length).toBeGreaterThan(0)
    expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([])
    for (const reference of referencedIds(first)) {
      expect(firstIds).toContain(reference)
    }
    for (const reference of referencedIds(second)) {
      expect(secondIds).toContain(reference)
    }
  })

  it('gives one runtime rendered by two providers different ids', async () => {
    const port = await makePort()
    const shared = createFormRuntime(port, { initialData: { name: '', address: { city: '' } } })
    const { container } = render(
      <>
        <section data-testid="a"><Form runtime={shared} /></section>
        <section data-testid="b"><Form runtime={shared} /></section>
      </>,
    )
    await waitFor(() => {
      expect(container.querySelectorAll('input').length).toBeGreaterThan(1)
    })

    const firstIds = idsIn(screen.getByTestId('a') as HTMLElement)
    const secondIds = idsIn(screen.getByTestId('b') as HTMLElement)
    expect(firstIds.length).toBe(secondIds.length)
    expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([])
  })

  it('points each ErrorSummary at its own form after both fail to submit', async () => {
    const port = await makePort()
    const a = createFormRuntime(port, { initialData: { name: '', address: { city: '' } } })
    const b = createFormRuntime(port, { initialData: { name: '', address: { city: '' } } })
    render(
      <>
        <section data-testid="a"><Form runtime={a} summary /></section>
        <section data-testid="b"><Form runtime={b} summary /></section>
      </>,
    )
    const first = screen.getByTestId('a') as HTMLElement
    const second = screen.getByTestId('b') as HTMLElement
    await waitFor(() => {
      expect(first.querySelector('input')).toBeTruthy()
    })

    for (const host of [first, second]) {
      fireEvent.click(host.querySelector('button')!)
    }
    await waitFor(() => {
      expect(second.querySelector('a')).toBeTruthy()
    })

    for (const host of [first, second]) {
      const href = host.querySelector('a')!.getAttribute('href') ?? ''
      const target = document.getElementById(href.slice(1))
      expect(target).not.toBeNull()
      expect(host.contains(target)).toBe(true)
    }
  })

  it('keeps ids stable when the data changes', async () => {
    const port = await makePort()
    const runtime = createFormRuntime(port, { initialData: { name: '', address: { city: '' } } })
    const { container } = render(<Form runtime={runtime} />)
    await waitFor(() => {
      expect(container.querySelector('input')).toBeTruthy()
    })

    const before = idsIn(container)
    const input = screen.getByLabelText(/^Full Name/) as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Alice' } })
    })
    expect(idsIn(container)).toEqual(before)
  })

  it('produces ids usable as a selector without escaping', async () => {
    const port = await makePort()
    const runtime = createFormRuntime(port, { initialData: { name: '', address: { city: '' } } })
    const { container } = render(<Form runtime={runtime} />)
    await waitFor(() => {
      expect(container.querySelector('input')).toBeTruthy()
    })

    const ids = idsIn(container)
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) {
      expect(document.querySelector(`#${id}`)).toBe(document.getElementById(id))
    }
  })

  it('refuses to render under FormContext.Provider, which cannot namespace ids', async () => {
    const port = await makePort()
    const runtime = createFormRuntime(port, { initialData: { name: '', address: { city: '' } } })
    expect(() =>
      render(
        <FormContext.Provider value={runtime}>
          <FormRoot registry={registry} />
        </FormContext.Provider>,
      ),
    ).toThrow(/FormProvider/)
  })

  it('separates independent React roots given distinct identifierPrefix', async () => {
    const port = await makePort()
    const hosts = [document.createElement('div'), document.createElement('div')]
    const roots = hosts.map((host, index) => {
      document.body.appendChild(host)
      return createRoot(host, { identifierPrefix: `root${index}` })
    })

    for (const [index, root] of roots.entries()) {
      const runtime = createFormRuntime(port, { initialData: { name: '', address: { city: '' } } })
      await act(async () => {
        root.render(<Form runtime={runtime} />)
      })
      expect(hosts[index]!.querySelector('input')).toBeTruthy()
    }

    const firstIds = idsIn(hosts[0]!)
    const secondIds = idsIn(hosts[1]!)
    expect(firstIds.length).toBeGreaterThan(0)
    expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([])

    await act(async () => {
      for (const root of roots) root.unmount()
    })
    for (const host of hosts) host.remove()
  })

  it('keeps the instance prefix across a row move while the node part follows the position', async () => {
    const port = await createJsonSchemaAdapter({
      type: 'object',
      properties: {
        rows: { type: 'array', title: 'Rows', items: { type: 'string', title: 'Row' } },
      },
    })
    const runtime = createFormRuntime(port, { initialData: { rows: ['a', 'b'] } })
    const { container } = render(<Form runtime={runtime} />)
    await waitFor(() => {
      expect(container.querySelectorAll('input').length).toBe(2)
    })

    const root = runtime.document.getSnapshot()
    const rootNode = root.nodes[root.rootId as string]
    if (rootNode?.type !== 'container') throw new Error('expected a container root')
    const arrayId = rootNode.children[0]!
    const before = idsIn(container)
    const prefixOf = (id: string) => id.slice(0, id.indexOf('-node_'))

    await act(async () => {
      runtime.dispatch({ type: 'MoveItem', containerId: arrayId, from: 0, to: 1 })
    })

    const after = idsIn(container)
    expect(after).toEqual(before)
    expect(new Set(after.map(prefixOf)).size).toBe(1)
    const ids = new Set(after)
    for (const reference of referencedIds(container)) {
      expect(ids.has(reference)).toBe(true)
    }
  })

  it('hydrates a server render without changing ids', async () => {
    const port = await makePort()
    const runtime = createFormRuntime(port, { initialData: { name: '', address: { city: '' } } })
    const tree = (
      <>
        <section data-testid="a"><Form runtime={runtime} /></section>
        <section data-testid="b"><Form runtime={runtime} /></section>
      </>
    )

    const host = document.createElement('div')
    host.innerHTML = renderToString(tree)
    document.body.appendChild(host)
    const serverIds = idsIn(host)
    expect(serverIds.length).toBeGreaterThan(0)

    const warnings: unknown[] = []
    const originalError = console.error
    console.error = (...args: unknown[]) => { warnings.push(args) }
    const { hydrateRoot } = await import('react-dom/client')
    let root: ReturnType<typeof hydrateRoot>
    await act(async () => {
      root = hydrateRoot(host, tree)
    })
    console.error = originalError

    expect(warnings).toEqual([])
    expect(idsIn(host)).toEqual(serverIds)

    await act(async () => { root!.unmount() })
    host.remove()
  })
})

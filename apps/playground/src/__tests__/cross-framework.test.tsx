import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, waitFor, fireEvent } from '@testing-library/react'
import { useEffect, useState } from 'react'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import type { FormRuntime, SchemaEvaluationPort } from '@texaryn/core'
import {
  useForm,
  FormContext,
  FormRoot,
  createDefaultRegistry,
} from '@texaryn/react'
import { createMuiRegistry } from '@texaryn/react-mui'
import { getExample } from '@texaryn/examples'
import { VueHost } from '../VueHost.js'
import { WcHost } from '../WcHost.js'

const registries = {
  default: createDefaultRegistry(),
  mui: createMuiRegistry(),
}

type ReactSurface = 'default' | 'mui'
type Surface = ReactSurface | 'vue' | 'wc'

const hosts = { vue: VueHost, wc: WcHost }

function isHosted(surface: Surface): surface is 'vue' | 'wc' {
  return surface === 'vue' || surface === 'wc'
}

/**
 * The playground's shape, reduced to the part under test: one React shell
 * owning one runtime, and a preview that swaps render surfaces over it
 * without remounting the form.
 */
function Shell({
  port,
  initialData,
  surface,
  onRuntime,
}: {
  port: SchemaEvaluationPort
  initialData: unknown
  surface: Surface
  onRuntime: (runtime: FormRuntime) => void
}) {
  const form = useForm(port, { initialData, validationDebounceMs: 0 })

  useEffect(() => { onRuntime(form.runtime) }, [form.runtime, onRuntime])

  return (
    <FormContext.Provider value={form.runtime}>
      {isHosted(surface) ? (
        (() => {
          const Host = hosts[surface]
          return <Host runtime={form.runtime} />
        })()
      ) : (
        <FormRoot registry={registries[surface]} />
      )}
      {/* Stands in for the inspector: it reads the same runtime, so what it
          shows is evidence about the runtime rather than about the shell. */}
      <pre data-testid="inspector">{JSON.stringify(form.data)}</pre>
    </FormContext.Provider>
  )
}

function Harness({
  port,
  initialData,
  onRuntime,
}: {
  port: SchemaEvaluationPort
  initialData: unknown
  onRuntime: (runtime: FormRuntime) => void
}) {
  const [surface, setSurface] = useState<Surface>('default')
  return (
    <>
      <button type="button" onClick={() => setSurface('default')}>to default</button>
      <button type="button" onClick={() => setSurface('mui')}>to mui</button>
      <button type="button" onClick={() => setSurface('vue')}>to vue</button>
      <button type="button" onClick={() => setSurface('wc')}>to wc</button>
      <Shell port={port} initialData={initialData} surface={surface} onRuntime={onRuntime} />
    </>
  )
}

function textInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector('input[type="text"], input:not([type])')
  if (!input) throw new Error('no text input on the current surface')
  return input as HTMLInputElement
}

function inspector(getByTestId: (id: string) => HTMLElement): unknown {
  return JSON.parse(getByTestId('inspector').textContent ?? 'null')
}

describe('one runtime, several framework render surfaces', () => {
  afterEach(cleanup)

  it('carries data and edits across React and Vue without a second runtime', async () => {
    const example = getExample('basics-string')!
    const port = await createJsonSchemaAdapter(example.schema, {})
    const seen: FormRuntime[] = []

    const { container, getByText, getByTestId } = render(
      <Harness
        port={port}
        initialData={example.initialData}
        onRuntime={(runtime) => { if (!seen.includes(runtime)) seen.push(runtime) }}
      />,
    )

    // React Default
    fireEvent.change(textInput(container), { target: { value: 'Ada' } })
    await waitFor(() => expect(inspector(getByTestId)).toMatchObject({ name: 'Ada' }))

    // To Vue: the value is already there, because there was nothing to carry.
    fireEvent.click(getByText('to vue'))
    await waitFor(() => {
      expect(container.querySelector('[data-testid="vue-host"] input')).not.toBeNull()
    })
    expect(
      (container.querySelector('[data-testid="vue-host"] input') as HTMLInputElement).value,
      'Vue should show what was typed in React',
    ).toBe('Ada')

    // Edit in Vue, and the React inspector sees it.
    const vueInput = container.querySelector('[data-testid="vue-host"] input') as HTMLInputElement
    vueInput.value = 'Grace'
    vueInput.dispatchEvent(new Event('input'))
    await waitFor(() => expect(inspector(getByTestId)).toMatchObject({ name: 'Grace' }))

    // To MUI
    fireEvent.click(getByText('to mui'))
    await waitFor(() => {
      expect(container.querySelector('[data-testid="vue-host"]')).toBeNull()
    })
    expect(textInput(container).value, 'MUI should show the Vue edit').toBe('Grace')

    // Back to Vue
    fireEvent.click(getByText('to vue'))
    await waitFor(() => {
      expect(container.querySelector('[data-testid="vue-host"] input')).not.toBeNull()
    })
    expect(
      (container.querySelector('[data-testid="vue-host"] input') as HTMLInputElement).value,
    ).toBe('Grace')

    // Identity, not just equality. Data surviving is what a shell that
    // recreated a runtime and reseeded it from current data would also
    // produce. One object across every switch is what rules that out.
    expect(seen, 'exactly one runtime should ever have existed').toHaveLength(1)

    // The direct proof, and the one a reseeded second runtime cannot fake:
    // commanding the React-owned runtime object moves the Vue DOM. Nothing
    // copies state here, so there is only one place this could come from.
    seen[0].dispatch({
      type: 'SetValue',
      nodeId: (seen[0].document.getSnapshot().nodes[
        seen[0].document.getSnapshot().rootId
      ] as { children: string[] }).children[0] as never,
      value: 'Hopper',
    })
    await waitFor(() => {
      expect(
        (container.querySelector('[data-testid="vue-host"] input') as HTMLInputElement).value,
        'the Vue surface should follow the runtime the React shell holds',
      ).toBe('Hopper')
    })
  })

  it('carries data and edits through the Web Components surface too', async () => {
    const example = getExample('basics-string')!
    const port = await createJsonSchemaAdapter(example.schema, {})
    const seen: FormRuntime[] = []

    const { container, getByText, getByTestId } = render(
      <Harness
        port={port}
        initialData={example.initialData}
        onRuntime={(runtime) => { if (!seen.includes(runtime)) seen.push(runtime) }}
      />,
    )

    fireEvent.change(textInput(container), { target: { value: 'Ada' } })
    await waitFor(() => expect(inspector(getByTestId)).toMatchObject({ name: 'Ada' }))

    const wcInput = async (): Promise<HTMLInputElement> => {
      await waitFor(() => {
        expect(container.querySelector('[data-testid="wc-host"] input')).not.toBeNull()
      })
      return container.querySelector('[data-testid="wc-host"] input') as HTMLInputElement
    }

    fireEvent.click(getByText('to wc'))
    expect((await wcInput()).value, 'the element should show what was typed in React').toBe('Ada')

    // Editing in the custom element reaches the React inspector, so the two
    // are reading and writing one runtime rather than two in step.
    const input = await wcInput()
    input.value = 'Grace'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await waitFor(() => expect(inspector(getByTestId)).toMatchObject({ name: 'Grace' }))

    // Vue sees the edit made through the custom element.
    fireEvent.click(getByText('to vue'))
    await waitFor(() => {
      expect(container.querySelector('[data-testid="vue-host"] input')).not.toBeNull()
    })
    expect(
      (container.querySelector('[data-testid="vue-host"] input') as HTMLInputElement).value,
    ).toBe('Grace')

    // Back to the element, then command the runtime the React shell holds and
    // watch the element answer. A host that built its own runtime could not.
    fireEvent.click(getByText('to wc'))
    expect((await wcInput()).value).toBe('Grace')
    expect(seen, 'exactly one runtime should ever have existed').toHaveLength(1)

    const snapshot = seen[0].document.getSnapshot()
    seen[0].dispatch({
      type: 'SetValue',
      nodeId: (snapshot.nodes[snapshot.rootId] as { children: string[] }).children[0] as never,
      value: 'Hopper',
    })
    await waitFor(async () => {
      expect((await wcInput()).value).toBe('Hopper')
    })
  })

  it('leaves the runtime alive when the custom element is removed', async () => {
    const example = getExample('basics-string')!
    const port = await createJsonSchemaAdapter(example.schema, {})
    const seen: FormRuntime[] = []

    const { container, getByText } = render(
      <Harness
        port={port}
        initialData={example.initialData}
        onRuntime={(runtime) => { if (!seen.includes(runtime)) seen.push(runtime) }}
      />,
    )
    await waitFor(() => expect(seen).toHaveLength(1))
    const runtime = seen[0]

    fireEvent.click(getByText('to wc'))
    await waitFor(() => {
      expect(container.querySelector('[data-testid="wc-host"] input')).not.toBeNull()
    })
    fireEvent.click(getByText('to default'))
    await waitFor(() => expect(container.querySelector('[data-testid="wc-host"]')).toBeNull())

    // The element is in borrowed mode, so removing it disposes what it built
    // and nothing else. A destroyed runtime would keep no node state.
    const snapshot = runtime.document.getSnapshot()
    const nameId = (snapshot.nodes[snapshot.rootId] as { children: string[] }).children[0]
    expect(runtime.getNodeState(nameId as never), 'the runtime should still be usable').toBeDefined()

    fireEvent.change(textInput(container), { target: { value: 'still works' } })
    await waitFor(() =>
      expect(runtime.data.getSnapshot()).toMatchObject({ name: 'still works' }),
    )
  })

  it('holds the same port and runtime objects across every switch', async () => {
    const example = getExample('basics-object')!
    const port = await createJsonSchemaAdapter(example.schema, {})
    const seen: FormRuntime[] = []

    const { getByText } = render(
      <Harness
        port={port}
        initialData={example.initialData}
        onRuntime={(runtime) => { if (!seen.includes(runtime)) seen.push(runtime) }}
      />,
    )
    await waitFor(() => expect(seen).toHaveLength(1))

    const runtimeBefore = seen[0]
    const portBefore = port

    fireEvent.click(getByText('to vue'))
    await waitFor(() => expect(document.querySelector('[data-testid="vue-host"]')).not.toBeNull())
    fireEvent.click(getByText('to mui'))
    await waitFor(() => expect(document.querySelector('[data-testid="vue-host"]')).toBeNull())
    fireEvent.click(getByText('to vue'))
    await waitFor(() => expect(document.querySelector('[data-testid="vue-host"]')).not.toBeNull())

    expect(seen[seen.length - 1]).toBe(runtimeBefore)
    expect(port).toBe(portBefore)
    expect(seen).toHaveLength(1)

    // Counting runtimes the shell reports is not enough on its own: a Vue
    // host that built a second one would never be counted here, and this
    // test passed while exactly that was happening. Commanding the object
    // the shell holds and watching the Vue DOM answer is what closes it.
    const document_ = runtimeBefore.document.getSnapshot()
    const firstFieldId = (document_.nodes[document_.rootId] as { children: string[] }).children[0]
    runtimeBefore.dispatch({ type: 'SetValue', nodeId: firstFieldId as never, value: 'Katherine' })

    await waitFor(() => {
      const vueInput = document.querySelector(
        '[data-testid="vue-host"] input',
      ) as HTMLInputElement | null
      expect(
        vueInput?.value,
        'the Vue surface must be reading the runtime the shell holds',
      ).toBe('Katherine')
    })
  })

  it('leaves the runtime alive when the Vue application unmounts', async () => {
    const example = getExample('basics-string')!
    const port = await createJsonSchemaAdapter(example.schema, {})
    const seen: FormRuntime[] = []

    const { container, getByText } = render(
      <Harness
        port={port}
        initialData={example.initialData}
        onRuntime={(runtime) => { if (!seen.includes(runtime)) seen.push(runtime) }}
      />,
    )
    await waitFor(() => expect(seen).toHaveLength(1))
    const runtime = seen[0]

    fireEvent.click(getByText('to vue'))
    await waitFor(() => {
      expect(container.querySelector('[data-testid="vue-host"] input')).not.toBeNull()
    })
    fireEvent.click(getByText('to default'))
    await waitFor(() => expect(container.querySelector('[data-testid="vue-host"]')).toBeNull())

    // A destroyed runtime keeps no node state, so this is the observable
    // difference between unmounting the Vue app and destroying what it
    // borrowed.
    const document_ = runtime.document.getSnapshot()
    const nameId = (document_.nodes[document_.rootId] as { children: string[] }).children[0]
    expect(runtime.getNodeState(nameId as never), 'the runtime should still be usable').toBeDefined()

    fireEvent.change(textInput(container), { target: { value: 'still works' } })
    await waitFor(() =>
      expect(runtime.data.getSnapshot()).toMatchObject({ name: 'still works' }),
    )
  })
})

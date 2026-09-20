import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { render, cleanup, act } from '@testing-library/react'
import { FormProvider, FormRoot, useForm } from '@texaryn/react'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import type { FormRuntime } from '@texaryn/core'
import {
  createRegistryWithEntityNamePicker,
  entityNameMessage,
  withEntityNameValidation,
} from './candidate/entity-name-picker.js'

/**
 * The custom field extension acceptance criterion, on the one field the
 * kitchen sink declares as `ui:field: EntityNamePicker`.
 *
 * Two halves, and they went very differently. Registering the component is
 * public API and took no adapter. Giving it its own validation took a wrapper
 * around the port, because nothing lets a widget report a violation.
 */
const step = {
  title: 'Catalog and repo pickers',
  properties: {
    componentName: { title: 'Component name', type: 'string' },
  },
}

const registry = createRegistryWithEntityNamePicker()

function Harness({
  port,
  data,
  onRuntime,
}: {
  port: Parameters<typeof useForm>[0]
  data: unknown
  onRuntime: (runtime: FormRuntime) => void
}) {
  const { runtime } = useForm(port, {
    initialData: data,
    hints: { '/componentName': { widget: 'EntityNamePicker' } },
  })
  onRuntime(runtime)
  return createElement(FormProvider, { value: runtime }, createElement(FormRoot, { registry }))
}

async function build(data: unknown) {
  const base = await createJsonSchemaAdapter(step, { defaultDialect: 'draft-07' })
  const port = withEntityNameValidation(base, ['/componentName'])
  let runtime: FormRuntime | undefined
  const view = render(createElement(Harness, { port, data, onRuntime: (r) => (runtime = r) }))
  return { view, port, runtime: runtime! }
}

describe('a custom field extension', () => {
  it('is selected by a registered widget, through public API alone', async () => {
    const { view } = await build({ componentName: 'checkout' })

    // The MUI text field the extension renders, rather than the generic one:
    // its own markup is the only way to tell from outside, so the extension is
    // identified by the label it sets and by the input carrying the pointer.
    const input = view.container.querySelector('input[name="/componentName"]')
    expect(input).not.toBeNull()
    expect((input as HTMLInputElement).value).toBe('checkout')
    expect(view.container.textContent).toContain('Component name')

    cleanup()
  })

  it('applies its own rule, which the schema does not express', async () => {
    const { port } = await build({ componentName: 'not a valid name!' })

    const result = await port.validate({ componentName: 'not a valid name!' })
    expect(result.valid).toBe(false)
    expect(result.errors.map((e) => `${e.instancePointer}:${e.keyword}`)).toEqual([
      '/componentName:entityName',
    ])

    // The schema alone accepts it: `componentName` is only `type: string`.
    const base = await createJsonSchemaAdapter(step, { defaultDialect: 'draft-07' })
    expect((await base.validate({ componentName: 'not a valid name!' })).valid).toBe(true)

    cleanup()
  })

  it('shows the extension error on the field after a submit', async () => {
    const { view, runtime } = await build({ componentName: 'not a valid name!' })

    await act(async () => {
      runtime.dispatch({ type: 'Submit' })
      await Promise.resolve()
    })

    const visible = runtime.visibleErrors.getSnapshot()
    expect(visible.map((error) => error.pointer)).toEqual(['/componentName'])
    expect(visible[0].errors[0].message).toBe(entityNameMessage)
    expect(view.container.textContent).toContain(entityNameMessage)

    cleanup()
  })

  it('refuses to submit while the extension rule is violated', async () => {
    const base = await createJsonSchemaAdapter(step, { defaultDialect: 'draft-07' })
    const port = withEntityNameValidation(base, ['/componentName'])

    let submitted = false
    let runtime: FormRuntime | undefined
    render(
      createElement(function Gate() {
        const form = useForm(port, {
          initialData: { componentName: 'not a valid name!' },
          hints: { '/componentName': { widget: 'EntityNamePicker' } },
          onSubmit: () => {
            submitted = true
          },
        })
        runtime = form.runtime
        return createElement(
          FormProvider,
          { value: form.runtime },
          createElement(FormRoot, { registry }),
        )
      }),
    )

    await act(async () => {
      runtime!.dispatch({ type: 'Submit' })
      await Promise.resolve()
    })
    expect(submitted).toBe(false)

    cleanup()
  })
})

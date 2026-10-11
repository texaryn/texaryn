import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import type { RendererRegistry, SchemaEvaluationPort, UIHints } from '@texaryn/core'
import { useForm, FormProvider, FormRoot } from '@texaryn/react'
import type { WidgetComponent } from '@texaryn/react'
import { createArrayDragTransfer, dispatchArrayDrag } from './array-drag.js'

export interface RendererConformanceOptions {
  name: string
  createRegistry: () => RendererRegistry<WidgetComponent>
}

export function rendererConformance({ name, createRegistry }: RendererConformanceOptions): void {
  const registry = createRegistry()

  function TestForm({ schema, data, hints }: { schema: unknown; data: unknown; hints?: UIHints }) {
    const [port, setPort] = React.useState<SchemaEvaluationPort | null>(null)
    React.useEffect(() => {
      let cancelled = false
      createJsonSchemaAdapter(schema).then((adapter) => {
        if (!cancelled) setPort(adapter)
      })
      return () => {
        cancelled = true
      }
    }, [schema])
    if (!port) return null
    return <FormInner port={port} data={data} hints={hints} />
  }

  function FormInner({ port, data, hints }: { port: SchemaEvaluationPort; data: unknown; hints?: UIHints }) {
    const form = useForm(port, { initialData: data, hints })
    return (
      <FormProvider value={form.runtime}>
        <FormRoot registry={registry} />
        <pre data-testid="form-data">{JSON.stringify(form.data)}</pre>
      </FormProvider>
    )
  }

  describe(`Conformance (${name}): full pipeline`, () => {
    afterEach(() => {
      cleanup()
    })

    it('renders a simple string field from JSON Schema', async () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Full Name' },
        },
      }
      render(<TestForm schema={schema} data={{ name: 'Alice' }} />)
      await waitFor(() => {
        expect(screen.getByLabelText('Full Name')).toBeTruthy()
      })
      const input = screen.getByLabelText('Full Name') as HTMLInputElement
      expect(input.value).toBe('Alice')
    })

    it('renders multiple field types', async () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name' },
          age: { type: 'integer', title: 'Age' },
          agree: { type: 'boolean', title: 'Agree' },
          role: { type: 'string', title: 'Role', enum: ['dev', 'pm'] },
        },
      }
      render(<TestForm schema={schema} data={{ name: '', age: 0, agree: false, role: 'dev' }} />)
      await waitFor(() => {
        expect(screen.getByLabelText('Name')).toBeTruthy()
      })
      expect((screen.getByLabelText('Age') as HTMLInputElement).getAttribute('type')).toBe('number')
      expect((screen.getByLabelText('Agree') as HTMLInputElement).getAttribute('type')).toBe('checkbox')
      const roleElement = screen.getByLabelText('Role')
      expect(
        roleElement.tagName === 'SELECT' || roleElement.getAttribute('role') === 'combobox',
      ).toBe(true)
    })

    it('typing in a field updates form data', async () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name' },
        },
      }
      render(<TestForm schema={schema} data={{ name: '' }} />)
      await waitFor(() => {
        expect(screen.getByLabelText('Name')).toBeTruthy()
      })
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bob' } })
      await waitFor(() => {
        expect(screen.getByTestId('form-data').textContent).toContain('"name":"Bob"')
      })
    })

    it('typing in a field updates form data under StrictMode', async () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Name' },
        },
      }
      render(
        <React.StrictMode>
          <TestForm schema={schema} data={{ name: '' }} />
        </React.StrictMode>,
      )
      await waitFor(() => {
        expect(screen.getByLabelText('Name')).toBeTruthy()
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
      fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bob' } })
      await waitFor(() => {
        expect(screen.getByTestId('form-data').textContent).toContain('"name":"Bob"')
      })
    })

    it('conditional visibility works end to end', async () => {
      const schema = {
        type: 'object',
        properties: {
          hasAddress: { type: 'boolean', title: 'Has address' },
        },
        if: { properties: { hasAddress: { const: true } } },
        then: {
          properties: {
            street: { type: 'string', title: 'Street' },
          },
        },
      }
      render(<TestForm schema={schema} data={{ hasAddress: false }} />)
      await waitFor(() => {
        expect(screen.getByLabelText('Has address')).toBeTruthy()
      })
      expect(screen.queryByLabelText('Street')).toBeNull()
      fireEvent.click(screen.getByLabelText('Has address'))
      await waitFor(() => {
        expect(screen.getByLabelText('Street')).toBeTruthy()
      })
    })

    it('renders nested objects', async () => {
      const schema = {
        type: 'object',
        properties: {
          address: {
            type: 'object',
            title: 'Address',
            properties: {
              city: { type: 'string', title: 'City' },
            },
          },
        },
      }
      render(<TestForm schema={schema} data={{ address: { city: 'Paris' } }} />)
      await waitFor(() => {
        expect(screen.getByLabelText('City')).toBeTruthy()
      })
      const input = screen.getByLabelText('City') as HTMLInputElement
      expect(input.value).toBe('Paris')
    })

    it('restores focus to the row controls when a row moves at either boundary', async () => {
      const schema = {
        type: 'object',
        properties: {
          rows: {
            type: 'array',
            title: 'Rows',
            items: {
              type: 'object',
              title: 'Row',
              properties: {
                name: { type: 'string', title: 'Name' },
                tags: {
                  type: 'array',
                  title: 'Tags',
                  items: { type: 'string', title: 'Tag' },
                },
              },
            },
          },
        },
      }
      const hints: UIHints = {
        '/rows': { canReorder: true },
        '/rows/0/tags': { canReorder: true },
        '/rows/1/tags': { canReorder: true },
      }
      render(
        <TestForm
          schema={schema}
          data={{ rows: [{ name: 'First', tags: ['a', 'b'] }, { name: 'Second', tags: ['c', 'd'] }] }}
          hints={hints}
        />,
      )

      const movedDown = await screen.findByRole('button', { name: 'Move down Row 1 in Rows' })
      const row = movedDown.closest<HTMLElement>('[data-array-row]')!
      movedDown.focus()
      fireEvent.click(movedDown)
      await waitFor(() => {
        const rowUp = row.querySelector<HTMLButtonElement>(':scope > [data-reorder-direction="up"]')
        expect(document.activeElement).toBe(rowUp)
      })

      const movedUp = screen.getByRole('button', { name: 'Move up Row 2 in Rows' })
      movedUp.focus()
      fireEvent.click(movedUp)
      await waitFor(() => {
        const rowDown = row.querySelector<HTMLButtonElement>(':scope > [data-reorder-direction="down"]')
        expect(document.activeElement).toBe(rowDown)
      })
    })

    it('reorders a stable row through the native drag handle', async () => {
      const schema = {
        type: 'object',
        properties: { people: { type: 'array', items: { type: 'string' } } },
      }
      render(
        <TestForm
          schema={schema}
          data={{ people: ['Ada', 'Grace', 'Lin'] }}
          hints={{ '/people': { canReorder: true } }}
        />,
      )
      const root = await waitFor(() => {
        const found = document.querySelector<HTMLElement>('[data-array-container]')
        expect(found).not.toBeNull()
        return found!
      })
      const rows = [...root.querySelectorAll<HTMLElement>('[data-array-row]')]
      const transfer = createArrayDragTransfer()
      rows[0]!.getBoundingClientRect = () => ({ top: 0, bottom: 100, height: 100 } as DOMRect)

      dispatchArrayDrag('dragstart', rows[1]!.querySelector('[draggable="true"]')!, transfer)
      dispatchArrayDrag('dragover', rows[0]!, transfer, 10)
      dispatchArrayDrag('drop', rows[0]!, transfer, 10)

      await waitFor(() => {
        expect(screen.getByTestId('form-data').textContent).toContain('"people":["Grace","Ada","Lin"]')
      })
    })
  })
}

import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import type { RendererRegistry, SchemaEvaluationPort } from '@texaryn/core'
import { useForm, FormContext, FormRoot } from '@texaryn/react'
import type { WidgetComponent } from '@texaryn/react'

export interface RendererConformanceOptions {
  name: string
  createRegistry: () => RendererRegistry<WidgetComponent>
}

export function rendererConformance({ name, createRegistry }: RendererConformanceOptions): void {
  const registry = createRegistry()

  function TestForm({ schema, data }: { schema: unknown; data: unknown }) {
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
    return <FormInner port={port} data={data} />
  }

  function FormInner({ port, data }: { port: SchemaEvaluationPort; data: unknown }) {
    const form = useForm(port, { initialData: data })
    return (
      <FormContext.Provider value={form.runtime}>
        <FormRoot registry={registry} />
        <pre data-testid="form-data">{JSON.stringify(form.data)}</pre>
      </FormContext.Provider>
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
      expect(screen.getByLabelText('Role').tagName).toBe('SELECT')
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
  })
}

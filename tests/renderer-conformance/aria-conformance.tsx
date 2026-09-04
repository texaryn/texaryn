import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import type { RendererRegistry, SchemaEvaluationPort } from '@texaryn/core'
import { useForm, FormContext, FormRoot, ErrorSummary } from '@texaryn/react'
import type { WidgetComponent } from '@texaryn/react'

export interface AriaConformanceOptions {
  name: string
  createRegistry: () => RendererRegistry<WidgetComponent>
}

export function ariaConformance({ name, createRegistry }: AriaConformanceOptions): void {
  const registry = createRegistry()

  const requiredStringSchema = {
    type: 'object',
    properties: {
      name: { type: 'string', title: 'Full Name', description: 'Your legal name', minLength: 1 },
    },
    required: ['name'],
  }

  function TestForm({
    schema,
    data,
    hints,
    showSummary,
  }: {
    schema: unknown
    data: unknown
    hints?: Record<string, { validationTrigger?: 'blur' | 'change' | 'submit' }>
    showSummary?: boolean
  }) {
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
    return <FormInner port={port} data={data} hints={hints} showSummary={showSummary} />
  }

  function FormInner({
    port,
    data,
    hints,
    showSummary,
  }: {
    port: SchemaEvaluationPort
    data: unknown
    hints?: Record<string, { validationTrigger?: 'blur' | 'change' | 'submit' }>
    showSummary?: boolean
  }) {
    const form = useForm(port, { initialData: data, hints })
    return (
      <FormContext.Provider value={form.runtime}>
        {showSummary ? <ErrorSummary /> : null}
        <FormRoot registry={registry} />
      </FormContext.Provider>
    )
  }

  describe(`ARIA conformance (${name}): error display policy`, () => {
    afterEach(() => {
      cleanup()
    })

    it('untouched invalid field: no aria-invalid, no error shown', async () => {
      render(
        <TestForm
          schema={requiredStringSchema}
          data={{ name: '' }}
          hints={{ '/name': { validationTrigger: 'blur' } }}
        />,
      )
      await waitFor(() => {
        expect(screen.getByLabelText('Full Name')).toBeTruthy()
      })
      const input = screen.getByLabelText('Full Name')
      expect(input.getAttribute('aria-invalid')).toBeNull()
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('touched invalid field: aria-invalid present, error rendered, aria-describedby includes error id', async () => {
      render(
        <TestForm
          schema={requiredStringSchema}
          data={{ name: '' }}
          hints={{ '/name': { validationTrigger: 'blur' } }}
        />,
      )
      await waitFor(() => {
        expect(screen.getByLabelText('Full Name')).toBeTruthy()
      })
      const input = screen.getByLabelText('Full Name')
      fireEvent.blur(input)
      await waitFor(() => {
        expect(input.getAttribute('aria-invalid')).toBe('true')
      })
      const errorContainer = screen.getByRole('alert')
      expect(errorContainer).toBeTruthy()
      const describedBy = input.getAttribute('aria-describedby') ?? ''
      expect(describedBy).toContain(errorContainer.id)
    })

    it('touched valid field: no aria-invalid, no error', async () => {
      render(
        <TestForm
          schema={requiredStringSchema}
          data={{ name: 'Alice' }}
          hints={{ '/name': { validationTrigger: 'blur' } }}
        />,
      )
      await waitFor(() => {
        expect(screen.getByLabelText('Full Name')).toBeTruthy()
      })
      const input = screen.getByLabelText('Full Name')
      fireEvent.blur(input)
      await waitFor(() => {
        expect(input.getAttribute('aria-invalid')).toBeNull()
      })
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('errors clear when valid data entered after touched-invalid', async () => {
      render(
        <TestForm
          schema={requiredStringSchema}
          data={{ name: '' }}
          hints={{ '/name': { validationTrigger: 'blur' } }}
        />,
      )
      await waitFor(() => {
        expect(screen.getByLabelText('Full Name')).toBeTruthy()
      })
      const input = screen.getByLabelText('Full Name')

      fireEvent.blur(input)
      await waitFor(() => {
        expect(input.getAttribute('aria-invalid')).toBe('true')
      })

      fireEvent.change(input, { target: { value: 'Alice' } })
      fireEvent.blur(input)
      await waitFor(() => {
        expect(input.getAttribute('aria-invalid')).toBeNull()
      })
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('description preserved in aria-describedby alongside error', async () => {
      render(
        <TestForm
          schema={requiredStringSchema}
          data={{ name: '' }}
          hints={{ '/name': { validationTrigger: 'blur' } }}
        />,
      )
      await waitFor(() => {
        expect(screen.getByLabelText('Full Name')).toBeTruthy()
      })
      const input = screen.getByLabelText('Full Name')

      const describedByBefore = input.getAttribute('aria-describedby') ?? ''
      expect(describedByBefore).toMatch(/texaryn-.*-description/)
      expect(describedByBefore).not.toMatch(/texaryn-.*-error/)

      fireEvent.blur(input)
      await waitFor(() => {
        expect(input.getAttribute('aria-invalid')).toBe('true')
      })
      const describedByAfter = input.getAttribute('aria-describedby') ?? ''
      expect(describedByAfter).toMatch(/texaryn-.*-description/)
      expect(describedByAfter).toMatch(/texaryn-.*-error/)
    })

    it('FieldErrors DOM id matches aria-describedby reference', async () => {
      render(
        <TestForm
          schema={requiredStringSchema}
          data={{ name: '' }}
          hints={{ '/name': { validationTrigger: 'blur' } }}
        />,
      )
      await waitFor(() => {
        expect(screen.getByLabelText('Full Name')).toBeTruthy()
      })
      const input = screen.getByLabelText('Full Name')
      fireEvent.blur(input)
      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeTruthy()
      })
      const errorContainer = screen.getByRole('alert')
      const describedBy = input.getAttribute('aria-describedby') ?? ''
      const ids = describedBy.split(' ')
      expect(ids).toContain(errorContainer.id)
    })

    it('ErrorSummary renders visible errors with anchor links', async () => {
      render(
        <TestForm
          schema={requiredStringSchema}
          data={{ name: '' }}
          hints={{ '/name': { validationTrigger: 'blur' } }}
          showSummary
        />,
      )
      await waitFor(() => {
        expect(screen.getByLabelText('Full Name')).toBeTruthy()
      })
      const input = screen.getByLabelText('Full Name')
      fireEvent.blur(input)
      await waitFor(() => {
        expect(screen.getByRole('link')).toBeTruthy()
      })
      const link = screen.getByRole('link')
      expect(link.getAttribute('href')).toMatch(/^#texaryn-.*-input$/)
      expect(link.textContent).toBe('Full Name')
    })

    it('ErrorSummary is empty when no touched-invalid fields', async () => {
      render(
        <TestForm
          schema={requiredStringSchema}
          data={{ name: '' }}
          hints={{ '/name': { validationTrigger: 'blur' } }}
          showSummary
        />,
      )
      await waitFor(() => {
        expect(screen.getByLabelText('Full Name')).toBeTruthy()
      })
      const alerts = screen.queryAllByRole('alert')
      expect(alerts).toHaveLength(0)
    })
  })
}

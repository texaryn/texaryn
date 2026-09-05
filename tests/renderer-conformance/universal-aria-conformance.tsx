import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import type { RendererRegistry, SchemaEvaluationPort } from '@texaryn/core'
import { useForm, FormContext, FormRoot, ErrorSummary } from '@texaryn/react'
import type { WidgetComponent } from '@texaryn/react'

export interface UniversalAriaOptions {
  name: string
  createRegistry: () => RendererRegistry<WidgetComponent>
}

export function universalAriaConformance({ name, createRegistry }: UniversalAriaOptions): void {
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
    showSubmit,
  }: {
    schema: unknown
    data: unknown
    hints?: Record<string, { validationTrigger?: 'blur' | 'change' | 'submit' }>
    showSummary?: boolean
    showSubmit?: boolean
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
    return <FormInner port={port} data={data} hints={hints} showSummary={showSummary} showSubmit={showSubmit} />
  }

  function FormInner({
    port,
    data,
    hints,
    showSummary,
    showSubmit,
  }: {
    port: SchemaEvaluationPort
    data: unknown
    hints?: Record<string, { validationTrigger?: 'blur' | 'change' | 'submit' }>
    showSummary?: boolean
    showSubmit?: boolean
  }) {
    const form = useForm(port, { initialData: data, hints })
    return (
      <FormContext.Provider value={form.runtime}>
        {showSummary ? <ErrorSummary /> : null}
        <FormRoot registry={registry} />
        {showSubmit ? (
          <button type="button" onClick={() => form.dispatch({ type: 'Submit' })}>
            Submit
          </button>
        ) : null}
      </FormContext.Provider>
    )
  }

  describe(`Universal ARIA conformance (${name})`, () => {
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

    it('failed Submit: untouched invalid field gets aria-invalid, an alert and a summary link', async () => {
      render(
        <TestForm schema={requiredStringSchema} data={{ name: '' }} showSummary showSubmit />,
      )
      await waitFor(() => {
        expect(screen.getByLabelText('Full Name')).toBeTruthy()
      })
      const input = screen.getByLabelText('Full Name')
      expect(input.getAttribute('aria-invalid')).toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Submit' }))
      await waitFor(() => {
        expect(input.getAttribute('aria-invalid')).toBe('true')
      })
      expect(screen.getAllByRole('alert').length).toBeGreaterThan(0)
      const link = screen.getByRole('link')
      const href = link.getAttribute('href') ?? ''
      expect(document.getElementById(href.slice(1))).toBe(input)
    })

    it('touched invalid field: aria-invalid present, error rendered as alert', async () => {
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
    })

    it('aria-describedby references rendered inline feedback', async () => {
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
      const describedBy = input.getAttribute('aria-describedby') ?? ''
      expect(describedBy).toContain(errorContainer.id)
    })

    it('every ID in aria-describedby exists in the DOM', async () => {
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
      const describedBy = input.getAttribute('aria-describedby') ?? ''
      for (const id of describedBy.split(' ').filter(Boolean)) {
        expect(document.getElementById(id)).not.toBeNull()
      }
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

    it('ErrorSummary renders visible errors with anchor links to the labelled input', async () => {
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
      const href = link.getAttribute('href') ?? ''
      expect(href.startsWith('#')).toBe(true)
      const target = document.getElementById(href.slice(1))
      expect(target).toBe(input)
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

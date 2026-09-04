import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import React from 'react'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import type { RendererRegistry, SchemaEvaluationPort } from '@texaryn/core'
import { useForm, FormContext, FormRoot } from '@texaryn/react'
import type { WidgetComponent } from '@texaryn/react'

export interface DescriptionPolicyOptions {
  name: string
  createRegistry: () => RendererRegistry<WidgetComponent>
  policy: 'preserve' | 'replace'
}

export function descriptionPolicyConformance({
  name,
  createRegistry,
  policy,
}: DescriptionPolicyOptions): void {
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
  }: {
    schema: unknown
    data: unknown
    hints?: Record<string, { validationTrigger?: 'blur' | 'change' | 'submit' }>
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
    return <FormInner port={port} data={data} hints={hints} />
  }

  function FormInner({
    port,
    data,
    hints,
  }: {
    port: SchemaEvaluationPort
    data: unknown
    hints?: Record<string, { validationTrigger?: 'blur' | 'change' | 'submit' }>
  }) {
    const form = useForm(port, { initialData: data, hints })
    return (
      <FormContext.Provider value={form.runtime}>
        <FormRoot registry={registry} />
      </FormContext.Provider>
    )
  }

  describe(`Description policy conformance (${name}, ${policy})`, () => {
    afterEach(() => {
      cleanup()
    })

    it('description is visible when field is valid', async () => {
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
      expect(screen.getByText('Your legal name')).toBeTruthy()
    })

    if (policy === 'preserve') {
      it('description remains visible alongside error while invalid', async () => {
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

        expect(screen.getByText('Your legal name')).toBeTruthy()
        const describedByAfter = input.getAttribute('aria-describedby') ?? ''
        expect(describedByAfter).toMatch(/texaryn-.*-description/)
        expect(describedByAfter).toMatch(/texaryn-.*-error/)
      })
    }

    if (policy === 'replace') {
      it('first error replaces description while invalid', async () => {
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

        expect(screen.getByText('Your legal name')).toBeTruthy()

        fireEvent.blur(input)
        await waitFor(() => {
          expect(input.getAttribute('aria-invalid')).toBe('true')
        })

        expect(screen.queryByText('Your legal name')).toBeNull()
        expect(screen.getByRole('alert')).toBeTruthy()
      })

      it('description returns when field becomes valid', async () => {
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
        expect(screen.queryByText('Your legal name')).toBeNull()

        fireEvent.change(input, { target: { value: 'Alice' } })
        fireEvent.blur(input)
        await waitFor(() => {
          expect(input.getAttribute('aria-invalid')).toBeNull()
        })
        expect(screen.getByText('Your legal name')).toBeTruthy()
      })
    }
  })
}

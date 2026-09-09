import { FormProvider, FormRoot, useForm } from '@texaryn/react'
import { createMuiRegistry } from '@texaryn/react-mui'
import type { SchemaEvaluationPort, UIHints, FormRuntime } from '@texaryn/core'

const registry = createMuiRegistry()

export interface TexarynStepFormProps {
  port: SchemaEvaluationPort
  initialData?: unknown
  hints?: UIHints
  onSubmit?: (data: unknown) => void
  /** Handed back so a test can dispatch commands and read stores. */
  onRuntime?: (runtime: FormRuntime) => void
}

export function TexarynStepForm({
  port,
  initialData,
  hints,
  onSubmit,
  onRuntime,
}: TexarynStepFormProps) {
  const { runtime } = useForm(port, { initialData, hints, onSubmit })
  onRuntime?.(runtime)

  return (
    <FormProvider value={runtime}>
      <FormRoot registry={registry} />
    </FormProvider>
  )
}

import { FormProvider, FormRoot, useForm } from '@texaryn/react'
import { createMuiRegistry } from '@texaryn/react-mui'
import type { FormRuntime, FormRuntimeOptions, SchemaEvaluationPort, UIHints } from '@texaryn/core'

const registry = createMuiRegistry()

export interface TexarynStepFormProps {
  port: SchemaEvaluationPort
  initialData?: unknown
  hints?: UIHints
  initialization?: FormRuntimeOptions['initialization']
  onSubmit?: (data: unknown) => void
  /** Handed back so a test can dispatch commands and read stores. */
  onRuntime?: (runtime: FormRuntime) => void
}

export function TexarynStepForm({
  port,
  initialData,
  hints,
  initialization,
  onSubmit,
  onRuntime,
}: TexarynStepFormProps) {
  const { runtime } = useForm(port, { initialData, hints, initialization, onSubmit })
  onRuntime?.(runtime)

  return (
    <FormProvider value={runtime}>
      <FormRoot registry={registry} />
    </FormProvider>
  )
}

import { createContext, useContext } from 'react'
import type { FormRuntime } from '@texaryn/core'

export const FormContext = createContext<FormRuntime | null>(null)

export function useFormContext(): FormRuntime {
  const runtime = useContext(FormContext)
  if (!runtime) {
    throw new Error('useFormContext must be used within a FormProvider')
  }
  return runtime
}

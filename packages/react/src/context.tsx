import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { FormRuntime } from '@texaryn/core'
import { IdPrefixProvider, useGeneratedIdPrefix } from './id-prefix.js'

export const FormContext = createContext<FormRuntime | null>(null)

export interface FormProviderProps {
  value: FormRuntime | null
  children?: ReactNode
}

/**
 * The rendering surface, and therefore the DOM namespace, for one form.
 *
 * The prefix is owned here rather than by useForm because one runtime can
 * legitimately be rendered twice; a prefix taken from the runtime would give
 * both surfaces the same ids. It is provided above the children so that
 * siblings of FormRoot, ErrorSummary in particular, resolve the same namespace
 * the fields do.
 */
export function FormProvider({ value, children }: FormProviderProps) {
  const idPrefix = useGeneratedIdPrefix()
  return (
    <FormContext.Provider value={value}>
      <IdPrefixProvider value={idPrefix}>{children}</IdPrefixProvider>
    </FormContext.Provider>
  )
}

export function useFormContext(): FormRuntime {
  const runtime = useContext(FormContext)
  if (!runtime) {
    throw new Error('useFormContext must be used within a FormProvider')
  }
  return runtime
}

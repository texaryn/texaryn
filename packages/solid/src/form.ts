import { createFormRuntime } from '@texaryn/core'
import type { FormRuntime, FormRuntimeOptions, SchemaEvaluationPort } from '@texaryn/core'

export function createForm(port: SchemaEvaluationPort, options?: FormRuntimeOptions): FormRuntime {
  return createFormRuntime(port, options)
}

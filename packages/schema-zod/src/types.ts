import type { JsonPointer, SchemaEvaluationPort, ValidationResult } from '@texaryn/core'

export interface ZodAdapterConfig {
  target?: 'draft-07' | 'draft-2020-12'
  unrepresentable?: 'throw' | 'any'
}

export interface ZodSchemaAdapter extends SchemaEvaluationPort {
  projectSubmission?: never
  validateAt(data: unknown, pointer: JsonPointer): Promise<ValidationResult>
}

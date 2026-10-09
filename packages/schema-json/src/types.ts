import type { SchemaEvaluationPort } from '@texaryn/core'
import type { Dialect } from './dialect.js'

export interface AdapterConfig {
  defaultDialect?: Dialect
}

export interface JsonSchemaAdapter extends SchemaEvaluationPort {
  projectSubmission?: (data: unknown) => unknown
}

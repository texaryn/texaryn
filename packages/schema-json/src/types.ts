import type { SchemaEvaluationPort } from '@texaryn/core'
import type { Dialect } from './dialect.js'

export interface AdapterConfig {
  defaultDialect?: Dialect
}

export interface JsonSchemaAdapter extends SchemaEvaluationPort {
  // No additional public methods beyond the port contract.
  // The adapter IS the port implementation.
}

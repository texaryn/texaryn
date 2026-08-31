import type { SchemaEvaluationPort } from '@texaryn/core'
import type { Dialect } from './dialect.js'

export interface HyperjumpAdapterConfig {
  defaultDialect?: Dialect
}

export interface HyperjumpAdapter extends SchemaEvaluationPort {
  // No additional public methods beyond the port contract.
  // The adapter IS the port implementation.
}

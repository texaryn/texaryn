import type { SchemaEvaluationPort } from '@texaryn/core'
import type { Dialect } from './dialect.js'
import type { SchemaResourceOptions, SchemaResourceResolver } from './resources.js'

export interface HyperjumpAdapterConfig extends SchemaResourceOptions {
  defaultDialect?: Dialect
}

export type { SchemaResourceResolver }

export interface HyperjumpAdapter extends SchemaEvaluationPort {
  // No additional public methods beyond the port contract.
  // The adapter IS the port implementation.
}

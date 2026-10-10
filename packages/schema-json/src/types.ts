import type { SchemaEvaluationPort } from '@texaryn/core'
import type { Dialect } from './dialect.js'
import type { SchemaResourceOptions, SchemaResourceResolver } from './resources.js'

export interface AdapterConfig extends SchemaResourceOptions {
  defaultDialect?: Dialect
}

export type { SchemaResourceResolver }

export interface JsonSchemaAdapter extends SchemaEvaluationPort {
  projectSubmission?: (data: unknown) => unknown
}

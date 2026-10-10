import type { SchemaEvaluationPort } from '@texaryn/core'
import type { Dialect } from './dialect.js'
import type { SchemaResourceOptions, SchemaResourceResolver } from './resources.js'

export interface AdapterConfig extends SchemaResourceOptions {
  defaultDialect?: Dialect
  /** Opt in to dynamic scope aware projection for supported Draft 2019-09 and Draft 2020-12 schemas. */
  dynamicReferenceProjection?: 'local'
}

export type { SchemaResourceResolver }

export interface JsonSchemaAdapter extends SchemaEvaluationPort {
  projectSubmission?: (data: unknown) => unknown
}

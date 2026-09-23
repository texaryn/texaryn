import type { JsonPointer } from '@texaryn/core'
import type { JsonValue } from './json.js'

export type UiSchemaIssueCode =
  | 'unsupported'
  | 'conflict'
  | 'conditional'
  | 'unaddressable'
  | 'unknown-location'
  | 'invalid-value'

export interface UiSchemaIssue {
  readonly code: UiSchemaIssueCode
  readonly key: string
  readonly path: string
  readonly pointer?: JsonPointer
  readonly value?: JsonValue
  readonly message: string
}

export interface ComponentRequirement {
  readonly name: string
  readonly key: 'ui:field' | 'ui:widget'
  readonly path: string
  readonly pointer: JsonPointer
  readonly rows: boolean
}

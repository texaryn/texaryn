import type {
  JsonPointer,
  JsonSchemaType,
  MaybePromise,
  ValidationResult,
} from '../types.js'
import type { FieldConstraints, EnumOption } from '../ir/types.js'

export interface SchemaEvaluationPort {
  project(data: unknown): SchemaProjection

  validate(data: unknown): MaybePromise<ValidationResult>

  validateAt?(
    data: unknown,
    pointer: JsonPointer,
  ): MaybePromise<ValidationResult>
}

export interface SchemaProjection {
  nodes: Map<JsonPointer, NodeProjection>
}

export interface NodeProjection {
  type: JsonSchemaType
  format?: string
  constraints: FieldConstraints
  children?: ChildProjection[]
  enumValues?: EnumOption[]
  active: boolean
  annotations: AnnotationSet
  /**
   * Annotations of an array's item template, for arrays only.
   *
   * A row's own node carries these once it exists, but a renderer needs them
   * before that: an empty array still has an add control to name, and that is
   * where naming it matters most. Optional, so an adapter that cannot supply
   * them stays valid.
   */
  itemAnnotations?: AnnotationSet
}

export interface ChildProjection {
  pointer: JsonPointer
  key: string
  required: boolean
}

export interface AnnotationSet {
  title?: string
  description?: string
  readOnly?: boolean
  writeOnly?: boolean
  deprecated?: boolean
  examples?: unknown[]
  default?: unknown
}

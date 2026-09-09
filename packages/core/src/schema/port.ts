import type { JsonPointer, JsonSchemaType, MaybePromise, ValidationResult } from '../types.js'
import type { FieldConstraints, EnumOption } from '../ir/types.js'

export interface SchemaEvaluationPort {
  project(data: unknown): SchemaProjection

  validate(data: unknown): MaybePromise<ValidationResult>

  validateAt?(data: unknown, pointer: JsonPointer): MaybePromise<ValidationResult>
}

export interface SchemaProjection {
  nodes: Map<JsonPointer, NodeProjection>
  /**
   * Places the adapter could not derive a shape for, and why.
   *
   * A pointer absent from `nodes` renders no field, and without this the caller
   * cannot tell an intentional omission from a schema the adapter did not
   * understand. That distinction is not cosmetic: a schema declaring a field
   * the form silently never collects is the failure mode this exists to make
   * visible.
   *
   * Optional, so an adapter that reports nothing stays valid, and empty rather
   * than absent means "nothing to report".
   */
  diagnostics?: readonly ProjectionDiagnostic[]
}

/**
 * One reason a pointer has no node.
 *
 * `code` is a stable identifier a caller can branch on; `message` is for a
 * person reading a log and is not a contract.
 */
export interface ProjectionDiagnostic {
  pointer: JsonPointer
  code: ProjectionDiagnosticCode
  message: string
}

export type ProjectionDiagnosticCode = 'ambiguous-projection-shape'

export interface NodeProjection {
  /**
   * The shape a renderer should present, which is not an assertion about the
   * instance's JSON Schema type.
   *
   * For a schema declaring `type`, the two coincide. For one that does not,
   * an adapter may still derive a shape from the schema's structural keywords,
   * and doing so changes nothing about validation: `{ properties: {...} }`
   * projects as an object and continues to accept a string, because the object
   * keywords are inapplicable to one.
   */
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

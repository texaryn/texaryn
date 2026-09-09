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
   * Every place the adapter could not choose a shape to render, and why.
   *
   * A pointer absent from `nodes` renders no field, and without this the
   * caller cannot tell an intentional omission from a schema the adapter did
   * not understand. That distinction is not cosmetic: a schema declaring a
   * field the form silently never collects is the failure mode this exists to
   * make visible.
   *
   * The rule the codes divide up: an explicit `type` is used, an unambiguous
   * structural shape is derived, and a schema that yields neither is reported
   * here. Nothing is guessed and no schema disappears without a word.
   *
   * The boundary worth stating, because it is what keeps this channel worth
   * reading: these describe schemas, not data.
   *
   * One case is therefore not reported, and only one: a `oneOf` or `anyOf`
   * whose branches the current value does not match, where some branch would
   * have rendered for a value that did. That same schema projects a shape for
   * such a value, whether the value is acceptable is validation's subject, and
   * a form's data fails to match for most of the time someone is filling it
   * in, so reporting it would mean a diagnostic that flaps on every keystroke.
   *
   * Everything else about a composition is reported, including a branch that
   * the value does match and that still supplies no shape, and a composition
   * with no renderable branch at all. Both are limitations of the adapter
   * rather than states of the data, and being inside a composition does not
   * excuse them.
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

export type ProjectionDiagnosticCode =
  /**
   * The schema declares no `type` and carries keywords belonging to more than
   * one JSON type, so there is no single shape to present. Choosing between
   * them would render a control for a shape the author never committed to.
   */
  | 'ambiguous-projection-shape'
  /**
   * The schema declares no `type` and carries nothing that implies one. An
   * `enum` is the common case, and deliberately not treated as a string:
   * JSON Schema permits heterogeneous members, so `enum` says what the values
   * are and not what type they have.
   */
  | 'unresolved-projection-shape'

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
  /**
   * Whether JSON Schema evaluation says this node applies to the data as it
   * stands. Nothing else: it is an assertion about the schema, not about what a
   * form should show.
   */
  active: boolean
  /**
   * Whether the form exposes this node so the user can complete it, when
   * `active` is false.
   *
   * These are two facts rather than three states, and they are allowed to
   * disagree because that disagreement is the point. A `oneOf` branch the data
   * uniquely identifies but has not yet satisfied does not apply, so `active`
   * is false, and hiding it would leave the user no way to supply the property
   * that would make it apply. `provisional` says the projection has selected
   * that branch for the user to finish.
   *
   * Only meaningful while `active` is false, and absent means false, so an
   * adapter that does not select provisionally keeps its current behaviour.
   */
  provisional?: boolean
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
  /** Whether JSON Schema evaluation demands this property of the current data. */
  required: boolean
  /**
   * Whether the branch the projection provisionally selected demands it.
   *
   * The same split as `NodeProjection.provisional`, for the same reason.
   * Exposing a provisionally selected branch's field while reporting it
   * optional would say the form does not need what the validator will demand
   * the moment the branch applies, which is half a model rather than a
   * conservative one.
   *
   * Absent means false.
   */
  provisionalRequired?: boolean
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

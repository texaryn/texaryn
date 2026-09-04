import type { JsonPointer } from '../types.js'

export interface UIHints {
  [jsonPointer: string]: FieldHints | ArrayHints
}

export interface FieldHints {
  widget?: string
  /**
   * Presentation order among siblings. Lower comes first; a field without one
   * keeps its schema position, and equal values keep schema order. It orders
   * siblings and nothing else: it is not a layout system, and array items are
   * unaffected because their order is their data order.
   */
  order?: number
  placeholder?: string
  helpText?: string
  /**
   * @deprecated Never applied, and not planned. Grid semantics need a layout
   * contract that does not exist yet, and inventing one through a single
   * field would settle that design by accident. Remove in the next major.
   */
  colSpan?: number
  /**
   * @deprecated Never applied. Do not wire this without first deciding what a
   * hidden field does about validation, submission, active state and retained
   * data. Texaryn already has active and inactive semantics from schema
   * evaluation, and a second visibility concept that ignores them would
   * conflict with it. Remove in the next major, or replace it once a
   * visibility contract exists.
   */
  hidden?: boolean
  validationTrigger?: 'blur' | 'change' | 'submit'
}

export interface ArrayHints extends FieldHints {
  itemKey?: JsonPointer
  canReorder?: boolean
}

import type { JsonPointer } from '../types.js'

export interface UIHints {
  [jsonPointer: string]: FieldHints | ArrayHints
}

export interface FieldHints {
  widget?: string
  order?: number
  placeholder?: string
  helpText?: string
  /** @deprecated Never applied. Removed or replaced once Texaryn has a layout contract. */
  colSpan?: number
  /** Not applied yet. Visibility semantics are decided in the UI integration contract. */
  hidden?: boolean
  validationTrigger?: 'blur' | 'change' | 'submit'
}

export interface ArrayHints extends FieldHints {
  itemKey?: JsonPointer
  canReorder?: boolean
}

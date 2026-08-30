import type { JsonPointer } from '../types.js'

export interface UIHints {
  [jsonPointer: string]: FieldHints | ArrayHints
}

export interface FieldHints {
  widget?: string
  order?: number
  placeholder?: string
  helpText?: string
  colSpan?: number
  hidden?: boolean
  validationTrigger?: 'blur' | 'change' | 'submit'
}

export interface ArrayHints extends FieldHints {
  itemKey?: JsonPointer
  canReorder?: boolean
}

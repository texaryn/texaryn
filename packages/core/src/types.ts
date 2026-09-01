export type NodeId = string & { __brand: 'NodeId' }
export type StableItemId = string & { __brand: 'StableItemId' }
export type JsonPointer = string & { __brand: 'JsonPointer' }

export type MaybePromise<T> = T | Promise<T>

export type JsonSchemaType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null'

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

export interface ValidationError {
  instancePointer: string
  keyword: string
  message?: string
  params: Record<string, unknown>
}

export interface VisibleError {
  nodeId: NodeId
  fieldTitle: string | undefined
  pointer: JsonPointer | null
  errors: ValidationError[]
}

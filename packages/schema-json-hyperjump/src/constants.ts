export const CONSTRAINT_KEYS = [
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'pattern',
  'minItems',
  'maxItems',
  'uniqueItems',
] as const

export const ANNOTATION_KEYS = [
  'title',
  'description',
  'readOnly',
  'writeOnly',
  'deprecated',
  'examples',
  'default',
] as const

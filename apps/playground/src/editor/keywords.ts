export type EditorDialect = 'draft-04' | 'draft-07' | '2019-09' | '2020-12'

export interface KeywordInfo {
  name: string
  detail: string
}

const k = (name: string, detail: string): KeywordInfo => ({ name, detail })

const SHARED: readonly KeywordInfo[] = [
  k('$schema', 'dialect URI'),
  k('$ref', 'reference'),
  k('title', 'string'),
  k('description', 'string'),
  k('default', 'any value'),
  k('type', 'type name or list'),
  k('enum', 'array of values'),
  k('properties', 'object of schemas'),
  k('patternProperties', 'object of schemas'),
  k('additionalProperties', 'schema'),
  k('required', 'array of names'),
  k('minProperties', 'integer ≥ 0'),
  k('maxProperties', 'integer ≥ 0'),
  k('items', 'schema'),
  k('minItems', 'integer ≥ 0'),
  k('maxItems', 'integer ≥ 0'),
  k('uniqueItems', 'boolean'),
  k('minLength', 'integer ≥ 0'),
  k('maxLength', 'integer ≥ 0'),
  k('pattern', 'regular expression'),
  k('format', 'format name'),
  k('minimum', 'number'),
  k('maximum', 'number'),
  k('multipleOf', 'number > 0'),
  k('allOf', 'array of schemas'),
  k('anyOf', 'array of schemas'),
  k('oneOf', 'array of schemas'),
  k('not', 'schema'),
]

const DRAFT_04: readonly KeywordInfo[] = [
  ...SHARED,
  k('id', 'base URI'),
  k('definitions', 'object of schemas'),
  k('dependencies', 'object'),
  k('additionalItems', 'schema'),
  k('exclusiveMinimum', 'boolean'),
  k('exclusiveMaximum', 'boolean'),
]

const SINCE_07: readonly KeywordInfo[] = [
  k('$id', 'base URI'),
  k('$comment', 'string'),
  k('const', 'any value'),
  k('contains', 'schema'),
  k('examples', 'array of values'),
  k('propertyNames', 'schema'),
  k('if', 'schema'),
  k('then', 'schema'),
  k('else', 'schema'),
  k('readOnly', 'boolean'),
  k('writeOnly', 'boolean'),
  k('contentMediaType', 'media type'),
  k('contentEncoding', 'encoding'),
  k('exclusiveMinimum', 'number'),
  k('exclusiveMaximum', 'number'),
]

const DRAFT_07: readonly KeywordInfo[] = [
  ...SHARED,
  ...SINCE_07,
  k('definitions', 'object of schemas'),
  k('dependencies', 'object'),
  k('additionalItems', 'schema'),
]

const SINCE_2019: readonly KeywordInfo[] = [
  ...SHARED,
  ...SINCE_07,
  k('$anchor', 'name'),
  k('$defs', 'object of schemas'),
  k('$vocabulary', 'object'),
  k('minContains', 'integer ≥ 0'),
  k('maxContains', 'integer ≥ 0'),
  k('deprecated', 'boolean'),
  k('dependentRequired', 'object of name lists'),
  k('dependentSchemas', 'object of schemas'),
  k('unevaluatedItems', 'schema'),
  k('unevaluatedProperties', 'schema'),
  k('contentSchema', 'schema'),
]

const DRAFT_2019: readonly KeywordInfo[] = [
  ...SINCE_2019,
  k('$recursiveRef', 'reference'),
  k('$recursiveAnchor', 'boolean'),
  k('additionalItems', 'schema'),
]

const DRAFT_2020: readonly KeywordInfo[] = [
  ...SINCE_2019,
  k('$dynamicRef', 'reference'),
  k('$dynamicAnchor', 'name'),
  k('prefixItems', 'array of schemas'),
]

const BY_DIALECT: Record<EditorDialect, readonly KeywordInfo[]> = {
  'draft-04': DRAFT_04,
  'draft-07': DRAFT_07,
  '2019-09': DRAFT_2019,
  '2020-12': DRAFT_2020,
}

export function keywordsFor(dialect: EditorDialect): readonly KeywordInfo[] {
  return BY_DIALECT[dialect]
}

// The adapter assumes draft-07 when a schema declares no $schema.
export function dialectOf(text: string): EditorDialect {
  const declared = /"\$schema"\s*:\s*"([^"]*)"/.exec(text)?.[1] ?? ''
  if (declared.includes('2020-12')) return '2020-12'
  if (declared.includes('2019-09')) return '2019-09'
  if (declared.includes('draft-04')) return 'draft-04'
  return 'draft-07'
}

export const TYPE_VALUES = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'] as const

export const SCHEMA_URIS = [
  'https://json-schema.org/draft/2020-12/schema',
  'https://json-schema.org/draft/2019-09/schema',
  'http://json-schema.org/draft-07/schema#',
  'http://json-schema.org/draft-04/schema#',
] as const

export const FORMATS = [
  'date-time', 'date', 'time', 'duration', 'email', 'idn-email', 'hostname', 'idn-hostname',
  'ipv4', 'ipv6', 'uri', 'uri-reference', 'iri', 'iri-reference', 'uuid', 'uri-template',
  'json-pointer', 'relative-json-pointer', 'regex',
] as const

export const NAME_MAPS: ReadonlySet<string> = new Set([
  'properties',
  'patternProperties',
  '$defs',
  'definitions',
  'dependentSchemas',
])

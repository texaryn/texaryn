import {
  compileSchema,
  type SchemaNode,
  type JsonError,
  type JsonSchema,
  type BooleanSchema,
} from 'json-schema-library'
import type {
  SchemaProjection,
  MaybePromise,
  ValidationResult,
  ValidationError,
  JsonPointer,
} from '@texaryn/core'
import { detectDialect, type Dialect } from './dialect.js'
import { buildProjection } from './projection.js'
import type { AdapterConfig, JsonSchemaAdapter } from './types.js'

export async function createJsonSchemaAdapter(
  schema: unknown,
  config?: AdapterConfig,
): Promise<JsonSchemaAdapter> {
  const dialect = detectDialect(schema, {
    defaultDialect: config?.defaultDialect ?? 'draft-07',
  })

  const prepared = await prepareSchema(schema, dialect)

  return {
    project(data: unknown): SchemaProjection {
      return buildProjection(prepared, data)
    },

    validate(data: unknown): MaybePromise<ValidationResult> {
      return runValidation(prepared, data)
    },

    validateAt(data: unknown, pointer: JsonPointer): MaybePromise<ValidationResult> {
      return runValidationAt(prepared, data, pointer)
    },
  }
}

// json-schema-library's `draft` compile option uses "draft-2019-09"/"draft-2020-12" rather
// than this package's "2019-09"/"2020-12" Dialect values.
function toDraftOption(dialect: Dialect): string {
  return dialect === 'draft-07' ? 'draft-07' : `draft-${dialect}`
}

// compileSchema() is synchronous for schemas with only local $ref (Phase 1's scope); it is
// wrapped in a Promise so the factory signature stays uniform with libraries whose
// preparation step is genuinely async (e.g. hyperjump's annotate()).
async function prepareSchema(schema: unknown, dialect: Dialect): Promise<SchemaNode> {
  // 2020-12 makes `format` an assertion by default in json-schema-library, which is a
  // deviation from the spec (format is annotation-only unless the format-assertion
  // vocabulary is declared). formatAssertion: false restores spec-correct behavior.
  const formatAssertion = dialect === '2020-12' ? false : undefined
  return compileSchema(schema as JsonSchema | BooleanSchema, {
    draft: toDraftOption(dialect),
    formatAssertion,
  })
}

// json-schema-library reports data pointers as "#"-prefixed URI fragments (e.g. "#/age");
// ValidationError.instancePointer expects an RFC 6901 JSON Pointer (e.g. "/age").
function toInstancePointer(jslPointer: string): string {
  return jslPointer === '#' ? '' : jslPointer.replace(/^#/, '')
}

// jsl error codes are kebab-case ("min-length-error"); ValidationError.keyword is expected
// to be the JSON Schema keyword itself ("minLength"). Unrecognized codes fall back to a
// best-effort camelCase conversion of the code with any trailing "-error"/"-warning" removed.
const KEYWORD_BY_CODE: Record<string, string> = {
  'additional-items-error': 'additionalItems',
  'additional-properties-error': 'additionalProperties',
  'all-of-error': 'allOf',
  'any-of-error': 'anyOf',
  'const-error': 'const',
  'contains-any-error': 'contains',
  'contains-array-error': 'contains',
  'contains-error': 'contains',
  'contains-min-error': 'minContains',
  'contains-max-error': 'maxContains',
  'enum-error': 'enum',
  'exclusive-maximum-error': 'exclusiveMaximum',
  'exclusive-minimum-error': 'exclusiveMinimum',
  'forbidden-property-error': 'not',
  'invalid-data-error': 'type',
  'invalid-property-name-error': 'propertyNames',
  'maximum-error': 'maximum',
  'max-items-error': 'maxItems',
  'max-length-error': 'maxLength',
  'max-properties-error': 'maxProperties',
  'minimum-error': 'minimum',
  'min-items-error': 'minItems',
  'min-items-one-error': 'minItems',
  'min-length-error': 'minLength',
  'min-length-one-error': 'minLength',
  'min-properties-error': 'minProperties',
  'missing-array-item-error': 'items',
  'missing-dependency-error': 'dependentRequired',
  'missing-one-of-declarator-error': 'oneOf',
  'missing-one-of-property-error': 'oneOf',
  'multiple-of-error': 'multipleOf',
  'multiple-one-of-error': 'oneOf',
  'no-additional-properties-error': 'additionalProperties',
  'not-error': 'not',
  'one-of-error': 'oneOf',
  'one-of-property-error': 'oneOf',
  'pattern-error': 'pattern',
  'pattern-properties-error': 'patternProperties',
  'ref-error': '$ref',
  'required-property-error': 'required',
  'type-error': 'type',
  'undefined-value-error': 'type',
  'unevaluated-items-error': 'unevaluatedItems',
  'unevaluated-property-error': 'unevaluatedProperties',
  'unique-items-error': 'uniqueItems',
  'unknown-property-error': 'additionalProperties',
  'value-not-empty-error': 'type',
}

function toKeyword(code: string): string {
  const known = KEYWORD_BY_CODE[code]
  if (known) return known
  if (code.startsWith('format-')) return 'format'
  const withoutSuffix = code.replace(/-(error|warning)$/, '')
  return withoutSuffix.replace(/-([a-z0-9])/g, (_, char: string) => char.toUpperCase())
}

function mapValidationError(error: JsonError): ValidationError {
  const code = typeof error.code === 'string' ? error.code : String(error.code)
  const basePointer = typeof error.data?.pointer === 'string' ? error.data.pointer : '#'
  // required-property-error reports the *parent* object's pointer with the missing property
  // name in data.key; consumers expect the error located at the missing property itself.
  const key = (error.data as Record<string, unknown> | undefined)?.key
  const missingKey = code === 'required-property-error' && typeof key === 'string' ? key : undefined
  const pointer = missingKey ? `${basePointer}/${missingKey}` : basePointer
  return {
    instancePointer: toInstancePointer(pointer),
    keyword: toKeyword(code),
    message: error.message,
    params: (error.data ?? {}) as Record<string, unknown>,
  }
}

function runValidation(prepared: SchemaNode, data: unknown): ValidationResult {
  const result = prepared.validate(data)
  return {
    valid: result.valid,
    errors: result.errors.map(mapValidationError),
  }
}

function runValidationAt(
  prepared: SchemaNode,
  data: unknown,
  pointer: JsonPointer,
): ValidationResult {
  const target = pointer as string
  const { valid, errors } = runValidation(prepared, data)
  if (target === '') return { valid, errors }

  const scoped = errors.filter(
    (error) => error.instancePointer === target || error.instancePointer.startsWith(`${target}/`),
  )
  return { valid: scoped.length === 0, errors: scoped }
}

import * as z from 'zod'
import type { ValidationError, ValidationResult } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { validationParameters } from './validation-parameters.js'
import type { ZodAdapterConfig, ZodSchemaAdapter } from './types.js'

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

const privateIssueParams = new WeakMap<ValidationError, Record<string, unknown>>()

export async function createZodAdapter(
  schema: z.ZodType,
  config: ZodAdapterConfig = {},
): Promise<ZodSchemaAdapter> {
  const target = config.target ?? 'draft-2020-12'
  const jsonSchema = z.toJSONSchema(schema, {
    io: 'input',
    target,
    unrepresentable: config.unrepresentable ?? 'throw',
  })
  const projectionAdapter = await createJsonSchemaAdapter(jsonSchema, {
    defaultDialect: target === 'draft-07' ? 'draft-07' : '2020-12',
  })

  return {
    project(data, options) {
      return projectionAdapter.project(data, options)
    },

    validate(data): Promise<ValidationResult> {
      return validateSchema(schema, data)
    },

    async validateAt(data, pointer): Promise<ValidationResult> {
      const result = await validateSchema(schema, data)
      const targetPointer = pointer as string
      if (targetPointer === '') return result

      const errors = result.errors.filter(
        (error) => error.instancePointer === targetPointer || error.instancePointer.startsWith(`${targetPointer}/`),
      )
      return { valid: errors.length === 0, errors }
    },
  }
}

async function validateSchema(schema: z.ZodType, data: unknown): Promise<ValidationResult> {
  const result = await schema.safeParseAsync(data)
  if (result.success) return { valid: true, errors: [] }
  return { valid: false, errors: result.error.issues.flatMap((issue) => toValidationErrors(issue)) }
}

function toValidationErrors(
  issue: z.ZodError['issues'][number],
  parentPath: readonly PropertyKey[] = [],
): ValidationError[] {
  const path = [...parentPath, ...issue.path]
  if (issue.code === 'invalid_union') {
    const branches = issue.errors.map((branch) =>
      branch.flatMap((branchIssue) => toValidationErrors(branchIssue, path)),
    )
    if (branches.some((branch) => branch.length > 0)) return mergeEquivalentBranchErrors(branches)
  }

  return [toValidationError(issue, path)]
}

function toValidationError(
  issue: z.ZodError['issues'][number],
  path: readonly PropertyKey[],
): ValidationError {
  const instancePointer = path
    .map((segment) => `/${escapePointerSegment(String(segment))}`)
    .join('')
  const { path: _path, message: _message, input: _input, ...params } = issue
  const code = issue.code ?? 'custom'
  const keyword = keywordForIssue(code, issue)
  const error: ValidationError = {
    instancePointer,
    keyword,
    message: issue.message,
    params: validationParameters(keyword, params as Record<string, unknown>),
  }
  privateIssueParams.set(error, params as Record<string, unknown>)
  return error
}

function keywordForIssue(code: string, issue: z.ZodError['issues'][number]): string {
  if (code === 'invalid_type') return 'type'
  if (code === 'invalid_format') return 'format'
  if (code === 'invalid_value') {
    return 'values' in issue && issue.values.length === 1 ? 'const' : 'enum'
  }
  if (code === 'unrecognized_keys') return 'additionalProperties'
  if (code === 'not_multiple_of') return 'multipleOf'

  if (code === 'too_small' || code === 'too_big') return keywordForSizeIssue(code, issue)

  return code
}

function keywordForSizeIssue(code: 'too_small' | 'too_big', issue: z.ZodError['issues'][number]): string {
  const origin = 'origin' in issue ? issue.origin : undefined
  const lower = code === 'too_small'
  switch (origin) {
    case 'string': return lower ? 'minLength' : 'maxLength'
    case 'array': return lower ? 'minItems' : 'maxItems'
    case 'object': return lower ? 'minProperties' : 'maxProperties'
  }
  if ('inclusive' in issue && issue.inclusive === false) {
    return lower ? 'exclusiveMinimum' : 'exclusiveMaximum'
  }
  return lower ? 'minimum' : 'maximum'
}

function escapePointerSegment(segment: string): string {
  return segment.replaceAll('~', '~0').replaceAll('/', '~1')
}

function serializeStableArray(value: unknown[], ancestors: WeakSet<object>): string | undefined {
  const items = value.map((item) => stableSerialize(item, ancestors))
  if (items.includes(undefined)) return undefined
  return JSON.stringify(['array', items])
}

function serializeStableRecord(value: object, ancestors: WeakSet<object>): string | undefined {
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return undefined
  const record = value as Record<string, unknown>
  const entries = Object.keys(record)
    .sort(compareCodeUnits)
    .map((key) => [key, stableSerialize(record[key], ancestors)] as const)
  if (entries.some(([, item]) => item === undefined)) return undefined
  return JSON.stringify(['object', prototype === null ? 'null-prototype' : 'plain', entries])
}

function stableSerialize(value: unknown, ancestors = new WeakSet<object>()): string | undefined {
  if (value === null) return JSON.stringify(['null'])
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify([typeof value, value])
  if (typeof value === 'number') {
    const normalized = Object.is(value, -0) ? '-0' : String(value)
    return JSON.stringify(['number', normalized])
  }
  if (typeof value === 'bigint') return JSON.stringify(['bigint', value.toString()])
  if (value === undefined) return JSON.stringify(['undefined'])
  if (typeof value === 'symbol' || typeof value === 'function') return undefined
  if (ancestors.has(value)) return undefined

  ancestors.add(value)
  try {
    return Array.isArray(value)
      ? serializeStableArray(value, ancestors)
      : serializeStableRecord(value, ancestors)
  } finally {
    ancestors.delete(value)
  }
}

function mergeEquivalentBranchErrors(branches: ValidationError[][]): ValidationError[] {
  const result: ValidationError[] = []
  const maxCounts = new Map<string, number>()
  for (const branch of branches) {
    const branchCounts = new Map<string, number>()
    for (const error of branch) {
      const serializedParams = stableSerialize(privateIssueParams.get(error) ?? error.params)
      if (serializedParams === undefined) {
        result.push(error)
        continue
      }
      const key = JSON.stringify([
        error.instancePointer,
        error.keyword,
        error.message,
        serializedParams,
      ])
      const countInBranch = (branchCounts.get(key) ?? 0) + 1
      branchCounts.set(key, countInBranch)
      if (countInBranch > (maxCounts.get(key) ?? 0)) {
        result.push(error)
        maxCounts.set(key, countInBranch)
      }
    }
  }
  return result
}

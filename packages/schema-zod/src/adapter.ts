import * as z from 'zod'
import type { ValidationError, ValidationResult } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import type { ZodAdapterConfig, ZodSchemaAdapter } from './types.js'

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
  return {
    instancePointer,
    keyword: keywordForIssue(code, issue),
    message: issue.message,
    params,
  }
}

function keywordForIssue(code: string, issue: z.ZodError['issues'][number]): string {
  if (code === 'invalid_type') return 'type'
  if (code === 'invalid_format') return 'format'
  if (code === 'invalid_value') {
    return 'values' in issue && issue.values.length === 1 ? 'const' : 'enum'
  }
  if (code === 'unrecognized_keys') return 'additionalProperties'
  if (code === 'not_multiple_of') return 'multipleOf'

  if (code === 'too_small' || code === 'too_big') {
    const origin = 'origin' in issue ? issue.origin : undefined
    const lower = code === 'too_small'
    if (origin === 'string') return lower ? 'minLength' : 'maxLength'
    if (origin === 'array') return lower ? 'minItems' : 'maxItems'
    if ('inclusive' in issue && issue.inclusive === false) {
      return lower ? 'exclusiveMinimum' : 'exclusiveMaximum'
    }
    return lower ? 'minimum' : 'maximum'
  }

  return code
}

function escapePointerSegment(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}

function stableSerialize(value: unknown, ancestors = new WeakSet<object>()): string | undefined {
  if (value === null) return JSON.stringify(['null'])
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify([typeof value, value])
  if (typeof value === 'number') {
    const normalized = Object.is(value, -0) ? '-0' : String(value)
    return JSON.stringify(['number', normalized])
  }
  if (typeof value === 'bigint') return JSON.stringify(['bigint', value.toString()])
  if (typeof value === 'undefined') return JSON.stringify(['undefined'])
  if (typeof value === 'symbol' || typeof value === 'function') return undefined
  if (ancestors.has(value)) return undefined

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      const items = value.map((item) => stableSerialize(item, ancestors))
      if (items.some((item) => item === undefined)) return undefined
      return JSON.stringify(['array', items])
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return undefined
    const record = value as Record<string, unknown>
    const entries = Object.keys(record)
      .sort()
      .map((key) => [key, stableSerialize(record[key], ancestors)] as const)
    if (entries.some(([, item]) => item === undefined)) return undefined
    return JSON.stringify(['object', prototype === null ? 'null-prototype' : 'plain', entries])
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
      const serializedParams = stableSerialize(error.params)
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

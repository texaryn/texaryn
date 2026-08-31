import type { Output, OutputUnit } from '@hyperjump/json-schema'
import type { ValidationResult, ValidationError, JsonPointer } from '@texaryn/core'
import { instancePointerFromUri, keywordNameFromId, schemaFragment, resolveJsonPointer, escapeSegment } from './pointer-utils.js'

function mapError(error: OutputUnit): ValidationError {
  return {
    instancePointer: instancePointerFromUri(error.instanceLocation) as JsonPointer,
    keyword: keywordNameFromId(error.keyword),
    params: {},
  }
}

function normalizeRequiredError(
  error: ValidationError,
  unit: OutputUnit,
  rawSchema: unknown,
  data: unknown,
): ValidationError[] {
  const parentPointer = error.instancePointer as string
  const schemaPointer = schemaFragment(unit.absoluteKeywordLocation)
  const requiredArray = resolveJsonPointer(rawSchema, schemaPointer)
  if (!Array.isArray(requiredArray)) return [error]

  const obj = parentPointer === ''
    ? data
    : resolveJsonPointer(data, parentPointer)
  if (obj === null || obj === undefined || typeof obj !== 'object' || Array.isArray(obj)) {
    return [error]
  }

  const dataKeys = new Set(Object.keys(obj as Record<string, unknown>))
  const missing = (requiredArray as string[]).filter((key) => !dataKeys.has(key))
  if (missing.length === 0) return [error]

  return missing.map((key) => ({
    instancePointer: `${parentPointer}/${escapeSegment(key)}` as JsonPointer,
    keyword: 'required',
    params: {},
  }))
}

export function mapErrors(
  output: Output,
  rawSchema: unknown,
  data: unknown,
): ValidationResult {
  const errors = 'errors' in output ? (output.errors ?? []) : []
  return {
    valid: output.valid,
    errors: errors.flatMap((unit) => {
      const mapped = mapError(unit)
      if (mapped.keyword === 'required') {
        return normalizeRequiredError(mapped, unit, rawSchema, data)
      }
      return [mapped]
    }),
  }
}

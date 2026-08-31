import type { Output, OutputUnit } from '@hyperjump/json-schema'
import type { ValidationResult, ValidationError, JsonPointer } from '@texaryn/core'
import { instancePointerFromUri, keywordNameFromId } from './pointer-utils.js'

// hyperjump's BASIC output format provides { keyword, instanceLocation, absoluteKeywordLocation }
// per error, with no human-readable message. keyword is a full URI
// (https://json-schema.org/keyword/minLength) needing trailing-segment extraction, and
// instanceLocation is a "#"-prefixed JSON Pointer needing that prefix stripped.
function mapError(error: OutputUnit): ValidationError {
  return {
    instancePointer: instancePointerFromUri(error.instanceLocation) as JsonPointer,
    keyword: keywordNameFromId(error.keyword),
    params: {},
  }
}

export function mapErrors(output: Output): ValidationResult {
  const errors = 'errors' in output ? (output.errors ?? []) : []
  return {
    valid: output.valid,
    errors: errors.map(mapError),
  }
}

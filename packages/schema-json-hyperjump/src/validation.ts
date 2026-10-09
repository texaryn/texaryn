import type { Output, OutputUnit } from '@hyperjump/json-schema'
import type { ValidationResult, ValidationError, JsonPointer } from '@texaryn/core'
import { instancePointerFromUri, keywordNameFromId, schemaFragment, resolveJsonPointer, escapeSegment } from './pointer-utils.js'

const SCHEMA_SINGLE = new Set([
  'additionalItems',
  'additionalProperties',
  'contentSchema',
  'contains',
  'else',
  'if',
  'items',
  'not',
  'propertyNames',
  'then',
  'unevaluatedItems',
  'unevaluatedProperties',
])
const SCHEMA_LIST = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems'])
const SCHEMA_MAP = new Set([
  '$defs',
  'definitions',
  'dependencies',
  'dependentSchemas',
  'patternProperties',
  'properties',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function unescapePointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~')
}

function schemaPathSegments(pointer: string): string[] {
  const path = pointer.startsWith('#') ? pointer.slice(1) : pointer
  if (path === '' || path === '#') return []
  return (path.startsWith('/') ? path.slice(1) : path).split('/').map(unescapePointerSegment)
}

function isSchemaPosition(schema: unknown, pointer: string): boolean {
  const segments = schemaPathSegments(pointer)
  const visit = (current: unknown, index: number): boolean => {
    if (index === segments.length) return typeof current === 'boolean' || isRecord(current)
    if (!isRecord(current)) return false

    const keyword = segments[index]!
    if (keyword === 'items' && Array.isArray(current.items)) {
      const itemIndex = Number(segments[index + 1])
      return Number.isInteger(itemIndex) && itemIndex >= 0 && itemIndex < current.items.length && visit(current.items[itemIndex], index + 2)
    }
    if (SCHEMA_SINGLE.has(keyword)) return visit(current[keyword], index + 1)
    if (SCHEMA_LIST.has(keyword)) {
      const branchIndex = Number(segments[index + 1])
      const branches = current[keyword]
      return Array.isArray(branches) && Number.isInteger(branchIndex) && branchIndex >= 0 && branchIndex < branches.length && visit(branches[branchIndex], index + 2)
    }
    if (SCHEMA_MAP.has(keyword)) {
      const key = segments[index + 1]
      const map = current[keyword]
      return key !== undefined && isRecord(map) && Object.hasOwn(map, key) && visit(map[key], index + 2)
    }
    return false
  }

  return visit(schema, 0)
}

function hasSchemaKeyword(schema: unknown, pointer: string, keyword: string): boolean {
  const segments = schemaPathSegments(pointer)
  const visit = (current: unknown, index: number): boolean => {
    if (!isRecord(current) || index >= segments.length) return false

    const segment = segments[index]!
    if (segment === keyword && SCHEMA_SINGLE.has(segment) && current[segment] !== undefined) return true
    if (segment === 'items' && Array.isArray(current.items)) {
      const itemIndex = Number(segments[index + 1])
      return Number.isInteger(itemIndex) && itemIndex >= 0 && itemIndex < current.items.length && visit(current.items[itemIndex], index + 2)
    }
    if (SCHEMA_SINGLE.has(segment)) return visit(current[segment], index + 1)
    if (SCHEMA_LIST.has(segment)) {
      const branchIndex = Number(segments[index + 1])
      const branches = current[segment]
      return Array.isArray(branches) && Number.isInteger(branchIndex) && branchIndex >= 0 && branchIndex < branches.length && visit(branches[branchIndex], index + 2)
    }
    if (SCHEMA_MAP.has(segment)) {
      const key = segments[index + 1]
      const map = current[segment]
      return key !== undefined && isRecord(map) && Object.hasOwn(map, key) && visit(map[key], index + 2)
    }
    return false
  }

  return visit(schema, 0)
}

function decodePointerFragment(pointer: string): string {
  return pointer.split('/').map((segment) => {
    try {
      return decodeURIComponent(segment).replace(/\//g, '~1')
    } catch {
      return segment
    }
  }).join('/')
}

function propertyNamesParentPointer(instanceLocation: string): string | undefined {
  const hashIndex = instanceLocation.indexOf('#')
  const fragment = hashIndex === -1 ? '' : instanceLocation.slice(hashIndex + 1)
  if (!fragment.startsWith('*')) return undefined
  const pointer = fragment.slice(1)
  const separator = pointer.lastIndexOf('/')
  return separator < 0 ? '' : decodePointerFragment(pointer.slice(0, separator))
}

function mapError(error: OutputUnit, rawSchema: unknown): ValidationError {
  const schemaPointer = schemaFragment(error.absoluteKeywordLocation)
  const propertyNamesPointer = hasSchemaKeyword(rawSchema, schemaPointer, 'propertyNames')
    ? propertyNamesParentPointer(error.instanceLocation)
    : undefined
  if (propertyNamesPointer !== undefined) {
    return {
      instancePointer: propertyNamesPointer as JsonPointer,
      keyword: 'propertyNames',
      params: {},
    }
  }

  const keyword = keywordNameFromId(error.keyword)
  const schema = resolveJsonPointer(rawSchema, schemaPointer)
  const schemaParentPointer = schemaPointer.slice(0, schemaPointer.lastIndexOf('/'))
  const parentSchema = resolveJsonPointer(rawSchema, schemaParentPointer)
  const instancePointer = instancePointerFromUri(error.instanceLocation)
  if (
    keyword === 'validate' &&
    schema === false &&
    schemaPointer.endsWith('/items') &&
    isSchemaPosition(rawSchema, schemaParentPointer) &&
    isRecord(parentSchema) &&
    parentSchema.items === false &&
    'prefixItems' in parentSchema
    && Array.isArray(parentSchema.prefixItems)
  ) {
    const lastSeparator = instancePointer.lastIndexOf('/')
    return {
      instancePointer: (lastSeparator < 0 ? '' : instancePointer.slice(0, lastSeparator)) as JsonPointer,
      keyword: 'type',
      params: {},
    }
  }

  return {
    instancePointer: instancePointer as JsonPointer,
    keyword,
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
      const mapped = mapError(unit, rawSchema)
      if (mapped.keyword === 'required') {
        return normalizeRequiredError(mapped, unit, rawSchema, data)
      }
      return [mapped]
    }),
  }
}

import type { Dialect } from './dialect.js'

export const SINGLE: Record<Dialect, ReadonlySet<string>> = {
  'draft-04': new Set(['additionalItems', 'additionalProperties', 'items', 'not']),
  'draft-07': new Set([
    'additionalItems',
    'additionalProperties',
    'contains',
    'else',
    'if',
    'items',
    'not',
    'propertyNames',
    'then',
  ]),
  '2019-09': new Set([
    'additionalItems',
    'additionalProperties',
    'contains',
    'contentSchema',
    'else',
    'if',
    'items',
    'not',
    'propertyNames',
    'then',
    'unevaluatedItems',
    'unevaluatedProperties',
  ]),
  '2020-12': new Set([
    'additionalProperties',
    'contains',
    'contentSchema',
    'else',
    'if',
    'items',
    'not',
    'propertyNames',
    'then',
    'unevaluatedItems',
    'unevaluatedProperties',
  ]),
}

export const LIST: Record<Dialect, ReadonlySet<string>> = {
  'draft-04': new Set(['allOf', 'anyOf', 'items', 'oneOf']),
  'draft-07': new Set(['allOf', 'anyOf', 'oneOf']),
  '2019-09': new Set(['allOf', 'anyOf', 'oneOf']),
  '2020-12': new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']),
}

export const MAP: Record<Dialect, ReadonlySet<string>> = {
  'draft-04': new Set(['definitions', 'dependencies', 'patternProperties', 'properties']),
  'draft-07': new Set(['$defs', 'definitions', 'dependencies', 'patternProperties', 'properties']),
  '2019-09': new Set(['$defs', 'definitions', 'dependencies', 'dependentSchemas', 'patternProperties', 'properties']),
  '2020-12': new Set(['$defs', 'definitions', 'dependencies', 'dependentSchemas', 'patternProperties', 'properties']),
}

export const DEFINITION_KEYS: Record<Dialect, readonly string[]> = {
  'draft-04': ['definitions'],
  'draft-07': ['$defs', 'definitions'],
  '2019-09': ['definitions', '$defs'],
  '2020-12': ['definitions', '$defs'],
}

import { registerSchema as registerSchema2020 } from '@hyperjump/json-schema/draft-2020-12'
import { registerSchema as registerSchema201909 } from '@hyperjump/json-schema/draft-2019-09'
import { registerSchema as registerSchema07 } from '@hyperjump/json-schema/draft-07'
import { compile, getSchema, interpret, BASIC } from '@hyperjump/json-schema/experimental'
import * as Instance from '@hyperjump/json-schema/instance/experimental'
import type { Output } from '@hyperjump/json-schema'
import type { SchemaProjection, ValidationResult } from '@texaryn/core'
import { detectDialect, type Dialect } from './dialect.js'
import { buildProjection, DEFAULT_LIMITS } from './projection.js'
import { buildSchemaGraph, rejectSameLocationCycles, cyclicPositions } from './schema-graph.js'
import { newProjectionCache, type ProjectionLimits } from './static-walk.js'
import { toJsonInstance } from './json-instance.js'
import { mapErrors } from './validation.js'
import type { HyperjumpAdapterConfig, HyperjumpAdapter } from './types.js'

const registerByDialect: Record<Dialect, typeof registerSchema2020> = {
  'draft-07': registerSchema07,
  '2019-09': registerSchema201909,
  '2020-12': registerSchema2020,
}

// hyperjump determines a schema's dialect from its own `$schema`, and the
// per-dialect entry points above only load vocabularies: they carry no default.
// A schema that omits `$schema` is therefore rejected outright unless the
// dialect is named at registration, which is the third argument.
const dialectIds: Record<Dialect, string> = {
  'draft-07': 'http://json-schema.org/draft-07/schema#',
  '2019-09': 'https://json-schema.org/draft/2019-09/schema',
  '2020-12': 'https://json-schema.org/draft/2020-12/schema',
}

const SCHEMA_SINGLE = new Set([
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

function decodeLocalReference(reference: string): string {
  if (!reference.startsWith('#') || !reference.includes('%')) return reference
  return reference.replace(/(?:%[0-9a-f]{2})+/gi, (encoded) => {
    const escapes = encoded.match(/%[0-9a-f]{2}/gi) ?? []
    let decoded = ''
    for (let index = 0; index < escapes.length; ) {
      const first = Number.parseInt(escapes[index]!.slice(1), 16)
      const length = first >= 0xc2 && first <= 0xdf ? 2 : first >= 0xe0 && first <= 0xef ? 3 : first >= 0xf0 && first <= 0xf4 ? 4 : 0
      const sequence = escapes.slice(index, index + length)
      const validContinuation = length > 0 && sequence.length === length && sequence.slice(1).every((escape) => {
        const byte = Number.parseInt(escape.slice(1), 16)
        return byte >= 0x80 && byte <= 0xbf
      })
      if (!validContinuation) {
        decoded += escapes[index]
        index += 1
        continue
      }
      try {
        decoded += decodeURIComponent(sequence.join(''))
        index += length
      } catch {
        decoded += escapes[index]
        index += 1
      }
    }
    return decoded
  })
}

function cloneData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneData)
  if (typeof value !== 'object' || value === null) return value
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return value
  return Object.fromEntries(Object.entries(value).map(([key, member]) => [key, cloneData(member)]))
}

function unshared(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unshared)
  if (typeof value !== 'object' || value === null) return value
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return value
  const result: Record<string, unknown> = {}
  for (const [key, member] of Object.entries(value)) {
    if ((key === '$ref' || key === '$dynamicRef' || key === '$recursiveRef') && typeof member === 'string') {
      result[key] = decodeLocalReference(member)
    } else if (SCHEMA_SINGLE.has(key) && (typeof member === 'boolean' || (typeof member === 'object' && member !== null))) {
      result[key] = unshared(member)
    } else if (SCHEMA_LIST.has(key) && Array.isArray(member)) {
      result[key] = member.map(unshared)
    } else if (SCHEMA_MAP.has(key) && typeof member === 'object' && member !== null && !Array.isArray(member)) {
      result[key] = Object.fromEntries(
        Object.entries(member).map(([name, child]) => [
          name,
          key === 'dependencies' && Array.isArray(child) ? cloneData(child) : unshared(child),
        ]),
      )
    } else {
      result[key] = cloneData(member)
    }
  }
  return result
}

export async function createHyperjumpAdapter(
  schema: unknown,
  config?: HyperjumpAdapterConfig,
): Promise<HyperjumpAdapter> {
  return createAdapter(schema, config, DEFAULT_LIMITS)
}

export async function createAdapter(
  schema: unknown,
  config: HyperjumpAdapterConfig | undefined,
  limits: ProjectionLimits,
): Promise<HyperjumpAdapter> {
  // Hyperjump's schema registry is module-global (registerSchema keys by URI across the
  // whole process), so each adapter instance needs its own URI to avoid colliding with
  // another adapter instance registered for the same or a different schema.
  const id = `urn:texaryn:${crypto.randomUUID()}`
  const dialect = detectDialect(schema, {
    defaultDialect: config?.defaultDialect ?? 'draft-07',
  })

  const graph = buildSchemaGraph(schema, dialect)
  rejectSameLocationCycles(graph)
  const cache = newProjectionCache(dialect, cyclicPositions(graph))

  const register = registerByDialect[dialect]
  // From 2019-09, registration rewrites each `$ref` of its clone in place, and the clone keeps shared
  // objects shared, so an object reached from two positions would be read a second time already rewritten.
  register(unshared(schema) as Parameters<typeof registerSchema2020>[0], id, dialectIds[dialect])

  const schemaDoc = await getSchema(id)
  const compiled = await compile(schemaDoc)

  return {
    project(data: unknown): SchemaProjection {
      return buildProjection(schema, compiled, toJsonInstance(data), cache, limits)
    },

    // hyperjump's async work (registerSchema -> getSchema -> compile) already happened
    // in this factory; interpret() on an already-compiled schema is a synchronous call,
    // so validate() returns a plain ValidationResult rather than a Promise. This is the
    // inverse of json-schema-library's adapter (sync factory, sync methods): both
    // shapes satisfy the port's MaybePromise<ValidationResult> return type.
    validate(data: unknown): ValidationResult {
      // `undefined` is not a JSON value and `Instance.fromJs` refuses it, while
      // the runtime holds it for a field the user has cleared. Read as absence
      // here, once, so both the interpreter and the error mapping below see the
      // same instance: `normalizeRequiredError` works out which required keys
      // are missing from the data it is given, and would report a cleared
      // property as present if it were handed the unconverted object.
      const instance = toJsonInstance(data)
      const output = interpret(
        compiled,
        Instance.fromJs(instance as Parameters<typeof Instance.fromJs>[0]),
        BASIC,
      ) as Output
      return mapErrors(output, schema, instance)
    },
  }
}

import '@hyperjump/json-schema/draft-04'
import '@hyperjump/json-schema/draft-2020-12'
import '@hyperjump/json-schema/draft-2019-09'
import '@hyperjump/json-schema/draft-07'
import { buildSchemaDocument, compile, getSchema, interpret, BASIC } from '@hyperjump/json-schema/experimental'
import * as Instance from '@hyperjump/json-schema/instance/experimental'
import type { Output } from '@hyperjump/json-schema'
import type { SchemaDocument } from '@hyperjump/json-schema/experimental'
import type { ProjectionOptions, SchemaProjection, ValidationResult } from '@texaryn/core'
import { detectDialect, schemaIdentifier, type Dialect } from './dialect.js'
import { buildProjection, DEFAULT_LIMITS } from './projection.js'
import { buildSchemaGraph, rejectSameLocationCycles, cyclicPositions } from './schema-graph.js'
import { newProjectionCache, type ProjectionLimits } from './static-walk.js'
import { toJsonInstance } from './json-instance.js'
import { mapErrors } from './validation.js'
import { loadExternalResources, referencedPointerTargets } from './resources.js'
import { materializeLocalPointerAliases } from './local-pointer-aliases.js'
import { setSchemaDocumentContext } from './pointer-utils.js'
import type { HyperjumpAdapterConfig, HyperjumpAdapter } from './types.js'

const dialectIds: Record<Dialect, string> = {
  'draft-04': 'http://json-schema.org/draft-04/schema#',
  'draft-07': 'http://json-schema.org/draft-07/schema#',
  '2019-09': 'https://json-schema.org/draft/2019-09/schema',
  '2020-12': 'https://json-schema.org/draft/2020-12/schema',
}

function indexEmbeddedDocuments(
  document: SchemaDocument,
  documents: Record<string, unknown>,
  visited = new WeakSet<object>(),
): void {
  if (visited.has(document)) return
  visited.add(document)
  documents[document.baseUri] = document
  for (const [uri, embedded] of Object.entries(document.embedded ?? {})) {
    documents[uri] = embedded
    indexEmbeddedDocuments(embedded as SchemaDocument, documents, visited)
  }
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
      let length = 0
      if (first >= 0xc2 && first <= 0xdf) length = 2
      else if (first >= 0xe0 && first <= 0xef) length = 3
      else if (first >= 0xf0 && first <= 0xf4) length = 4
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

function setOwn(target: Record<string, unknown>, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true })
}

function ownRoot(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value
  return new Proxy(value, {})
}

function unshared(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unshared)
  if (typeof value !== 'object' || value === null) return value
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return value
  const result: Record<string, unknown> = {}
  for (const [key, member] of Object.entries(value)) {
    if ((key === '$ref' || key === '$dynamicRef' || key === '$recursiveRef') && typeof member === 'string') {
      setOwn(result, key, decodeLocalReference(member))
    } else if (SCHEMA_SINGLE.has(key) && (typeof member === 'boolean' || (typeof member === 'object' && member !== null))) {
      setOwn(result, key, unshared(member))
    } else if (SCHEMA_LIST.has(key) && Array.isArray(member)) {
      setOwn(result, key, member.map(unshared))
    } else if (SCHEMA_MAP.has(key) && typeof member === 'object' && member !== null && !Array.isArray(member)) {
      setOwn(result, key, Object.fromEntries(
        Object.entries(member).map(([name, child]) => [
          name,
          key === 'dependencies' && Array.isArray(child) ? cloneData(child) : unshared(child),
        ]),
      ))
    } else {
      setOwn(result, key, cloneData(member))
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
  const externalRemotes = await loadExternalResources(schema, dialect, config)
  const sourceSchema = externalRemotes.length === 0 ? schema : ownRoot(schema)
  const externalPointerTargets = dialect === 'draft-04'
    ? referencedPointerTargets([schema, ...externalRemotes], dialect)
    : new Map<string, ReadonlySet<string>>()
  const rootIdentifier = typeof schema === 'object' && schema !== null && !Array.isArray(schema)
    ? schemaIdentifier(schema as Record<string, unknown>, dialect)
    : undefined
  const rootResource = typeof rootIdentifier === 'string' ? rootIdentifier.split('#', 1)[0]! : ''
  const adapterSchema = materializeLocalPointerAliases(
    sourceSchema,
    dialect,
    false,
    externalPointerTargets.get(rootResource),
  )
  const adapterRemotes = externalRemotes.map((remote) => {
    const identifier = typeof remote === 'object' && remote !== null && !Array.isArray(remote)
      ? schemaIdentifier(remote as Record<string, unknown>, dialect)
      : undefined
    const resource = typeof identifier === 'string' ? identifier.split('#', 1)[0]! : ''
    return materializeLocalPointerAliases(remote, dialect, true, externalPointerTargets.get(resource))
  })
  const graph = buildSchemaGraph(adapterSchema, dialect, adapterRemotes)
  rejectSameLocationCycles(graph)
  if (typeof adapterSchema === 'object' && adapterSchema !== null) {
    setSchemaDocumentContext(adapterSchema, adapterRemotes, graph.references, graph.resources)
  }
  const cache = newProjectionCache(dialect, cyclicPositions(graph), graph.retainedPositions)
  const documents: Record<string, unknown> = {}
  for (const remote of adapterRemotes) {
    const uri = (remote as Record<string, unknown>).$id as string
    const document = buildSchemaDocument(unshared(remote) as Parameters<typeof buildSchemaDocument>[0], uri, dialectIds[dialect])
    documents[uri] = document
    indexEmbeddedDocuments(document, documents)
  }
  const rootDocument = buildSchemaDocument(
    unshared(adapterSchema) as Parameters<typeof buildSchemaDocument>[0],
    id,
    dialectIds[dialect],
  )
  documents[id] = rootDocument
  indexEmbeddedDocuments(rootDocument, documents)
  const browser = { _cache: documents } as unknown as NonNullable<Parameters<typeof getSchema>[1]>
  const schemaDoc = await getSchema(id, browser)
  const compiled = await compile(schemaDoc)

  return {
    project(data: unknown, options?: ProjectionOptions): SchemaProjection {
      return buildProjection(adapterSchema, compiled, toJsonInstance(data), cache, limits, options)
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
      return mapErrors(output, adapterSchema, instance, compiled.schemaUri.split('#')[0])
    },
  }
}

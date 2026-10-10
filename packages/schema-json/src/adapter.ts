import {
  compileSchema,
  isSchemaNode,
  type SchemaNode,
  type JsonError,
  type JsonSchema,
  type BooleanSchema,
  type ValidationPath,
} from 'json-schema-library'
import type {
  SchemaProjection,
  MaybePromise,
  ValidationResult,
  ValidationError,
  JsonPointer,
  ProjectionOptions,
} from '@texaryn/core'
import { detectDialect, type Dialect } from './dialect.js'
import { loadMetaschemas, referencedDialects } from './metaschemas/index.js'
import { loadExternalResources } from './resources.js'
import { materializeLocalPointerAliases } from './local-pointer-aliases.js'
import { newProjectionCache } from './identity.js'
import { buildProjection, DEFAULT_LIMITS, type ProjectionLimits } from './projection.js'
import { assertProjectionValidationCoherence } from './projection-validation-coherence.js'
import { projectSubmissionData, supportsSubmissionProjection } from './submission-projection.js'
import { withoutUnreachableBranches } from './normalize.js'
import { DRAFTS } from './bare-maps.js'
import { fixRootReference } from './root-reference.js'
import { buildSchemaGraph, rejectSameLocationCycles, cyclicPositions, markPositions, POSITION } from './schema-graph.js'
import { pointerResolver, type PointerResolver } from './instance-pointer.js'
import type { AdapterConfig, JsonSchemaAdapter } from './types.js'

export async function createJsonSchemaAdapter(
  schema: unknown,
  config?: AdapterConfig,
): Promise<JsonSchemaAdapter> {
  return createAdapter(schema, config, DEFAULT_LIMITS)
}

export async function createAdapter(
  schema: unknown,
  config: AdapterConfig | undefined,
  limits: ProjectionLimits,
): Promise<JsonSchemaAdapter> {
  const dialect = detectDialect(schema, {
    defaultDialect: config?.defaultDialect ?? 'draft-07',
  })
  if (config?.dynamicReferenceProjection === 'local' && dialect === 'draft-07') {
    throw new TypeError('Local dynamic reference projection requires Draft 2019-09 or Draft 2020-12.')
  }

  // json-schema-library carries no metaschema documents, so a schema referencing its own fails closed.
  const externalRemotes = await loadExternalResources(schema, dialect, config)
  const referenced = referencedDialects([schema, ...externalRemotes])
  const metaschemas = referenced.length > 0 ? await loadMetaschemas(referenced) : []
  const remotes = [...metaschemas, ...externalRemotes] as JsonSchema[]
  const graph = buildSchemaGraph(schema, dialect, remotes)
  const referencesByDocument = new Map<string, string[]>()
  for (const target of graph.references.values()) {
    const hash = target.indexOf('#')
    if (hash < 0) continue
    const prefix = target.slice(0, hash)
    const pointers = referencesByDocument.get(prefix) ?? []
    pointers.push(target.slice(hash))
    referencesByDocument.set(prefix, pointers)
  }
  // json-schema-library evaluates some branches the specification never does, so only the projection drops them.
  const document = withoutUnreachableBranches(schema, referencesByDocument.get('') ?? [])
  const projectionRemotes = [
    ...metaschemas,
    ...externalRemotes.map((remote) => {
      const id = (remote as Record<string, unknown>).$id
      const base = typeof id === 'string' ? id.split('#', 1)[0]! : ''
      return withoutUnreachableBranches(remote, referencesByDocument.get(base) ?? [])
    }),
  ] as JsonSchema[]
  rejectSameLocationCycles(graph)
  const marked = markPositions(graph, document, projectionRemotes)
  const validated = await prepareSchema(schema, dialect, remotes)
  const projected = await prepareSchema(marked.document, dialect, marked.remotes as JsonSchema[])
  const dynamicReferenceProjection = config?.dynamicReferenceProjection === 'local'
  if (dynamicReferenceProjection) {
    const externalResourceIds = new Set(
      externalRemotes.flatMap((remote) => {
        const id = (remote as Record<string, unknown>).$id
        return typeof id === 'string' ? [id.split('#', 1)[0]!] : []
      }),
    )
    enableLocalDynamicReferenceScopes(validated, dialect, externalResourceIds)
    enableLocalDynamicReferenceScopes(projected, dialect, externalResourceIds)
  }
  assertProjectionValidationCoherence(validated, projected, dialect)
  const submissionSchema = supportsSubmissionProjection([schema, ...remotes], dialect)
    ? await prepareSchema(marked.document, dialect, marked.remotes as JsonSchema[])
    : undefined
  if (dynamicReferenceProjection && submissionSchema) {
    const externalResourceIds = new Set(
      externalRemotes.flatMap((remote) => {
        const id = (remote as Record<string, unknown>).$id
        return typeof id === 'string' ? [id.split('#', 1)[0]!] : []
      }),
    )
    enableLocalDynamicReferenceScopes(submissionSchema, dialect, externalResourceIds)
  }
  const cache = newProjectionCache(dialect, cyclicPositions(graph), marked.at, dynamicReferenceProjection)

  return {
    project(data: unknown, options?: ProjectionOptions): SchemaProjection {
      return buildProjection(projected, data, cache, limits, options)
    },

    ...(submissionSchema
      ? { projectSubmission: (data: unknown): unknown => projectSubmissionData(validated, submissionSchema, data, dialect) }
      : {}),

    validate(data: unknown): MaybePromise<ValidationResult> {
      return runValidation(validated, data)
    },

    validateAt(data: unknown, pointer: JsonPointer): MaybePromise<ValidationResult> {
      return runValidationAt(validated, data, pointer)
    },
  }
}

const DYNAMIC_REFERENCE_ANNOTATIONS = new Set([
  '$anchor', '$comment', '$dynamicAnchor', '$id', '$schema', 'default', 'deprecated', 'description', 'examples',
  'readOnly', 'title', 'writeOnly', POSITION,
])
const DYNAMIC_REFERENCE_SCOPE_BARRIERS = new Set([
  'additionalItems', 'additionalProperties', 'contains', 'contentSchema', 'not', 'patternProperties', 'prefixItems',
  'propertyNames', 'unevaluatedItems', 'unevaluatedProperties',
])
const SCHEMA_MAP_KEYWORDS = new Set([
  '$defs', 'definitions', 'dependencies', 'dependentSchemas', 'patternProperties', 'properties',
])
const SCHEMA_ARRAY_KEYWORDS = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems'])
const SCHEMA_SINGLE_KEYWORDS = new Set([
  'additionalItems', 'additionalProperties', 'contains', 'contentSchema', 'else', 'if', 'not', 'propertyNames', 'then',
  'unevaluatedItems', 'unevaluatedProperties',
])

function enableLocalDynamicReferenceScopes(
  root: SchemaNode,
  dialect: Dialect,
  externalResourceIds: ReadonlySet<string>,
): void {
  const compiledRoots = [
    root,
    ...Object.values(root.context.remotes).filter((remote) => {
      if (!isSchemaNode(remote) || remote === root || typeof remote.$id !== 'string') return false
      return externalResourceIds.has(remote.$id.split('#', 1)[0]!)
    }),
  ]
  const referencePolicies = new Map<string, string | undefined>()
  const recursiveReferencePolicies = new Map<string, boolean>()
  const unclassifiedCompiledReferencePolicies = new Set<string>()
  const classifiedReferencePolicies = new Set<string>()
  const activeValidationScope: ValidationPath = []
  const validatorWrappers = new WeakMap<Function, SchemaNode['validators'][number]>()
  const wrappedValidators = new WeakSet<Function>()
  let validationDepth = 0
  let reductionDepth = 0
  for (const compiledRoot of compiledRoots) {
    const authoredReferencePaths = collectAuthoredReferencePaths(compiledRoot.schema)
    for (const node of compiledRoot.toSchemaNodes()) {
      if (node.$id?.startsWith('/')) {
        throw new TypeError('Local reference projection does not support root-relative resource identifiers.')
      }
      if (typeof node.schema !== 'object' || node.schema === null) continue
      const schema = node.schema as Record<string, unknown>
      if (dialect === '2020-12' && '$recursiveRef' in schema) {
        throw new TypeError('Local dynamic reference projection does not support $recursiveRef.')
      }
      const dynamicReference = dialect === '2020-12' && typeof schema.$dynamicRef === 'string'
      const recursiveReference = dialect === '2019-09' && typeof schema.$recursiveRef === 'string'
      if (!dynamicReference && !recursiveReference) continue
      if (recursiveReference && schema.$recursiveRef !== '#') {
        throw new TypeError('Local dynamic reference projection only supports the $recursiveRef value "#".')
      }

      const keyword = dynamicReference ? '$dynamicRef' : '$recursiveRef'
      const reference = schema.$dynamicRef ?? schema.$recursiveRef
      const policyKey = referencePolicyKey(node, keyword, reference as string)
      const authoredPaths = authoredReferencePaths.get(schema)
      const parsedPath = authoredPaths ? undefined : schemaKeywordPath(compiledRoot, node.schemaLocation)
      const keywordPaths = authoredPaths ?? (parsedPath ? [parsedPath] : undefined)
      if (!keywordPaths) {
        unclassifiedCompiledReferencePolicies.add(policyKey)
      } else {
        classifiedReferencePolicies.add(policyKey)
        for (const keywords of keywordPaths) {
          if (
            !keywords.some((pathKeyword) => pathKeyword === 'properties' || pathKeyword === 'items') ||
            keywords.some((pathKeyword) => DYNAMIC_REFERENCE_SCOPE_BARRIERS.has(pathKeyword))
          ) {
            throw new TypeError('Local dynamic reference projection does not support references below unsupported applicators or tuple items.')
          }
        }
      }
      if (recursiveReference && Object.keys(schema).some((keyword) => keyword !== '$recursiveRef' && keyword !== POSITION)) {
        throw new TypeError('Local dynamic reference projection does not support siblings beside $recursiveRef.')
      }
      if (dynamicReference && Object.keys(schema).some((keyword) => keyword !== '$dynamicRef' && !DYNAMIC_REFERENCE_ANNOTATIONS.has(keyword))) {
        throw new TypeError('Local dynamic reference projection does not support assertion siblings beside $dynamicRef.')
      }

      const staticTarget = node.resolveRef({ path: [] })
      if (!isSchemaNode(staticTarget)) {
        throw new TypeError(`Cannot resolve local reference at ${node.schemaLocation}.`)
      }
      const targetRoot = staticTarget.context.rootNode
      const targetRootId = targetRoot.$id?.split('#', 1)[0]
      if (targetRoot !== root && (!targetRootId || !externalResourceIds.has(targetRootId))) {
        throw new TypeError('Local dynamic reference projection does not support external targets unless they were loaded by the configured resource resolver.')
      }
      if (dynamicReference) {
        const anchor = dynamicReferenceAnchor(schema.$dynamicRef as string)
        const policy =
          anchor !== undefined && (staticTarget.schema as Record<string, unknown>).$dynamicAnchor === anchor
            ? anchor
            : undefined
        referencePolicies.set(referencePolicyKey(node, '$dynamicRef', schema.$dynamicRef as string), policy)
      } else {
        recursiveReferencePolicies.set(
          referencePolicyKey(node, '$recursiveRef', schema.$recursiveRef as string),
          (staticTarget.schema as Record<string, unknown>).$recursiveAnchor === true,
        )
      }
    }
  }

  for (const key of unclassifiedCompiledReferencePolicies) {
    if (!classifiedReferencePolicies.has(key)) {
      throw new TypeError('Cannot classify a compiled local dynamic reference.')
    }
  }

  const instrumented = new WeakSet<SchemaNode>()
  const instrument = (compiledRoot: SchemaNode): void => {
    for (const node of compiledRoot.toSchemaNodes()) {
      if (instrumented.has(node)) continue
      instrumented.add(node)

      const schema = node.schema as Record<string, unknown>
      node.validators = node.validators.map((validator) => {
        if (wrappedValidators.has(validator)) return validator
        const existing = validatorWrappers.get(validator)
        if (existing) return existing
        const wrapped = ((params: Parameters<typeof validator>[0]) => {
          activeValidationScope.push({ pointer: params.pointer, node: params.node })
          try {
            return validator(params)
          } finally {
            activeValidationScope.pop()
          }
        }) as typeof validator
        Object.assign(wrapped, validator)
        wrappedValidators.add(wrapped)
        validatorWrappers.set(validator, wrapped)
        return wrapped
      })

      const validate = node.validate.bind(node)
      node.validate = ((data, pointer = '#', path = []) => {
        const outermost = validationDepth === 0
        const inheritedLength = activeValidationScope.length
        if (outermost) activeValidationScope.push(...path)
        validationDepth += 1
        try {
          return validate(data, pointer, path)
        } finally {
          validationDepth -= 1
          if (outermost) activeValidationScope.length = inheritedLength
        }
      }) as SchemaNode['validate']

      const reduceNode = node.reduceNode.bind(node)
      node.reduceNode = ((data, options = {}) => {
        const outermost = reductionDepth === 0
        const inheritedLength = activeValidationScope.length
        if (outermost) activeValidationScope.push(...(options.path ?? []))
        if (activeValidationScope[activeValidationScope.length - 1]?.node !== node) {
          activeValidationScope.push({ pointer: options.pointer ?? node.evaluationPath, node })
        }
        reductionDepth += 1
        try {
          return reduceNode(data, options)
        } finally {
          reductionDepth -= 1
          activeValidationScope.length = inheritedLength
        }
      }) as SchemaNode['reduceNode']

      if (dialect === '2020-12' && typeof schema.$dynamicRef === 'string') {
        const key = referencePolicyKey(node, '$dynamicRef', schema.$dynamicRef)
        if (!referencePolicies.has(key)) {
          throw new TypeError(`Cannot verify compiled local $dynamicRef at ${node.schemaLocation}.`)
        }
        const anchor = referencePolicies.get(key)
        const resolveRef = node.resolveRef.bind(node)
        node.resolveRef = ({ pointer, path = [] }: { pointer?: string; path?: ValidationPath } = {}) => {
          if (anchor === undefined) {
            const staticPath: ValidationPath = []
            const resolved = resolveRef({ pointer, path: staticPath })
            if (path !== staticPath) path.push(...staticPath)
            return resolved
          }

          const scopedPath: ValidationPath = []
          const scope =
            (validationDepth > 0 || reductionDepth > 0) && activeValidationScope.length > 0
              ? activeValidationScope
              : path
          for (const entry of scope) {
            const anchorNode = entry.node.context.dynamicAnchors[dynamicAnchorUri(entry.node.$id, anchor)]
            if (isSchemaNode(anchorNode)) scopedPath.push({ pointer: entry.pointer, node: anchorNode })
          }
          const inheritedLength = scopedPath.length
          const resolved = resolveRef({ pointer, path: scopedPath })
          if (path !== scopedPath) path.push(...scopedPath.slice(inheritedLength))
          return resolved
        }
      }
      if (dialect === '2019-09' && typeof schema.$recursiveRef === 'string') {
        const key = referencePolicyKey(node, '$recursiveRef', schema.$recursiveRef)
        let isRecursive = recursiveReferencePolicies.get(key)
        if (isRecursive === undefined && !recursiveReferencePolicies.has(key)) {
          if (schema.$recursiveRef !== '#') {
            throw new TypeError(`Cannot verify compiled local $recursiveRef at ${node.schemaLocation}.`)
          }
          const staticTarget = node.resolveRef({ path: [] })
          const targetRootId = isSchemaNode(staticTarget) ? staticTarget.context.rootNode.$id?.split('#', 1)[0] : undefined
          if (
            !isSchemaNode(staticTarget) ||
            (staticTarget.context.rootNode !== root && (!targetRootId || !externalResourceIds.has(targetRootId)))
          ) {
            throw new TypeError(`Cannot verify compiled local $recursiveRef at ${node.schemaLocation}.`)
          }
          isRecursive = (staticTarget.schema as Record<string, unknown>).$recursiveAnchor === true
        }
        const resolveRef = node.resolveRef.bind(node)
        node.resolveRef = ({ pointer, path = [] }: { pointer?: string; path?: ValidationPath } = {}) => {
          const staticPath: ValidationPath = []
          const staticTarget = resolveRef({ pointer, path: staticPath })
          if (!isRecursive || !isSchemaNode(staticTarget) || (staticTarget.schema as Record<string, unknown>).$recursiveAnchor !== true) {
            if (path !== staticPath) path.push(...staticPath)
            return staticTarget
          }

          const scope =
            (validationDepth > 0 || reductionDepth > 0) && activeValidationScope.length > 0
              ? activeValidationScope
              : path
          const outerAnchor = scope.find(({ node: entry }) =>
            (entry.schema as Record<string, unknown>).$recursiveAnchor === true,
          )
          if (outerAnchor) {
            const resourceRoot = outerAnchor.node.getNodeRef('#')
            if (isSchemaNode(resourceRoot)) {
              path.push({ pointer: pointer!, node: resourceRoot })
              return resourceRoot
            }
          }
          if (path !== staticPath) path.push(...staticPath)
          return staticTarget
        }
      }

      const compileSchema = node.compileSchema.bind(node)
      node.compileSchema = ((schema, evaluationPath, schemaLocation, dynamicId) => {
        const compiled = compileSchema(schema, evaluationPath, schemaLocation, dynamicId)
        instrument(compiled)
        return compiled
      }) as SchemaNode['compileSchema']
    }
  }

  for (const compiledRoot of compiledRoots) instrument(compiledRoot)
}

function referencePolicyKey(node: SchemaNode, keyword: string, reference: string): string {
  return `${node.$id ?? ''}\u0000${keyword}\u0000${reference}`
}

function collectAuthoredReferencePaths(schema: unknown): WeakMap<object, string[][]> {
  const paths = new WeakMap<object, string[][]>()
  const ancestors = new Set<object>()

  const visit = (value: unknown, keywords: string[]): void => {
    if (typeof value !== 'object' || value === null || Array.isArray(value) || ancestors.has(value)) return
    ancestors.add(value)
    const current = value as Record<string, unknown>
    if (typeof current.$dynamicRef === 'string' || typeof current.$recursiveRef === 'string') {
      const found = paths.get(value) ?? []
      found.push(keywords)
      paths.set(value, found)
    }

    for (const keyword of SCHEMA_MAP_KEYWORDS) {
      const map = current[keyword]
      if (typeof map !== 'object' || map === null || Array.isArray(map)) continue
      for (const child of Object.values(map)) visit(child, [...keywords, keyword])
    }
    for (const keyword of SCHEMA_ARRAY_KEYWORDS) {
      const branches = current[keyword]
      if (Array.isArray(branches)) {
        for (const child of branches) visit(child, [...keywords, keyword])
      }
    }
    for (const keyword of SCHEMA_SINGLE_KEYWORDS) {
      visit(current[keyword], [...keywords, keyword])
    }
    if (Object.hasOwn(current, 'items')) {
      const items = current.items
      if (Array.isArray(items)) {
        for (const child of items) visit(child, [...keywords, 'prefixItems'])
      } else {
        visit(items, [...keywords, 'items'])
      }
    }
    ancestors.delete(value)
  }

  visit(schema, [])
  return paths
}

function schemaKeywordPath(root: SchemaNode, schemaLocation: string): string[] | undefined {
  const hashIndex = schemaLocation.indexOf('#')
  if (hashIndex < 0) return undefined
  const fragment = schemaLocation.slice(hashIndex + 1)
  if (!fragment.startsWith('/')) return []
  const segments = fragment.slice(1).split('/')
  const keywords: string[] = []
  let current: unknown = root.schema
  let index = 0
  while (index < segments.length) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) return undefined
    const schema = current as Record<string, unknown>
    const segment = segments[index]!
    if (SCHEMA_MAP_KEYWORDS.has(segment)) {
      keywords.push(segment)
      const map = schema[segment]
      const member = segments[index + 1]
      if (
        typeof map !== 'object' || map === null || Array.isArray(map) || member === undefined ||
        !Object.prototype.hasOwnProperty.call(map, member)
      ) return undefined
      current = (map as Record<string, unknown>)[member]
      index += 2
      continue
    }
    if (SCHEMA_ARRAY_KEYWORDS.has(segment)) {
      keywords.push(segment)
      const array = schema[segment]
      const itemIndex = Number(segments[index + 1])
      if (!Array.isArray(array) || !Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= array.length) {
        return undefined
      }
      current = array[itemIndex]
      index += 2
      continue
    }
    if (segment === 'items') {
      const items = schema.items
      if (Array.isArray(items)) {
        keywords.push('prefixItems')
        const itemIndex = Number(segments[index + 1])
        if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= items.length) return undefined
        current = items[itemIndex]
        index += 2
      } else {
        keywords.push(segment)
        if (!(segment in schema)) return undefined
        current = items
        index += 1
      }
      continue
    }
    if (SCHEMA_SINGLE_KEYWORDS.has(segment)) {
      keywords.push(segment)
      if (!(segment in schema)) return undefined
      current = schema[segment]
      index += 1
      continue
    }
    return undefined
  }
  return keywords
}

function dynamicAnchorUri(resourceId: string | undefined, anchor: string): string {
  const currentId = resourceId ?? '#'
  return `${currentId.replace(/#.*$/, '')}#${anchor}`
}

function dynamicReferenceAnchor(reference: string): string | undefined {
  const hash = reference.indexOf('#')
  if (hash < 0) return undefined
  let fragment: string
  try {
    fragment = decodeURIComponent(reference.slice(hash + 1))
  } catch {
    throw new TypeError(`Local dynamic reference projection cannot decode anchor in ${reference}.`)
  }
  return fragment === '' || fragment.startsWith('/') ? undefined : fragment
}


// json-schema-library's `draft` compile option uses "draft-2019-09"/"draft-2020-12" rather
// than this package's "2019-09"/"2020-12" Dialect values.
function toDraftOption(dialect: Dialect): string {
  return dialect === 'draft-07' ? 'draft-07' : `draft-${dialect}`
}

// compileSchema() is synchronous for schemas with only local $ref (Phase 1's scope); it is
// wrapped in a Promise so the factory signature stays uniform with libraries whose
// preparation step is genuinely async (e.g. hyperjump's annotate()).
async function prepareSchema(
  schema: unknown,
  dialect: Dialect,
  remotes: JsonSchema[] | undefined,
): Promise<SchemaNode> {
  // json-schema-library asserts `format` in every dialect. Draft 7 permits that:
  // assertion is the conventional behaviour there and the specification only asks
  // that it can be disabled. From 2019-09 the default inverted, and `format` is an
  // annotation unless the format-assertion vocabulary is declared, so asserting it
  // is a deviation rather than a stricter setting.
  const formatAssertion = dialect === 'draft-07' ? undefined : false
  const root = compileSchema(materializeLocalPointerAliases(schema, dialect) as JsonSchema | BooleanSchema, {
    drafts: DRAFTS,
    draft: toDraftOption(dialect),
    formatAssertion,
    remotes: remotes?.map((remote) => materializeLocalPointerAliases(remote, dialect, true) as JsonSchema),
  })
  fixRootReference(root, dialect)
  return root
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

function mapValidationError(error: JsonError, resolve: PointerResolver): ValidationError {
  const code = typeof error.code === 'string' ? error.code : String(error.code)
  const data = (error.data ?? {}) as Record<string, unknown>
  const basePointer = typeof data.pointer === 'string' ? data.pointer : '#'
  // required-property-error reports the *parent* object's pointer with the missing property
  // name in data.key; consumers expect the error located at the missing property itself.
  const missingKey = code === 'required-property-error' && typeof data.key === 'string' ? data.key : undefined
  // These two report the parent as data.value; the child's own key says which child failed.
  const lastKey =
    code === 'no-additional-properties-error' && typeof data.property === 'string'
      ? data.property
      : code === 'additional-items-error' && data.key !== undefined
        ? String(data.key)
        : undefined
  return {
    instancePointer: resolve(basePointer, { code, value: data.value, missingKey, lastKey }),
    keyword: toKeyword(code),
    message: error.message,
    params: (error.data ?? {}) as Record<string, unknown>,
  }
}

function runValidation(prepared: SchemaNode, data: unknown): ValidationResult {
  const result = prepared.validate(data)
  const resolve = pointerResolver(data)
  return {
    valid: result.valid,
    errors: result.errors.map((error) => mapValidationError(error, resolve)),
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

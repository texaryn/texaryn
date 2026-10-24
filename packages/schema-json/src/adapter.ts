import {
  compileSchema,
  isSchemaNode,
  type SchemaNode,
  type JsonError,
  type JsonSchema,
  type BooleanSchema,
  type ValidationPath,
} from '@texaryn/json-schema-library'
import type {
  SchemaProjection,
  MaybePromise,
  ValidationResult,
  ValidationError,
  JsonPointer,
  ProjectionOptions,
} from '@texaryn/core'
import { detectDialect, isPre2019Dialect, type Dialect } from './dialect.js'
import { loadMetaschemas, referencedDialects } from './metaschemas/index.js'
import { loadExternalResources } from './resources.js'
import { materializeLocalPointerAliases } from './local-pointer-aliases.js'
import { newProjectionCache } from './identity.js'
import { buildProjection, DEFAULT_LIMITS, type ProjectionLimits } from './projection.js'
import { assertProjectionValidationCoherence } from './projection-validation-coherence.js'
import { projectSubmissionData, supportsSubmissionProjection } from './submission-projection.js'
import { withoutUnreachableBranches } from './normalize.js'
import { DRAFTS } from './bare-maps.js'
import { buildSchemaGraph, rejectSameLocationCycles, cyclicPositions, markPositions, POSITION } from './schema-graph.js'
import { pointerResolver, type PointerResolver } from './instance-pointer.js'
import { validationParameters } from './validation-parameters.js'
import { toSchemaIssue } from './schema-issues.js'
import type { AdapterConfig, JsonSchemaAdapter, SchemaIssue } from './types.js'

export async function createJsonSchemaAdapter(
  schema: unknown,
  config?: AdapterConfig,
): Promise<JsonSchemaAdapter> {
  return createAdapter(schema, config, DEFAULT_LIMITS)
}

async function prepareValidation(schema: unknown, config: AdapterConfig | undefined) {
  const dialect = detectDialect(schema, {
    defaultDialect: config?.defaultDialect ?? 'draft-07',
  })
  if (config?.dynamicReferenceProjection === 'local' && isPre2019Dialect(dialect)) {
    throw new TypeError('Local dynamic reference projection requires Draft 2019-09 or Draft 2020-12.')
  }

  // json-schema-library carries no metaschema documents, so a schema referencing its own fails closed.
  const externalRemotes = await loadExternalResources(schema, dialect, config)
  const referenced = referencedDialects([schema, ...externalRemotes])
  const metaschemas = referenced.length > 0 ? await loadMetaschemas(referenced) : []
  const remotes = [...metaschemas, ...externalRemotes] as JsonSchema[]
  const graph = buildSchemaGraph(schema, dialect, remotes)
  rejectSameLocationCycles(graph)
  const validated = await prepareSchema(schema, dialect, remotes)
  return { dialect, externalRemotes, metaschemas, remotes, graph, validated }
}

/** Returns the schema's own errors as JSON Pointers, without building an adapter. Rejects like `createJsonSchemaAdapter` for a same-location `$ref` cycle (`SameLocationCycleError`) or a `resolveResource` that cannot supply a schema (`SchemaResourceResolutionError`). */
export async function checkSchema(schema: unknown, config?: AdapterConfig): Promise<SchemaIssue[]> {
  const { validated } = await prepareValidation(schema, config)
  return (validated.schemaErrors ?? []).map((error) => toSchemaIssue(schema, error))
}

export async function createAdapter(
  schema: unknown,
  config: AdapterConfig | undefined,
  limits: ProjectionLimits,
): Promise<JsonSchemaAdapter> {
  const { dialect, externalRemotes, metaschemas, remotes, graph, validated } = await prepareValidation(schema, config)
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
  const document = withoutUnreachableBranches(schema, referencesByDocument.get('') ?? [], dialect)
  const projectionRemotes = [
    ...metaschemas,
    ...externalRemotes.map((remote) => {
      const id = (remote as Record<string, unknown>).$id
      const base = typeof id === 'string' ? id.split('#', 1)[0]! : ''
      return withoutUnreachableBranches(remote, referencesByDocument.get(base) ?? [], dialect)
    }),
  ] as JsonSchema[]
  const marked = markPositions(graph, document, projectionRemotes)
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
  // A schema node can validate differently under different dynamic anchor scopes.
  const cache = newProjectionCache(
    dialect,
    cyclicPositions(graph),
    marked.at,
    dynamicReferenceProjection,
    !dynamicReferenceProjection && !hasOneOf([marked.document, marked.remotes]),
    graph.retainedPositions,
  )

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

interface LocalReferencePolicies {
  readonly dynamic: Map<string, string | undefined>
  readonly recursive: Map<string, boolean>
  readonly unclassified: Set<string>
  readonly classified: Set<string>
}

interface LocalReferenceContext {
  readonly root: SchemaNode
  readonly dialect: Dialect
  readonly externalResourceIds: ReadonlySet<string>
  readonly policies: LocalReferencePolicies
  readonly activeValidationScope: ValidationPath
  readonly validatorWrappers: WeakMap<Function, SchemaNode['validators'][number]>
  readonly wrappedValidators: WeakSet<Function>
  readonly instrumented: WeakSet<SchemaNode>
  readonly depths: { validation: number; reduction: number }
}

interface CompiledReference {
  readonly schema: Record<string, unknown>
  readonly dynamic: boolean
  readonly keyword: '$dynamicRef' | '$recursiveRef'
  readonly reference: string
}

type ResolvedReference = ReturnType<SchemaNode['resolveRef']>

function enableLocalDynamicReferenceScopes(
  root: SchemaNode,
  dialect: Dialect,
  externalResourceIds: ReadonlySet<string>,
): void {
  const compiledRoots = compiledSchemaRoots(root, externalResourceIds)
  const policies: LocalReferencePolicies = {
    dynamic: new Map(),
    recursive: new Map(),
    unclassified: new Set(),
    classified: new Set(),
  }
  collectLocalReferencePolicies(compiledRoots, root, dialect, externalResourceIds, policies)
  assertClassifiedReferencePolicies(policies)

  const context: LocalReferenceContext = {
    root,
    dialect,
    externalResourceIds,
    policies,
    activeValidationScope: [],
    validatorWrappers: new WeakMap(),
    wrappedValidators: new WeakSet(),
    instrumented: new WeakSet(),
    depths: { validation: 0, reduction: 0 },
  }
  for (const compiledRoot of compiledRoots) instrumentCompiledRoot(compiledRoot, context)
}

function compiledSchemaRoots(root: SchemaNode, externalResourceIds: ReadonlySet<string>): SchemaNode[] {
  return [
    root,
    ...Object.values(root.context.remotes).filter((remote): remote is SchemaNode =>
      isSchemaNode(remote) &&
      remote !== root &&
      typeof remote.$id === 'string' &&
      externalResourceIds.has(remote.$id.split('#', 1)[0]!),
    ),
  ]
}

function collectLocalReferencePolicies(
  compiledRoots: readonly SchemaNode[],
  root: SchemaNode,
  dialect: Dialect,
  externalResourceIds: ReadonlySet<string>,
  policies: LocalReferencePolicies,
): void {
  for (const compiledRoot of compiledRoots) {
    const authoredPaths = collectAuthoredReferencePaths(compiledRoot.schema)
    for (const node of compiledRoot.toSchemaNodes()) {
      collectNodeReferencePolicy(node, compiledRoot, authoredPaths, root, dialect, externalResourceIds, policies)
    }
  }
}

function collectNodeReferencePolicy(
  node: SchemaNode,
  compiledRoot: SchemaNode,
  authoredPaths: WeakMap<object, string[][]>,
  root: SchemaNode,
  dialect: Dialect,
  externalResourceIds: ReadonlySet<string>,
  policies: LocalReferencePolicies,
): void {
  const reference = compiledReference(node, dialect)
  if (!reference) return
  classifyCompiledReference(node, compiledRoot, reference, authoredPaths, policies)
  assertReferenceSiblings(reference.schema, reference.dynamic)
  const staticTarget = resolveLocalReferenceTarget(node, root, externalResourceIds)
  const key = referencePolicyKey(node, reference.keyword, reference.reference)
  recordReferencePolicy(reference, staticTarget, key, policies)
}

function compiledReference(node: SchemaNode, dialect: Dialect): CompiledReference | undefined {
  if (node.$id?.startsWith('/')) {
    throw new TypeError('Local reference projection does not support root-relative resource identifiers.')
  }
  if (typeof node.schema !== 'object' || node.schema === null) return undefined
  const schema = node.schema as Record<string, unknown>
  if (dialect === '2020-12' && '$recursiveRef' in schema) {
    throw new TypeError('Local dynamic reference projection does not support $recursiveRef.')
  }
  const dynamic = dialect === '2020-12' && typeof schema.$dynamicRef === 'string'
  const recursive = dialect === '2019-09' && typeof schema.$recursiveRef === 'string'
  if (!dynamic && !recursive) return undefined
  if (recursive && schema.$recursiveRef !== '#') {
    throw new TypeError('Local dynamic reference projection only supports the $recursiveRef value "#".')
  }
  const keyword = dynamic ? '$dynamicRef' : '$recursiveRef'
  return { schema, dynamic, keyword, reference: schema[keyword] as string }
}

function classifyCompiledReference(
  node: SchemaNode,
  compiledRoot: SchemaNode,
  reference: CompiledReference,
  authoredPaths: WeakMap<object, string[][]>,
  policies: LocalReferencePolicies,
): void {
  const key = referencePolicyKey(node, reference.keyword, reference.reference)
  const authored = authoredPaths.get(reference.schema)
  const parsed = authored ? undefined : schemaKeywordPath(compiledRoot, node.schemaLocation)
  const paths = authored ?? (parsed ? [parsed] : undefined)
  if (!paths) {
    policies.unclassified.add(key)
    return
  }
  policies.classified.add(key)
  assertSupportedReferencePaths(paths)
}

function assertSupportedReferencePaths(paths: readonly (readonly string[])[]): void {
  for (const keywords of paths) {
    const insideScope = keywords.some((keyword) => keyword === 'properties' || keyword === 'items')
    const crossesBarrier = keywords.some((keyword) => DYNAMIC_REFERENCE_SCOPE_BARRIERS.has(keyword))
    if (!insideScope || crossesBarrier) {
      throw new TypeError(
        'Local dynamic reference projection does not support references below unsupported applicators or tuple items.',
      )
    }
  }
}

function assertReferenceSiblings(schema: Record<string, unknown>, dynamic: boolean): void {
  const hasUnsupportedSibling = Object.keys(schema).some((keyword) =>
    dynamic
      ? keyword !== '$dynamicRef' && !DYNAMIC_REFERENCE_ANNOTATIONS.has(keyword)
      : keyword !== '$recursiveRef' && keyword !== POSITION,
  )
  if (!hasUnsupportedSibling) return
  const message = dynamic
    ? 'Local dynamic reference projection does not support assertion siblings beside $dynamicRef.'
    : 'Local dynamic reference projection does not support siblings beside $recursiveRef.'
  throw new TypeError(message)
}

function resolveLocalReferenceTarget(
  node: SchemaNode,
  root: SchemaNode,
  externalResourceIds: ReadonlySet<string>,
): SchemaNode {
  const target = node.resolveRef({ path: [] })
  if (!isSchemaNode(target)) throw new TypeError(`Cannot resolve local reference at ${node.schemaLocation}.`)
  const targetRoot = target.context.rootNode
  const targetRootId = targetRoot.$id?.split('#', 1)[0]
  if (targetRoot !== root && (!targetRootId || !externalResourceIds.has(targetRootId))) {
    throw new TypeError(
      'Local dynamic reference projection does not support external targets unless they were loaded by the configured resource resolver.',
    )
  }
  return target
}

function recordReferencePolicy(
  reference: CompiledReference,
  staticTarget: SchemaNode,
  key: string,
  policies: LocalReferencePolicies,
): void {
  const targetSchema = staticTarget.schema as Record<string, unknown>
  if (reference.dynamic) {
    const anchor = dynamicReferenceAnchor(reference.reference)
    const policy = anchor !== undefined && targetSchema.$dynamicAnchor === anchor ? anchor : undefined
    policies.dynamic.set(key, policy)
    return
  }
  policies.recursive.set(key, targetSchema.$recursiveAnchor === true)
}

function assertClassifiedReferencePolicies(policies: LocalReferencePolicies): void {
  for (const key of policies.unclassified) {
    if (!policies.classified.has(key)) throw new TypeError('Cannot classify a compiled local dynamic reference.')
  }
}

function instrumentCompiledRoot(compiledRoot: SchemaNode, context: LocalReferenceContext): void {
  const instrument = (currentRoot: SchemaNode): void => {
    for (const node of currentRoot.toSchemaNodes()) {
      if (context.instrumented.has(node)) continue
      context.instrumented.add(node)
      instrumentNode(node, context, instrument)
    }
  }
  instrument(compiledRoot)
}

function instrumentNode(
  node: SchemaNode,
  context: LocalReferenceContext,
  instrument: (root: SchemaNode) => void,
): void {
  const schema = node.schema as Record<string, unknown>
  wrapNodeValidators(node, context)
  wrapNodeValidation(node, context)
  wrapNodeReduction(node, context)
  installDynamicReferenceResolver(node, schema, context)
  installRecursiveReferenceResolver(node, schema, context)

  const compile = node.compileSchema.bind(node)
  node.compileSchema = ((childSchema, evaluationPath, schemaLocation, dynamicId) => {
    const compiled = compile(childSchema, evaluationPath, schemaLocation, dynamicId)
    instrument(compiled)
    return compiled
  }) as SchemaNode['compileSchema']
}

function wrapNodeValidators(node: SchemaNode, context: LocalReferenceContext): void {
  node.validators = node.validators.map((validator) => {
    if (context.wrappedValidators.has(validator)) return validator
    const existing = context.validatorWrappers.get(validator)
    if (existing) return existing
    const wrapped = ((params: Parameters<typeof validator>[0]) => {
      context.activeValidationScope.push({ pointer: params.pointer, node: params.node })
      try {
        return validator(params)
      } finally {
        context.activeValidationScope.pop()
      }
    }) as typeof validator
    Object.assign(wrapped, validator)
    context.wrappedValidators.add(wrapped)
    context.validatorWrappers.set(validator, wrapped)
    return wrapped
  })
}

function wrapNodeValidation(node: SchemaNode, context: LocalReferenceContext): void {
  const validate = node.validate.bind(node)
  node.validate = ((data, pointer = '#', path = []) => {
    const outermost = context.depths.validation === 0
    const inheritedLength = context.activeValidationScope.length
    if (outermost) context.activeValidationScope.push(...path)
    context.depths.validation += 1
    try {
      return validate(data, pointer, path)
    } finally {
      context.depths.validation -= 1
      if (outermost) context.activeValidationScope.length = inheritedLength
    }
  }) as SchemaNode['validate']
}

function wrapNodeReduction(node: SchemaNode, context: LocalReferenceContext): void {
  const reduceNode = node.reduceNode.bind(node)
  node.reduceNode = ((data, options = {}) => {
    const outermost = context.depths.reduction === 0
    const inheritedLength = context.activeValidationScope.length
    if (outermost) context.activeValidationScope.push(...(options.path ?? []))
    if (context.activeValidationScope.at(-1)?.node !== node) {
      context.activeValidationScope.push({ pointer: options.pointer ?? node.evaluationPath, node })
    }
    context.depths.reduction += 1
    try {
      return reduceNode(data, options)
    } finally {
      context.depths.reduction -= 1
      context.activeValidationScope.length = inheritedLength
    }
  }) as SchemaNode['reduceNode']
}

function activeReferenceScope(context: LocalReferenceContext, path: ValidationPath): ValidationPath {
  return (context.depths.validation > 0 || context.depths.reduction > 0) && context.activeValidationScope.length > 0
    ? context.activeValidationScope
    : path
}

function installDynamicReferenceResolver(
  node: SchemaNode,
  schema: Record<string, unknown>,
  context: LocalReferenceContext,
): void {
  if (context.dialect !== '2020-12' || typeof schema.$dynamicRef !== 'string') return
  const key = referencePolicyKey(node, '$dynamicRef', schema.$dynamicRef)
  if (!context.policies.dynamic.has(key)) {
    throw new TypeError(`Cannot verify compiled local $dynamicRef at ${node.schemaLocation}.`)
  }
  const anchor = context.policies.dynamic.get(key)
  const resolveRef = node.resolveRef.bind(node)
  node.resolveRef = ({ pointer, path = [] }: { pointer?: string; path?: ValidationPath } = {}) => {
    if (anchor === undefined) {
      const staticPath: ValidationPath = []
      const resolved = resolveRef({ pointer, path: staticPath })
      if (path !== staticPath) path.push(...staticPath)
      return resolved
    }
    const scopedPath: ValidationPath = []
    for (const entry of activeReferenceScope(context, path)) {
      const anchorNode = entry.node.context.dynamicAnchors[dynamicAnchorUri(entry.node.$id, anchor)]
      if (isSchemaNode(anchorNode)) scopedPath.push({ pointer: entry.pointer, node: anchorNode })
    }
    const inheritedLength = scopedPath.length
    const resolved = resolveRef({ pointer, path: scopedPath })
    if (path !== scopedPath) path.push(...scopedPath.slice(inheritedLength))
    return resolved
  }
}

function installRecursiveReferenceResolver(
  node: SchemaNode,
  schema: Record<string, unknown>,
  context: LocalReferenceContext,
): void {
  if (context.dialect !== '2019-09' || typeof schema.$recursiveRef !== 'string') return
  const key = referencePolicyKey(node, '$recursiveRef', schema.$recursiveRef)
  const isRecursive = recursiveReferencePolicy(node, schema, key, context)
  const resolveRef = node.resolveRef.bind(node)
  node.resolveRef = ({ pointer, path = [] }: { pointer?: string; path?: ValidationPath } = {}) => {
    const staticPath: ValidationPath = []
    const staticTarget = resolveRef({ pointer, path: staticPath })
    return resolveRecursiveTarget(staticTarget, isRecursive, pointer, path, staticPath, context)
  }
}

function recursiveReferencePolicy(
  node: SchemaNode,
  schema: Record<string, unknown>,
  key: string,
  context: LocalReferenceContext,
): boolean {
  let isRecursive = context.policies.recursive.get(key)
  if (isRecursive !== undefined || context.policies.recursive.has(key)) return isRecursive ?? false
  if (schema.$recursiveRef !== '#') {
    throw new TypeError(`Cannot verify compiled local $recursiveRef at ${node.schemaLocation}.`)
  }
  const staticTarget = node.resolveRef({ path: [] })
  const targetRootId = isSchemaNode(staticTarget)
    ? staticTarget.context.rootNode.$id?.split('#', 1)[0]
    : undefined
  if (
    !isSchemaNode(staticTarget) ||
    (staticTarget.context.rootNode !== context.root &&
      (!targetRootId || !context.externalResourceIds.has(targetRootId)))
  ) {
    throw new TypeError(`Cannot verify compiled local $recursiveRef at ${node.schemaLocation}.`)
  }
  return (staticTarget.schema as Record<string, unknown>).$recursiveAnchor === true
}

function resolveRecursiveTarget(
  staticTarget: ResolvedReference,
  isRecursive: boolean,
  pointer: string | undefined,
  path: ValidationPath,
  staticPath: ValidationPath,
  context: LocalReferenceContext,
): ResolvedReference {
  if (!isRecursive || !isSchemaNode(staticTarget) ||
    (staticTarget.schema as Record<string, unknown>).$recursiveAnchor !== true) {
    if (path !== staticPath) path.push(...staticPath)
    return staticTarget
  }
  const outerAnchor = activeReferenceScope(context, path).find(({ node }) =>
    (node.schema as Record<string, unknown>).$recursiveAnchor === true,
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

function referencePolicyKey(node: SchemaNode, keyword: string, reference: string): string {
  return `${node.$id ?? ''}\u0000${keyword}\u0000${reference}`
}

function collectAuthoredReferencePaths(schema: unknown): WeakMap<object, string[][]> {
  const paths = new WeakMap<object, string[][]>()
  const ancestors = new Set<object>()

  function visitMapChildren(current: Record<string, unknown>, keywords: string[]): void {
    for (const keyword of SCHEMA_MAP_KEYWORDS) {
      const map = current[keyword]
      if (typeof map !== 'object' || map === null || Array.isArray(map)) continue
      for (const child of Object.values(map)) visit(child, [...keywords, keyword])
    }
  }

  function visitArrayChildren(current: Record<string, unknown>, keywords: string[]): void {
    for (const keyword of SCHEMA_ARRAY_KEYWORDS) {
      const branches = current[keyword]
      if (Array.isArray(branches)) {
        for (const child of branches) visit(child, [...keywords, keyword])
      }
    }
  }

  function visitSingleChildren(current: Record<string, unknown>, keywords: string[]): void {
    for (const keyword of SCHEMA_SINGLE_KEYWORDS) {
      visit(current[keyword], [...keywords, keyword])
    }
  }

  function visitItems(current: Record<string, unknown>, keywords: string[]): void {
    if (Object.hasOwn(current, 'items')) {
      const items = current.items
      if (Array.isArray(items)) {
        for (const child of items) visit(child, [...keywords, 'prefixItems'])
      } else {
        visit(items, [...keywords, 'items'])
      }
    }
  }

  function visit(value: unknown, keywords: string[]): void {
    if (typeof value !== 'object' || value === null || Array.isArray(value) || ancestors.has(value)) return
    ancestors.add(value)
    const current = value as Record<string, unknown>
    if (typeof current.$dynamicRef === 'string' || typeof current.$recursiveRef === 'string') {
      const found = paths.get(value) ?? []
      found.push(keywords)
      paths.set(value, found)
    }

    visitMapChildren(current, keywords)
    visitArrayChildren(current, keywords)
    visitSingleChildren(current, keywords)
    visitItems(current, keywords)
    ancestors.delete(value)
  }

  visit(schema, [])
  return paths
}

interface SchemaPathCursor {
  readonly segments: string[]
  readonly keywords: string[]
  current: unknown
  index: number
}

function advanceMapSchemaPath(schema: Record<string, unknown>, cursor: SchemaPathCursor, segment: string): boolean {
  const map = schema[segment]
  const member = cursor.segments[cursor.index + 1]
  if (
    typeof map !== 'object' || map === null || Array.isArray(map) || member === undefined ||
    !Object.hasOwn(map, member)
  ) return false
  cursor.keywords.push(segment)
  cursor.current = (map as Record<string, unknown>)[member]
  cursor.index += 2
  return true
}

function advanceArraySchemaPath(schema: Record<string, unknown>, cursor: SchemaPathCursor, segment: string): boolean {
  const array = schema[segment]
  const itemIndex = Number(cursor.segments[cursor.index + 1])
  if (!Array.isArray(array) || !Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= array.length) return false
  cursor.keywords.push(segment)
  cursor.current = array[itemIndex]
  cursor.index += 2
  return true
}

function advanceItemsSchemaPath(schema: Record<string, unknown>, cursor: SchemaPathCursor): boolean {
  const items = schema.items
  if (Array.isArray(items)) {
    const itemIndex = Number(cursor.segments[cursor.index + 1])
    if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= items.length) return false
    cursor.keywords.push('prefixItems')
    cursor.current = items[itemIndex]
    cursor.index += 2
    return true
  }
  if (!('items' in schema)) return false
  cursor.keywords.push('items')
  cursor.current = items
  cursor.index++
  return true
}

function advanceSingleSchemaPath(schema: Record<string, unknown>, cursor: SchemaPathCursor, segment: string): boolean {
  if (!(segment in schema)) return false
  cursor.keywords.push(segment)
  cursor.current = schema[segment]
  cursor.index++
  return true
}

function advanceSchemaPath(schema: Record<string, unknown>, cursor: SchemaPathCursor): boolean {
  const segment = cursor.segments[cursor.index]!
  if (SCHEMA_MAP_KEYWORDS.has(segment)) return advanceMapSchemaPath(schema, cursor, segment)
  if (SCHEMA_ARRAY_KEYWORDS.has(segment)) return advanceArraySchemaPath(schema, cursor, segment)
  if (segment === 'items') return advanceItemsSchemaPath(schema, cursor)
  if (SCHEMA_SINGLE_KEYWORDS.has(segment)) return advanceSingleSchemaPath(schema, cursor, segment)
  return false
}

export function schemaKeywordPath(root: SchemaNode, schemaLocation: string): string[] | undefined {
  const hashIndex = schemaLocation.indexOf('#')
  if (hashIndex < 0) return undefined
  const fragment = schemaLocation.slice(hashIndex + 1)
  if (!fragment.startsWith('/')) return []
  const cursor: SchemaPathCursor = {
    segments: fragment.slice(1).split('/'),
    keywords: [],
    current: root.schema,
    index: 0,
  }
  while (cursor.index < cursor.segments.length) {
    if (typeof cursor.current !== 'object' || cursor.current === null || Array.isArray(cursor.current)) return undefined
    if (!advanceSchemaPath(cursor.current as Record<string, unknown>, cursor)) return undefined
  }
  return cursor.keywords
}

function dynamicAnchorUri(resourceId: string | undefined, anchor: string): string {
  const currentId = resourceId ?? '#'
  const fragmentStart = currentId.indexOf('#')
  const baseId = fragmentStart < 0 ? currentId : currentId.slice(0, fragmentStart)
  return `${baseId}#${anchor}`
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
  return dialect === '2019-09' || dialect === '2020-12' ? `draft-${dialect}` : dialect
}

// compileSchema() is synchronous for schemas with only local $ref (Phase 1's scope); it is
// wrapped in a Promise so the factory signature stays uniform with libraries whose
// preparation step is genuinely async (e.g. hyperjump's annotate()).
function prepareSchema(
  schema: unknown,
  dialect: Dialect,
  remotes: JsonSchema[] | undefined,
): Promise<ReturnType<typeof compileSchema>> {
  // json-schema-library asserts `format` in every dialect. Draft 7 permits that:
  // assertion is the conventional behaviour there and the specification only asks
  // that it can be disabled. From 2019-09 the default inverted, and `format` is an
  // annotation unless the format-assertion vocabulary is declared, so asserting it
  // is a deviation rather than a stricter setting.
  const formatAssertion = isPre2019Dialect(dialect) ? undefined : false
  const root = compileSchema(materializeLocalPointerAliases(schema, dialect) as JsonSchema | BooleanSchema, {
    drafts: DRAFTS,
    draft: toDraftOption(dialect),
    formatAssertion,
    remotes: remotes?.map((remote) => materializeLocalPointerAliases(remote, dialect, true) as JsonSchema),
  })
  return Promise.resolve(root)
}

function hasOneOf(value: unknown, visited = new WeakSet<object>()): boolean {
  if (typeof value !== 'object' || value === null || visited.has(value)) return false
  visited.add(value)

  let descriptors: PropertyDescriptorMap
  try {
    descriptors = Object.getOwnPropertyDescriptors(value)
  } catch {
    return true
  }
  const properties = Object.values(descriptors)
  if (properties.some((descriptor) => !('value' in descriptor))) return true
  const oneOf = descriptors.oneOf
  if (oneOf && Array.isArray(oneOf.value) && oneOf.value.length > 0) {
    return true
  }
  return properties.some((descriptor) => hasOneOf(descriptor.value, visited))
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
  const code = typeof error.code === 'string' ? error.code : 'schema-error'
  const keyword = toKeyword(code)
  const data = (error.data ?? {}) as Record<string, unknown>
  const basePointer = typeof data.pointer === 'string' ? data.pointer : '#'
  // required-property-error reports the *parent* object's pointer with the missing property
  // name in data.key; consumers expect the error located at the missing property itself.
  const missingKey = code === 'required-property-error' && typeof data.key === 'string' ? data.key : undefined
  // These two report the parent as data.value; the child's own key says which child failed.
  let lastKey: string | undefined
  if (code === 'no-additional-properties-error' && typeof data.property === 'string') {
    lastKey = data.property
  } else if (code === 'additional-items-error' &&
    (typeof data.key === 'string' || typeof data.key === 'number')
  ) {
    lastKey = String(data.key)
  }
  return {
    instancePointer: resolve(basePointer, { code, value: data.value, missingKey, lastKey }),
    keyword,
    message: error.message,
    params: validationParameters(keyword, data, code),
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

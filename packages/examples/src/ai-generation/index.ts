import { createDocumentRuntime, createFormRuntime } from '@texaryn/core'
import type { DocumentAction, DocumentRuntime, FormRuntime, UIHints } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'

export type GenerationKind = 'form' | 'display'

export interface GenerationAttempt {
  readonly task: string
  readonly attempt: number
  readonly maxAttempts: number
  readonly feedback: readonly string[]
}

export type GenerationModel = (input: GenerationAttempt) => Promise<string>

export interface GenerationExampleOptions {
  readonly kind: GenerationKind
  readonly contractSchema: unknown
  readonly maxRepairs?: number
  readonly allowedWidgets?: readonly string[]
  readonly actions?: Readonly<Record<string, DocumentAction>>
  readonly resources?: ReadonlyMap<string, unknown>
}

type AcceptedRuntime =
  | { readonly kind: 'form'; readonly runtime: FormRuntime }
  | { readonly kind: 'display'; readonly runtime: DocumentRuntime }

export type AcceptedGeneration = AcceptedRuntime & { readonly attempts: number }

export class GenerationRejectedError extends Error {
  constructor(
    readonly attempts: number,
    readonly diagnostics: readonly string[],
  ) {
    super(`Texaryn rejected the generated ${attempts === 1 ? 'output' : 'outputs'} after ${attempts} attempt${attempts === 1 ? '' : 's'}.`)
    this.name = 'GenerationRejectedError'
  }
}

class OutputRejectedError extends Error {
  constructor(readonly diagnostics: readonly string[]) {
    super(diagnostics.join('\n'))
    this.name = 'OutputRejectedError'
  }
}

const maxOutputCharacters = 262_144
const maxFeedbackItems = 8
const maxFeedbackCharacters = 240
const maxRepairsAllowed = 2
const maxJsonDepth = 64
const maxJsonValues = 100_000
const maxSchemaDepth = 32
const maxSchemaValues = 10_000
const maxSchemaArrayItems = 256
const maxSchemaObjectProperties = 256
const maxSchemaStringLength = 16_384
const maxTotalSchemaStringLength = 65_536

function bounded(value: string): string {
  const normalized = value.replace(/[\r\n\t]+/g, ' ').trim()
  return normalized.length > maxFeedbackCharacters
    ? `${normalized.slice(0, maxFeedbackCharacters - 1)}…`
    : normalized
}

function validationFeedback(errors: readonly {
  instancePointer: string
  keyword: string
}[]): string[] {
  return errors.slice(0, maxFeedbackItems).map((error) =>
    bounded(`${error.instancePointer || '/'} fails the ${error.keyword} contract check.`),
  )
}

function outputRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new OutputRejectedError(['Output must be a JSON object.'])
  }
  return value as Record<string, unknown>
}

function preflightJsonText(text: string): void {
  if (text.length > maxOutputCharacters) {
    throw new OutputRejectedError([`Model output must be no longer than ${maxOutputCharacters} characters.`])
  }

  let depth = 0
  let values = 0
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!
    if (/\s/.test(character) || character === ',' || character === ':') continue
    if (character === '"') {
      values += 1
      index += 1
      for (; index < text.length; index += 1) {
        if (text[index] === '\\') {
          index += 1
          continue
        }
        if (text[index] === '"') break
      }
    } else if (character === '{' || character === '[') {
      values += 1
      depth += 1
      if (depth > maxJsonDepth) {
        throw new OutputRejectedError([`Model output exceeds the JSON depth limit of ${maxJsonDepth}.`])
      }
    } else if (character === '}' || character === ']') {
      depth = Math.max(0, depth - 1)
    } else {
      values += 1
      while (index + 1 < text.length && !/[\s,:[\]{}]/.test(text[index + 1]!)) index += 1
    }

    if (values > maxJsonValues) {
      throw new OutputRejectedError([`Model output exceeds the JSON value limit of ${maxJsonValues}.`])
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validateParsedJson(root: unknown): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }]
  let values = 0
  while (pending.length > 0) {
    const current = pending.pop()!
    values += 1
    if (values > maxJsonValues || current.depth > maxJsonDepth) {
      throw new OutputRejectedError(['Parsed model output exceeds the JSON value or depth limit.'])
    }
    if (typeof current.value === 'number' && !Number.isFinite(current.value)) {
      throw new OutputRejectedError(['Parsed model output contains a number outside the finite JSON range.'])
    }
    if (Array.isArray(current.value)) {
      for (const value of current.value) pending.push({ value, depth: current.depth + 1 })
    } else if (isRecord(current.value)) {
      for (const value of Object.values(current.value)) pending.push({ value, depth: current.depth + 1 })
    }
  }
}

function preflightSchemaResources(root: unknown): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }]
  const seen = new Set<object>()
  let values = 0
  let totalStringLength = 0
  while (pending.length > 0) {
    const current = pending.pop()!
    if (typeof current.value === 'object' && current.value !== null) {
      if (seen.has(current.value)) {
        throw new OutputRejectedError(['A form schema or resolved resource must be an acyclic JSON value.'])
      }
      seen.add(current.value)
    }
    values += 1
    if (values > maxSchemaValues) {
      throw new OutputRejectedError([`A form schema or resolved resource exceeds ${maxSchemaValues} JSON values.`])
    }
    if (current.depth > maxSchemaDepth) {
      throw new OutputRejectedError([`A form schema or resolved resource exceeds JSON depth ${maxSchemaDepth}.`])
    }
    if (typeof current.value === 'string') {
      totalStringLength += current.value.length
      if (current.value.length > maxSchemaStringLength || totalStringLength > maxTotalSchemaStringLength) {
        throw new OutputRejectedError(['A form schema or resolved resource exceeds its string size limits.'])
      }
    } else if (typeof current.value === 'number' && !Number.isFinite(current.value)) {
      throw new OutputRejectedError(['A form schema or resolved resource contains a non-finite number.'])
    } else if (Array.isArray(current.value)) {
      if (current.value.length > maxSchemaArrayItems) {
        throw new OutputRejectedError([`A form schema array exceeds ${maxSchemaArrayItems} items.`])
      }
      for (const value of current.value) pending.push({ value, depth: current.depth + 1 })
    } else if (isRecord(current.value)) {
      const entries = Object.entries(current.value)
      if (entries.length > maxSchemaObjectProperties) {
        throw new OutputRejectedError([`A form schema object exceeds ${maxSchemaObjectProperties} properties.`])
      }
      for (const [key, value] of entries) {
        values += 1
        if (values > maxSchemaValues) {
          throw new OutputRejectedError([`A form schema or resolved resource exceeds ${maxSchemaValues} JSON values.`])
        }
        totalStringLength += key.length
        if (key.length > 1_024 || totalStringLength > maxTotalSchemaStringLength) {
          throw new OutputRejectedError(['A form schema or resolved resource exceeds its string size limits.'])
        }
        pending.push({ value, depth: current.depth + 1 })
      }
    }
  }
}

const singleSchemaKeywords = [
  'additionalItems', 'additionalProperties', 'contains', 'contentSchema', 'else', 'if', 'items',
  'not', 'propertyNames', 'then', 'unevaluatedItems', 'unevaluatedProperties',
] as const
const schemaMapKeywords = [
  '$defs', 'definitions', 'dependentSchemas', 'patternProperties', 'properties',
] as const
const schemaListKeywords = ['allOf', 'anyOf', 'oneOf', 'prefixItems'] as const

function childSchemaEntries(schema: Record<string, unknown>): Array<{ path: readonly string[]; schema: unknown }> {
  const children: Array<{ path: readonly string[]; schema: unknown }> = []
  for (const keyword of singleSchemaKeywords) {
    const candidate = schema[keyword]
    if (isRecord(candidate) || typeof candidate === 'boolean') children.push({ path: [keyword], schema: candidate })
    if (Array.isArray(candidate)) {
      candidate.forEach((member, index) => children.push({ path: [keyword, String(index)], schema: member }))
    }
  }
  for (const keyword of schemaMapKeywords) {
    const candidate = schema[keyword]
    if (isRecord(candidate)) {
      for (const [name, member] of Object.entries(candidate)) {
        if (isRecord(member) || typeof member === 'boolean') children.push({ path: [keyword, name], schema: member })
      }
    }
  }
  for (const keyword of schemaListKeywords) {
    const candidate = schema[keyword]
    if (Array.isArray(candidate)) {
      candidate.forEach((member, index) => children.push({ path: [keyword, String(index)], schema: member }))
    }
  }
  const dependencies = schema.dependencies
  if (isRecord(dependencies)) {
    for (const [name, dependency] of Object.entries(dependencies)) {
      if (isRecord(dependency) || typeof dependency === 'boolean') {
        children.push({ path: ['dependencies', name], schema: dependency })
      }
    }
  }
  return children
}

function normalizedResources(resources: ReadonlyMap<string, unknown> | undefined): Map<string, unknown> {
  const normalized = new Map<string, unknown>()
  if (resources === undefined) return normalized
  if (resources.size > 8) throw new OutputRejectedError(['The host resource map cannot contain more than 8 entries.'])
  for (const [uri, schema] of resources) {
    let parsed: URL
    try {
      parsed = new URL(uri)
    } catch {
      throw new OutputRejectedError(['Host schema resource keys must be absolute HTTP or HTTPS URIs.'])
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new OutputRejectedError(['Host schema resource keys must use HTTP or HTTPS.'])
    }
    const key = parsed.href.split('#', 1)[0]!
    if (normalized.has(key)) throw new OutputRejectedError([`Host schema resource URI "${key}" is duplicated.`])
    normalized.set(key, schema)
  }
  return normalized
}

type SchemaDialect = 'draft-07' | '2019-09' | '2020-12'

const schemaDialects = new Map<string, SchemaDialect>([
  ['http://json-schema.org/draft-07/schema#', 'draft-07'],
  ['http://json-schema.org/draft-07/schema', 'draft-07'],
  ['https://json-schema.org/draft/2019-09/schema', '2019-09'],
  ['https://json-schema.org/draft/2020-12/schema', '2020-12'],
])

const metaschemaReferences: Record<SchemaDialect, string> = {
  'draft-07': 'http://json-schema.org/draft-07/schema#',
  '2019-09': 'https://json-schema.org/draft/2019-09/schema',
  '2020-12': 'https://json-schema.org/draft/2020-12/schema',
}

const metaschemaValidators = new Map<SchemaDialect, ReturnType<typeof createJsonSchemaAdapter>>()

function metaschemaValidator(dialect: SchemaDialect): ReturnType<typeof createJsonSchemaAdapter> {
  let validator = metaschemaValidators.get(dialect)
  if (validator === undefined) {
    const reference = metaschemaReferences[dialect]
    const schema = dialect === 'draft-07' ? { $ref: reference } : { $schema: reference, $ref: reference }
    validator = createJsonSchemaAdapter(schema, { defaultDialect: dialect })
    metaschemaValidators.set(dialect, validator)
  }
  return validator
}

function pointerTokens(fragment: string): string[] {
  let decoded: string
  try {
    decoded = decodeURIComponent(fragment)
  } catch {
    throw new OutputRejectedError(['Schema references must use a valid URI fragment.'])
  }
  if (decoded === '') return []
  if (!decoded.startsWith('/')) {
    throw new OutputRejectedError(['Schema references may use only the document root or JSON Pointer fragments.'])
  }
  return decoded.slice(1).split('/').map((token) => {
    if (/~(?![01])/.test(token)) throw new OutputRejectedError(['Schema reference fragments must use valid JSON Pointer escapes.'])
    return token.replace(/~1/g, '/').replace(/~0/g, '~')
  })
}

function pointerTarget(root: unknown, tokens: readonly string[]): unknown {
  let value = root
  for (const token of tokens) {
    if (Array.isArray(value)) {
      if (!/^(0|[1-9]\d*)$/.test(token) || Number(token) >= value.length) {
        throw new OutputRejectedError(['A schema reference points to a missing JSON Pointer target.'])
      }
      value = value[Number(token)]
    } else if (isRecord(value) && Object.hasOwn(value, token)) {
      value = value[token]
    } else {
      throw new OutputRejectedError(['A schema reference points to a missing JSON Pointer target.'])
    }
  }
  if (!isRecord(value) && typeof value !== 'boolean') {
    throw new OutputRejectedError(['A schema reference must target an object or boolean schema.'])
  }
  return value
}

interface SchemaDocument {
  readonly key: string
  readonly root: unknown
}

function schemaLocationKey(document: SchemaDocument, path: readonly string[]): string {
  return `${document.key}\u0000${JSON.stringify(path)}`
}

async function checkFormSchemaKeywords(
  root: unknown,
  resources: ReadonlyMap<string, unknown>,
  dialect: SchemaDialect,
): Promise<void> {
  const rootDocument: SchemaDocument = { key: '<root>', root }
  const documents = new Map<string, SchemaDocument>()
  const validatedReferenceTargets = new Set<string>()
  const rootId = isRecord(root) && typeof root.$id === 'string' ? root.$id : undefined
  if (rootId !== undefined) {
    let parsed: URL
    try {
      parsed = new URL(rootId)
    } catch {
      throw new OutputRejectedError(['A generated form $id must be an absolute HTTP or HTTPS URI.'])
    }
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.hash !== '') {
      throw new OutputRejectedError(['A generated form $id must be an absolute HTTP or HTTPS URI without a fragment.'])
    }
    documents.set(parsed.href, rootDocument)
    documents.set(parsed.href.split('#', 1)[0]!, rootDocument)
  }
  for (const [uri, schema] of resources) {
    if (documents.has(uri)) throw new OutputRejectedError([`Host schema resource URI "${uri}" conflicts with the generated form $id.`])
    const document = { key: uri, root: schema }
    documents.set(uri, document)
  }

  const pending: Array<{ document: SchemaDocument; path: readonly string[]; schema: unknown }> = [
    { document: rootDocument, path: [], schema: root },
  ]
  const visited = new Set<string>()
  while (pending.length > 0) {
    const { document, path, schema: candidate } = pending.pop()!
    const position = schemaLocationKey(document, path)
    if (visited.has(position)) continue
    visited.add(position)
    if (typeof candidate === 'boolean') continue
    if (!isRecord(candidate)) throw new OutputRejectedError(['A reachable form schema must be an object or boolean schema.'])
    if (path.length > 0 && Object.hasOwn(candidate, '$id')) {
      throw new OutputRejectedError(['Nested $id resource boundaries are outside the version 1 form generation subset.'])
    }
    for (const keyword of ['$anchor', '$dynamicAnchor', '$recursiveAnchor'] as const) {
      if (Object.hasOwn(candidate, keyword)) {
        throw new OutputRejectedError([`${keyword} is outside the version 1 form generation subset.`])
      }
    }
    if (Object.hasOwn(candidate, 'oneOf') || Object.hasOwn(candidate, 'anyOf')) {
      throw new OutputRejectedError(['Generated form schemas cannot use oneOf or anyOf in version 1.'])
    }
    for (const keyword of ['$dynamicRef', '$recursiveRef'] as const) {
      if (Object.hasOwn(candidate, keyword)) {
        throw new OutputRejectedError([`${keyword} is outside the version 1 form generation subset.`])
      }
    }
    const reference = candidate.$ref
    if (typeof reference === 'string') {
      let targetDocument = document
      let fragment: string
      if (reference.startsWith('#')) {
        fragment = reference.slice(1)
      } else {
        let uri: URL
        try {
          uri = new URL(reference)
        } catch {
          throw new OutputRejectedError(['External form references must use an absolute HTTP or HTTPS URI.'])
        }
        if ((uri.protocol !== 'http:' && uri.protocol !== 'https:') || uri.username !== '' || uri.password !== '') {
          throw new OutputRejectedError(['External form references must use an absolute HTTP or HTTPS URI.'])
        }
        const resourceUri = uri.href.split('#', 1)[0]!
        const resolved = documents.get(resourceUri)
        if (resolved === undefined) {
          throw new OutputRejectedError([`External schema reference "${resourceUri}" is not in the host resource map.`])
        }
        targetDocument = resolved
        fragment = uri.hash.slice(1)
      }
      const tokens = pointerTokens(fragment)
      const target = pointerTarget(targetDocument.root, tokens)
      const targetPosition = schemaLocationKey(targetDocument, tokens)
      if (!validatedReferenceTargets.has(targetPosition)) {
        await validateSchemaDocument(target, dialect)
        validatedReferenceTargets.add(targetPosition)
      }
      pending.push({ document: targetDocument, path: tokens, schema: target })
    }
    for (const child of childSchemaEntries(candidate)) {
      pending.push({ document, path: [...path, ...child.path], schema: child.schema })
    }
  }
}

async function validateSchemaDocument(root: unknown, dialect: SchemaDialect): Promise<void> {
  if (!isRecord(root) && typeof root !== 'boolean') {
    throw new OutputRejectedError(['A form schema or resolved resource must be an object or boolean schema.'])
  }
  const validator = await metaschemaValidator(dialect)
  const result = await validator.validate(root)
  if (!result.valid) {
    const feedback = validationFeedback(result.errors)
    throw new OutputRejectedError(feedback.length > 0 ? feedback : [`The schema does not match the ${dialect} metaschema.`])
  }
}

async function checkFormSchemaPolicy(root: unknown, suppliedResources: ReadonlyMap<string, unknown> | undefined): Promise<Map<string, unknown>> {
  preflightSchemaResources(root)
  if (!isRecord(root)) throw new OutputRejectedError(['A generated form schema must be an object.'])
  if (typeof root.$schema !== 'string' || !schemaDialects.has(root.$schema)) {
    throw new OutputRejectedError(['Set $schema to Draft 7, 2019-09, or 2020-12 explicitly.'])
  }
  const dialect = schemaDialects.get(root.$schema)!
  if (root.type !== 'object') {
    throw new OutputRejectedError(['A generated form schema must declare an object root.'])
  }
  const resources = normalizedResources(suppliedResources)
  for (const resource of resources.values()) preflightSchemaResources(resource)
  await validateSchemaDocument(root, dialect)
  for (const resource of resources.values()) {
    if (isRecord(resource) && typeof resource.$schema === 'string') {
      const resourceDialect = schemaDialects.get(resource.$schema)
      if (resourceDialect === undefined || resourceDialect !== dialect) {
        throw new OutputRejectedError(['Host schema resources must use the same supported dialect as the generated form.'])
      }
    }
    await validateSchemaDocument(resource, dialect)
  }
  await checkFormSchemaKeywords(root, resources, dialect)
  return resources
}

function checkWidgets(value: unknown, allowedWidgets: readonly string[]): void {
  if (value === undefined) return
  const allowed = new Set(allowedWidgets)
  for (const [pointer, hint] of Object.entries(value as UIHints)) {
    if (hint.widget !== undefined && !allowed.has(hint.widget)) {
      throw new OutputRejectedError([`UI hint ${pointer || '/'} names widget "${hint.widget}" that the host did not allow.`])
    }
  }
}

function checkActions(document: Record<string, unknown>, actions: Readonly<Record<string, DocumentAction>>): void {
  const nodes = document.nodes as Record<string, Record<string, unknown>>
  for (const node of Object.values(nodes)) {
    if (node.type !== 'action') continue
    if (!Object.prototype.hasOwnProperty.call(actions, node.actionType as string)) {
      throw new OutputRejectedError([`Display action "${String(node.actionType)}" is not registered by the host.`])
    }
  }
}

async function acceptOutput(
  text: string,
  contract: Awaited<ReturnType<typeof createJsonSchemaAdapter>>,
  options: GenerationExampleOptions,
): Promise<AcceptedRuntime> {
  if (typeof text !== 'string') throw new OutputRejectedError(['Model output must be text.'])
  preflightJsonText(text)

  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    throw new OutputRejectedError(['Output is not valid JSON. Return the JSON value without Markdown fences or commentary.'])
  }
  validateParsedJson(parsed)

  const result = await contract.validate(parsed)
  if (!result.valid) throw new OutputRejectedError(validationFeedback(result.errors))
  const output = outputRecord(parsed)
  if (output.kind !== options.kind) {
    throw new OutputRejectedError([`Expected a ${options.kind} output, received ${String(output.kind)}.`])
  }

  if (options.kind === 'form') {
    checkWidgets(output.hints, options.allowedWidgets ?? [])
    const resources = await checkFormSchemaPolicy(output.schema, options.resources)
    let adapter: Awaited<ReturnType<typeof createJsonSchemaAdapter>>
    try {
      const resolveResource = resources.size === 0 ? undefined : (uri: string) => {
        return resources.get(new URL(uri).href.split('#', 1)[0]!)
      }
      adapter = await createJsonSchemaAdapter(output.schema, {
        ...(resolveResource === undefined ? {} : { resolveResource }),
        maxExternalResources: 8,
      })
    } catch (error) {
      throw new OutputRejectedError([bounded(error instanceof Error ? error.message : 'The form schema could not be compiled.')])
    }

    const diagnostics = adapter.project({}).diagnostics ?? []
    if (diagnostics.length > 0) {
      throw new OutputRejectedError(diagnostics.slice(0, maxFeedbackItems).map((diagnostic) =>
        bounded(`${diagnostic.pointer || '/'} ${diagnostic.code}: ${diagnostic.message}`),
      ))
    }

    try {
      const runtime = createFormRuntime(adapter, { hints: output.hints as UIHints | undefined })
      if (!Object.values(runtime.document.getSnapshot().nodes).some((node) => node.type === 'field')) {
        runtime.destroy()
        throw new OutputRejectedError(['The generated form has no projected fields.'])
      }
      return { kind: 'form', runtime }
    } catch (error) {
      throw new OutputRejectedError([bounded(error instanceof Error ? error.message : 'The form runtime rejected the output.')])
    }
  }

  const document = output.document as Record<string, unknown>
  const actions = options.actions ?? {}
  checkActions(document, actions)
  try {
    return {
      kind: 'display',
      runtime: createDocumentRuntime(document, {
        initialData: output.data,
        actions,
      }),
    }
  } catch (error) {
    throw new OutputRejectedError([bounded(error instanceof Error ? error.message : 'The display runtime rejected the output.')])
  }
}

/**
 * Executable example for a host-owned model call and a small, bounded repair loop.
 * This helper is private to the examples package and is not part of Texaryn's
 * public runtime API.
 */
export async function runGenerationExample(
  task: string,
  generate: GenerationModel,
  options: GenerationExampleOptions,
): Promise<AcceptedGeneration> {
  const maxRepairs = options.maxRepairs ?? maxRepairsAllowed
  if (!Number.isInteger(maxRepairs) || maxRepairs < 0 || maxRepairs > maxRepairsAllowed) {
    throw new RangeError(`maxRepairs must be an integer from 0 to ${maxRepairsAllowed}.`)
  }
  const maxAttempts = maxRepairs + 1
  const contract = await createJsonSchemaAdapter(options.contractSchema)
  let feedback: readonly string[] = []

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const text = await generate({ task, attempt, maxAttempts, feedback })
    try {
      const accepted = await acceptOutput(text, contract, options)
      return { ...accepted, attempts: attempt }
    } catch (error) {
      feedback = error instanceof OutputRejectedError
        ? error.diagnostics.slice(0, maxFeedbackItems).map(bounded)
        : [bounded(error instanceof Error ? error.message : 'Output was rejected.')]
    }
  }

  throw new GenerationRejectedError(maxAttempts, feedback)
}

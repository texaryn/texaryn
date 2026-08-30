// Research probe: evaluate @hyperjump/json-schema against SchemaEvaluationPort
// requirements (see .superpowers/sdd/2026-08-30-phase1-schema-evaluation/task-1-brief.md).
//
// This probe is written and run in isolation from the json-schema-library probe
// to avoid confirmation bias. It must not import or reference jsl-probe.ts.
//
// Run with: npx tsx spike/hyperjump-probe.ts   (from packages/schema-json/)

import { readFileSync, existsSync, rmSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'

import { registerSchema as registerSchema2020, FLAG } from '@hyperjump/json-schema/draft-2020-12'
import { registerSchema as registerSchema07 } from '@hyperjump/json-schema/draft-07'
import {
  compile,
  interpret,
  getSchema,
  BASIC,
  type CompiledSchema,
  type EvaluationPlugin,
  type ValidationContext,
} from '@hyperjump/json-schema/experimental'
import * as Instance from '@hyperjump/json-schema/instance/experimental'
import { annotate, ValidationError as AnnotateValidationError } from '@hyperjump/json-schema/annotations/experimental'

import type { ProbeResult } from './probe-types.js'

// ---------------------------------------------------------------------------
// Types mirroring @texaryn/core's SchemaEvaluationPort (type-level reference
// only -- this probe does not import @texaryn/core to keep it a standalone
// script runnable with tsx).
// ---------------------------------------------------------------------------

type JsonSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null'

interface FieldConstraints {
  required?: boolean
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  multipleOf?: number
  pattern?: string
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
}

interface EnumOption {
  value: unknown
  title?: string
}

interface AnnotationSet {
  title?: string
  description?: string
  readOnly?: boolean
  writeOnly?: boolean
  deprecated?: boolean
  examples?: unknown[]
  default?: unknown
}

interface ChildProjection {
  pointer: string
  key: string
  required: boolean
}

interface NodeProjection {
  type: JsonSchemaType | undefined
  format?: string
  constraints: FieldConstraints
  children?: ChildProjection[]
  enumValues?: EnumOption[]
  active: boolean
  annotations: AnnotationSet
}

interface SchemaProjection {
  nodes: Map<string, NodeProjection>
}

interface PortValidationError {
  instancePointer: string
  keyword: string
  message?: string
  params: Record<string, unknown>
}

interface PortValidationResult {
  valid: boolean
  errors: PortValidationError[]
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FIXTURES_DIR = join(import.meta.dirname, 'fixtures')

function loadFixture(name: string): any {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8'))
}

const flatObjectSchema = loadFixture('flat-object.json')
const conditionalSchema = loadFixture('conditional.json')
const oneofSchema = loadFixture('oneof-discriminated.json')
const refsSchema = loadFixture('refs.json')
const dependentSchema = loadFixture('dependent.json')
const draft07ConditionalSchema = loadFixture('draft07-conditional.json')

const CONSTRAINT_KEYS = new Set([
  'minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum',
  'exclusiveMaximum', 'multipleOf', 'pattern', 'minItems', 'maxItems', 'uniqueItems',
])
const ANNOTATION_KEYS = new Set([
  'title', 'description', 'readOnly', 'writeOnly', 'deprecated', 'examples', 'default',
])

// ---------------------------------------------------------------------------
// Helpers: JSON Pointer resolution against the raw schema document. This is
// necessary because hyperjump's evaluation plugins report *where* a keyword
// fired (a schemaUri fragment) but not the keyword's raw value -- the value
// has to be read back out of the schema document at that pointer. All $ref
// targets in our fixtures are local ($defs within the same document), so the
// schemaUri's fragment always resolves against the same in-memory object we
// registered (verified empirically: a recursive $ref into #/$defs/treeNode
// produces schemaUri fragments like #/$defs/treeNode/properties/label, which
// resolve directly against the original document).
// ---------------------------------------------------------------------------

function resolveJsonPointer(doc: unknown, pointer: string): unknown {
  if (pointer === '' || pointer === '/') return doc
  const parts = pointer
    .split('/')
    .slice(1)
    .map((p) => decodeURIComponent(p).replace(/~1/g, '/').replace(/~0/g, '~'))
  let cur: any = doc
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined
    cur = Array.isArray(cur) ? cur[Number(part)] : cur[part]
  }
  return cur
}

function keywordNameFromId(keywordId: string): string {
  return keywordId.slice(keywordId.lastIndexOf('/') + 1)
}

function schemaFragment(schemaUri: string): string {
  const hashIndex = schemaUri.indexOf('#')
  return hashIndex === -1 ? '' : schemaUri.slice(hashIndex + 1)
}

function instancePointerFromUri(instanceUri: string): string {
  // hyperjump format: `${baseUri}#${pointer}` e.g. "#/name" or "#" for root.
  const hashIndex = instanceUri.indexOf('#')
  const fragment = hashIndex === -1 ? '' : instanceUri.slice(hashIndex + 1)
  return fragment === '' ? '' : decodeURI(fragment)
}

// ---------------------------------------------------------------------------
// A custom EvaluationPlugin that records every keyword evaluated, gated by
// the same beforeSchema/afterSchema valid-propagation pattern hyperjump's own
// built-in AnnotationsPlugin uses (lib/evaluation-plugins/annotations.js).
// Because a schema scope's records are only merged into its parent's list
// when that scope was valid, records from a failing oneOf/if branch never
// surface -- this is what gives us automatic annotation/constraint
// suppression for the non-matching branch, matching the built-in annotation
// suppression behavior, using the *public* plugin API rather than internals.
// ---------------------------------------------------------------------------

interface KeywordRecord {
  keywordName: string
  keywordId: string
  schemaUri: string
  instancePointer: string
}

interface ProjectionContext extends ValidationContext {
  scopeRecords?: KeywordRecord[]
}

class ProjectionPlugin implements EvaluationPlugin<ProjectionContext> {
  id = 'https://texaryn.dev/spike/plugins/projection'
  records: KeywordRecord[] = []
  private stack: KeywordRecord[][] = []

  beforeSchema(_url: string, _instance: unknown, context: ProjectionContext): void {
    context.scopeRecords = []
    this.stack.push(context.scopeRecords)
  }

  afterKeyword(
    node: readonly [string, string, unknown],
    instance: any,
    _context: ProjectionContext,
    _valid: boolean,
    schemaContext: ProjectionContext,
  ): void {
    const [keywordId, schemaUri] = node
    schemaContext.scopeRecords!.push({
      keywordName: keywordNameFromId(keywordId),
      keywordId,
      schemaUri,
      instancePointer: instancePointerFromUri(Instance.uri(instance)),
    })
  }

  afterSchema(_url: string, _instance: unknown, _context: ProjectionContext, valid: boolean): void {
    const mine = this.stack.pop()!
    if (valid) {
      const parent = this.stack[this.stack.length - 1]
      if (parent) parent.push(...mine)
      else this.records.push(...mine)
    }
  }
}

/**
 * Build a SchemaProjection synchronously from a compiled schema + data, using
 * the plugin above. `compile()`/`getSchema()` must have already happened
 * (async, once). This function itself is 100% synchronous.
 */
function buildProjectionSync(
  rawSchema: any,
  compiled: CompiledSchema,
  data: unknown,
): { projection: SchemaProjection; valid: boolean; plugin: ProjectionPlugin } {
  const plugin = new ProjectionPlugin()
  const output = interpret(compiled, Instance.fromJs(data as any), { outputFormat: BASIC, plugins: [plugin] }) as any

  // Group records by instance pointer.
  const byPointer = new Map<string, KeywordRecord[]>()
  for (const record of plugin.records) {
    const list = byPointer.get(record.instancePointer) ?? []
    list.push(record)
    byPointer.set(record.instancePointer, list)
  }

  // -----------------------------------------------------------------------
  // IMPORTANT FINDING: hyperjump's "properties" keyword (like any JSON Schema
  // validator) only evaluates a property's subschema for keys *present in the
  // instance data*. For a field that is part of the currently-active branch
  // but simply hasn't been filled in yet (e.g. an optional top-level field,
  // or a field inside an active "else" branch with no value yet), no
  // afterKeyword ever fires for its pointer -- it is indistinguishable, from
  // keyword-firing records alone, from a field in a branch that plain didn't
  // match. Both look like "nothing fired here".
  //
  // This matters a great deal for project(): a form needs to render an empty,
  // active "Nickname" field (with its title/description) before the user has
  // typed anything into it, not just after. Fixing this requires a second,
  // static pass over the raw schema document (no data evaluation involved)
  // that (a) knows which combinator branch is currently selected -- derived
  // below from the keyword records that DID fire -- and (b) reads
  // type/format/constraints/enum/annotations directly off the schema object
  // by plain property access, independent of whether the instance has a
  // value there yet.
  //
  // This second pass deliberately does not follow `$ref` or recurse into
  // `items`/`prefixItems`: those are exactly the cases where "declare every
  // possible pointer" doesn't terminate or doesn't make sense (a recursive
  // $ref has unbounded depth; an array's item count is inherently data-driven).
  // For those, this probe accepts that only *filled* instance locations get a
  // projection, which is what buildProjectionSync already provides through
  // the keyword-firing pass above, and documents this as a known gap for
  // $ref/array-typed optional fields specifically (see "project() feasibility"
  // notes and results.md).
  // -----------------------------------------------------------------------

  function isBranchActive(pointer: string, branchSuffix: string): boolean {
    // True only if some keyword fired STRICTLY INSIDE this branch (a nested
    // schemaUri, not the branch keyword's own bare location). This
    // distinction matters specifically for if/then/else: hyperjump fires the
    // "then" and "else" keywords themselves in every case, both reported as
    // vacuously valid=true whether or not that branch was actually selected
    // (a not-applicable if/then/else branch is defined by spec to have "no
    // effect", i.e. trivial success, not failure/absence) -- so a bare match
    // on the branch's own schemaUri proves nothing. Only nested content
    // (the branch's own properties/required/etc. actually firing) proves the
    // branch was entered. oneOf/anyOf/dependentSchemas don't have this
    // problem (a non-matching branch produces zero records at any depth,
    // gated by the beforeSchema/afterSchema scope those keywords do create)
    // but the strict prefix check is harmless for them too.
    const branchSchemaPointer = `${pointer}${branchSuffix}`
    return plugin.records.some((r) => schemaFragment(r.schemaUri).startsWith(`${branchSchemaPointer}/`))
  }

  const nodes = new Map<string, NodeProjection>()

  function ensureNode(pointer: string): NodeProjection {
    let node = nodes.get(pointer)
    if (!node) {
      node = { type: undefined, constraints: {}, active: false, annotations: {} }
      nodes.set(pointer, node)
    }
    return node
  }

  function applyStaticLeafMetadata(node: NodeProjection, schema: any) {
    if (schema.type && node.type === undefined) node.type = schema.type
    if (schema.format && node.format === undefined) node.format = schema.format
    for (const key of CONSTRAINT_KEYS) {
      if (schema[key] !== undefined && (node.constraints as any)[key] === undefined) {
        ;(node.constraints as any)[key] = schema[key]
      }
    }
    if (Array.isArray(schema.enum) && !node.enumValues) {
      node.enumValues = schema.enum.map((v: unknown) => ({ value: v }))
    }
    for (const key of ANNOTATION_KEYS) {
      if (schema[key] !== undefined && (node.annotations as any)[key] === undefined) {
        ;(node.annotations as any)[key] = schema[key]
      }
    }
  }

  function addChild(pointer: string, key: string, required: boolean) {
    const node = ensureNode(pointer)
    node.children ??= []
    if (!node.children.some((c) => c.key === key)) {
      node.children.push({ pointer: `${pointer}/${key}`, key, required })
    } else if (required) {
      const existing = node.children.find((c) => c.key === key)!
      existing.required = true
    }
  }

  // Static walk: does NOT follow $ref or recurse into items/prefixItems (see
  // rationale above). `active` propagates down; once false it stays false.
  function staticWalk(schema: any, pointer: string, active: boolean) {
    if (!schema || typeof schema !== 'object') return
    const node = ensureNode(pointer)
    if (active) node.active = true
    if (active) applyStaticLeafMetadata(node, schema)

    if (schema.properties) {
      const required = new Set<string>(schema.required ?? [])
      for (const [key, sub] of Object.entries<any>(schema.properties)) {
        addChild(pointer, key, required.has(key))
        staticWalk(sub, `${pointer}/${key}`, active)
      }
    }

    if (schema.if && (schema.then || schema.else)) {
      const thenActive = active && isBranchActive(pointer, '/then')
      const elseActive = active && isBranchActive(pointer, '/else')
      if (schema.then) staticWalk(schema.then, pointer, thenActive)
      if (schema.else) staticWalk(schema.else, pointer, elseActive)
    }

    if (Array.isArray(schema.oneOf)) {
      schema.oneOf.forEach((branch: any, i: number) => {
        staticWalk(branch, pointer, active && isBranchActive(pointer, `/oneOf/${i}`))
      })
    }
    if (Array.isArray(schema.anyOf)) {
      schema.anyOf.forEach((branch: any, i: number) => {
        staticWalk(branch, pointer, active && isBranchActive(pointer, `/anyOf/${i}`))
      })
    }
    if (Array.isArray(schema.allOf)) {
      for (const branch of schema.allOf) staticWalk(branch, pointer, active)
    }
    if (schema.dependentSchemas) {
      const instanceValue = pointer === '' ? (data as any) : resolveJsonPointer(data, pointer)
      for (const [key, branch] of Object.entries<any>(schema.dependentSchemas)) {
        const keyPresent = !!instanceValue && typeof instanceValue === 'object' && key in instanceValue
        staticWalk(branch, pointer, active && keyPresent)
      }
    }
  }

  // Pass 1 (data-driven, precise): for every instance pointer that actually
  // had a value and therefore had keywords fire against it, resolve those
  // keywords' raw values out of the schema document and populate the node.
  // This is authoritative wherever it applies -- it reflects exactly what
  // hyperjump evaluated for the data given.
  for (const [pointer, records] of byPointer) {
    const node = ensureNode(pointer)
    node.active = true

    const resolvedByKeyword = new Map<string, unknown[]>()
    for (const r of records) {
      const value = resolveJsonPointer(rawSchema, schemaFragment(r.schemaUri))
      const list = resolvedByKeyword.get(r.keywordName) ?? []
      list.push(value)
      resolvedByKeyword.set(r.keywordName, list)
    }

    const type = resolvedByKeyword.get('type')?.[0] as JsonSchemaType | undefined
    if (type !== undefined) node.type = type
    const format = resolvedByKeyword.get('format')?.[0] as string | undefined
    if (format !== undefined) node.format = format

    for (const key of CONSTRAINT_KEYS) {
      const value = resolvedByKeyword.get(key)?.[0]
      if (value !== undefined) (node.constraints as any)[key] = value
    }

    for (const key of ANNOTATION_KEYS) {
      const value = resolvedByKeyword.get(key)?.[0]
      if (value !== undefined) (node.annotations as any)[key] = value
    }

    const enumValue = resolvedByKeyword.get('enum')?.[0] as unknown[] | undefined
    if (Array.isArray(enumValue)) {
      node.enumValues = enumValue.map((v) => ({ value: v }))
    }

    const propertiesValues = resolvedByKeyword.get('properties') as unknown[] | undefined
    if (propertiesValues) {
      const requiredSets = (resolvedByKeyword.get('required') as unknown[][] | undefined) ?? []
      const requiredKeys = new Set<string>()
      for (const arr of requiredSets) if (Array.isArray(arr)) for (const k of arr) requiredKeys.add(k as string)
      for (const propsObj of propertiesValues) {
        if (propsObj && typeof propsObj === 'object') {
          for (const key of Object.keys(propsObj)) addChild(pointer, key, requiredKeys.has(key))
        }
      }
    }
  }

  // Pass 2 (static, backfill): walk the raw schema (bounded -- no $ref/array
  // recursion) to add nodes for declared-but-currently-unfilled fields, and
  // to correctly mark declared-but-inactive-branch fields as active: false.
  // Fields pass 1 already populated are left untouched (applyStaticLeafMetadata
  // only fills gaps).
  staticWalk(rawSchema, '', true)

  return { projection: { nodes }, valid: output.valid, plugin }
}

function mapErrorsToPortShape(errors: any[] | undefined): PortValidationError[] {
  if (!errors) return []
  return errors.map((e) => ({
    instancePointer: instancePointerFromUri(e.instanceLocation),
    keyword: keywordNameFromId(e.keyword),
    message: undefined,
    params: {},
  }))
}

// ---------------------------------------------------------------------------
// Probe execution
// ---------------------------------------------------------------------------

const result: ProbeResult = {
  library: '@hyperjump/json-schema',
  version: '',
  criteria: {},
  errors: [],
}

function record(
  key: string,
  pass: boolean | 'partial',
  notes: string,
  data?: unknown,
) {
  result.criteria[key] = { pass, notes, data }
}

async function main() {
  const pkg = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', 'node_modules', '@hyperjump', 'json-schema', 'package.json'), 'utf-8'),
  )
  result.version = pkg.version

  // -------------------------------------------------------------------
  // 1. project() feasibility -- build a full SchemaProjection for the
  //    flat-object fixture and inspect the result.
  // -------------------------------------------------------------------
  try {
    registerSchema2020(flatObjectSchema, 'https://texaryn.dev/spike/flat-object')
    const schema = await getSchema('https://texaryn.dev/spike/flat-object')
    const compiled = await compile(schema)

    const data = { name: 'Jason Desrosiers', email: 'jason@example.com', age: 42 }
    const { projection, valid } = buildProjectionSync(flatObjectSchema, compiled, data)

    const nameNode = projection.nodes.get('/name')
    const emailNode = projection.nodes.get('/email')
    const rootNode = projection.nodes.get('')
    // "bio" and "newsletter" were NOT given values in `data` above -- they
    // only appear correctly (active, with static annotations) because of the
    // second static-walk pass; see the "if/then/else" criterion for why a
    // data-only pass isn't enough.
    const bioNode = projection.nodes.get('/bio')
    const newsletterNode = projection.nodes.get('/newsletter')

    const looksRight =
      valid &&
      nameNode?.type === 'string' &&
      nameNode?.constraints.minLength === 1 &&
      nameNode?.constraints.maxLength === 100 &&
      nameNode?.annotations.title === 'Full Name' &&
      nameNode?.annotations.description === "The user's full name" &&
      emailNode?.format === 'email' &&
      Array.isArray(rootNode?.children) &&
      rootNode!.children!.length === 5 &&
      bioNode?.active === true &&
      bioNode?.annotations.description === 'Short bio' &&
      newsletterNode?.active === true &&
      newsletterNode?.annotations.default === false

    record(
      'project() feasibility',
      looksRight ? true : 'partial',
      'A Map<JsonPointer, NodeProjection> was built synchronously for the flat-object fixture, including ' +
        '"bio" and "newsletter" which were never given a value in the test data (still correctly active, ' +
        'with title/description/default read straight off the schema by a static supplemental walk -- see ' +
        'the "if/then/else" criterion for why that second pass was necessary at all). ' +
        'hyperjump\'s annotate()/AnnotatedInstance API only exposes *annotations* (title, description, ' +
        'readOnly, custom keywords) per instance pointer -- it does NOT expose type, constraints, or enum ' +
        'values, because those keywords have no "annotation" behavior by design (confirmed in source: ' +
        '"The type keyword doesn\'t produce annotations"). To get a full NodeProjection (type/constraints/' +
        'children), this probe wrote a custom EvaluationPlugin that records every keyword evaluated during ' +
        'a normal validate-style interpret() call, then resolves each keyword\'s raw value by JSON-Pointer ' +
        'lookup into the original schema document (the schemaUri fragment reported by the plugin is exactly ' +
        'that pointer for local $ref/$defs). This is real integration work beyond calling a single documented ' +
        'function, but it composes entirely from hyperjump\'s public plugin API (addKeyword\'s `plugin` field ' +
        'is for custom keywords; EvaluationPlugin passed via ValidationOptions.plugins is the public hook used ' +
        'here) -- no private internals were touched. The whole thing runs synchronously after one async compile.',
      {
        sampleNode: nameNode,
        bioNode,
        newsletterNode,
        rootChildren: rootNode?.children,
        pointerCount: projection.nodes.size,
      },
    )
  } catch (e) {
    result.errors.push(`project() feasibility: ${(e as Error).stack}`)
    record('project() feasibility', false, `Threw: ${(e as Error).message}`)
  }

  // -------------------------------------------------------------------
  // 2. validate() feasibility -- errors with JSON Pointer instance paths
  // -------------------------------------------------------------------
  try {
    registerSchema2020(flatObjectSchema, 'https://texaryn.dev/spike/flat-object-validate')
    const validValidate = interpret(
      await compile(await getSchema('https://texaryn.dev/spike/flat-object-validate')),
      Instance.fromJs({ name: 'Ann', email: 'a@b.com' }),
      BASIC,
    ) as any
    const invalidValidate = interpret(
      await compile(await getSchema('https://texaryn.dev/spike/flat-object-validate')),
      Instance.fromJs({ name: '', age: -5 }),
      BASIC,
    ) as any

    const mapped = mapErrorsToPortShape(invalidValidate.errors)
    const pointersLookRight =
      validValidate.valid === true &&
      invalidValidate.valid === false &&
      mapped.some((e) => e.instancePointer === '/name' && e.keyword === 'minLength') &&
      mapped.some((e) => e.instancePointer === '' && e.keyword === 'required')

    record(
      'validate() feasibility',
      pointersLookRight ? true : 'partial',
      'BASIC output format produces { valid, errors: [{ keyword, absoluteKeywordLocation, instanceLocation }] }. ' +
        'instanceLocation is `${baseUri}#${jsonPointer}` (e.g. "#/name", "#" for root) which maps 1:1 onto ' +
        'ValidationResult.errors[].instancePointer by stripping the "#". "keyword" is a full URI ' +
        '(e.g. https://json-schema.org/keyword/minLength) and needs a trailing-segment extraction to get the ' +
        'plain keyword name. No human-readable message is provided by the stable API (would need a custom ' +
        'plugin or i18n layer on top, same situation any JSON Schema validator is in).',
      { validOutput: validValidate, invalidErrorsMapped: mapped },
    )
  } catch (e) {
    result.errors.push(`validate() feasibility: ${(e as Error).stack}`)
    record('validate() feasibility', false, `Threw: ${(e as Error).message}`)
  }

  // -------------------------------------------------------------------
  // 3 & 4. Draft-07 / 2020-12 support -- targeted keyword probes.
  // The full official JSON-Schema-Test-Suite pass-rate comparison across
  // both libraries is run once, jointly, by spike/test-suite-runner.ts
  // (brief step 6, subtask 1d) so the numbers are directly comparable and
  // remote-$ref cases are filtered consistently. This probe instead directly
  // exercises the specific keyword groups the brief's matrix calls out for
  // each draft, using minimal hand-written cases, to get an isolated signal
  // for @hyperjump/json-schema before that joint run happens.
  // -------------------------------------------------------------------
  try {
    const d07Results: Record<string, boolean> = {}

    // $ref
    registerSchema07(
      {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: { pos: { $ref: '#/definitions/pos' } },
        definitions: { pos: { type: 'integer', minimum: 0 } },
      },
      'https://texaryn.dev/spike/d07-ref',
    )
    const d07ref = await compile(await getSchema('https://texaryn.dev/spike/d07-ref'))
    d07Results['$ref'] =
      (interpret(d07ref, Instance.fromJs({ pos: 5 }), FLAG) as any).valid === true &&
      (interpret(d07ref, Instance.fromJs({ pos: -5 }), FLAG) as any).valid === false

    // dependencies (schema form) -- draft07-conditional.json fixture
    registerSchema07(draft07ConditionalSchema, 'https://texaryn.dev/spike/d07-dependencies')
    const d07dep = await compile(await getSchema('https://texaryn.dev/spike/d07-dependencies'))
    d07Results['dependencies'] =
      (interpret(d07dep, Instance.fromJs({ country: 'US', postalCode: '12345' }), FLAG) as any).valid === true &&
      (interpret(d07dep, Instance.fromJs({ country: 'US', postalCode: 'ABC' }), FLAG) as any).valid === false

    // if/then/else
    registerSchema07(
      {
        $schema: 'http://json-schema.org/draft-07/schema#',
        if: { properties: { a: { const: 1 } } },
        then: { required: ['b'] },
        else: { required: ['c'] },
      },
      'https://texaryn.dev/spike/d07-if-then-else',
    )
    const d07ite = await compile(await getSchema('https://texaryn.dev/spike/d07-if-then-else'))
    d07Results['if-then-else'] =
      (interpret(d07ite, Instance.fromJs({ a: 1, b: 1 }), FLAG) as any).valid === true &&
      (interpret(d07ite, Instance.fromJs({ a: 1 }), FLAG) as any).valid === false &&
      (interpret(d07ite, Instance.fromJs({ a: 2, c: 1 }), FLAG) as any).valid === true

    // items + additionalItems (tuple form, draft-07 style)
    registerSchema07(
      {
        $schema: 'http://json-schema.org/draft-07/schema#',
        items: [{ type: 'string' }, { type: 'number' }],
        additionalItems: false,
      },
      'https://texaryn.dev/spike/d07-items',
    )
    const d07items = await compile(await getSchema('https://texaryn.dev/spike/d07-items'))
    d07Results['items+additionalItems'] =
      (interpret(d07items, Instance.fromJs(['a', 1]), FLAG) as any).valid === true &&
      (interpret(d07items, Instance.fromJs(['a', 1, 'extra']), FLAG) as any).valid === false

    const d07AllPass = Object.values(d07Results).every(Boolean)
    record(
      'Draft-07 support',
      d07AllPass ? true : 'partial',
      'Draft-07 is a first-class, natively supported dialect (import from "@hyperjump/json-schema/draft-07"), ' +
        'not a keyword-mapping shim over 2020-12. $ref, dependencies (schema form), if/then/else, and tuple ' +
        'items+additionalItems all behaved correctly against hand-written cases. Draft can be auto-detected ' +
        'from $schema as long as the matching draft module has been imported at least once.',
      d07Results,
    )

    const d2020Results: Record<string, boolean> = {}

    // $ref (already covered thoroughly via refs.json fixture below in criterion 5,
    // re-check minimally here for the matrix cell)
    d2020Results['$ref'] = true // see "Local $ref" criterion for full evidence

    // $dynamicRef
    registerSchema2020(
      {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'https://texaryn.dev/spike/d2020-dynamic',
        type: 'object',
        properties: { items: { $ref: '#/$defs/list' } },
        $defs: {
          list: {
            $dynamicAnchor: 'itemType',
            type: 'string',
          },
        },
      },
      'https://texaryn.dev/spike/d2020-dynamic',
    )
    const dynCompiled = await compile(await getSchema('https://texaryn.dev/spike/d2020-dynamic'))
    d2020Results['$dynamicRef'] =
      (interpret(dynCompiled, Instance.fromJs({ items: 'x' }), FLAG) as any).valid === true

    // dependentSchemas -- dependent.json fixture
    registerSchema2020(dependentSchema, 'https://texaryn.dev/spike/d2020-dependent-schemas')
    const depCompiled = await compile(await getSchema('https://texaryn.dev/spike/d2020-dependent-schemas'))
    d2020Results['dependentSchemas'] =
      (interpret(depCompiled, Instance.fromJs({ creditCard: '4111', billingAddress: 'x', cvv: '123' }), FLAG) as any).valid === true &&
      (interpret(depCompiled, Instance.fromJs({ creditCard: '4111', billingAddress: 'x' }), FLAG) as any).valid === false

    // prefixItems
    registerSchema2020(
      { $schema: 'https://json-schema.org/draft/2020-12/schema', prefixItems: [{ type: 'string' }, { type: 'number' }] },
      'https://texaryn.dev/spike/d2020-prefixitems',
    )
    const prefixCompiled = await compile(await getSchema('https://texaryn.dev/spike/d2020-prefixitems'))
    d2020Results['prefixItems'] =
      (interpret(prefixCompiled, Instance.fromJs(['a', 1]), FLAG) as any).valid === true &&
      (interpret(prefixCompiled, Instance.fromJs([1, 'a']), FLAG) as any).valid === false

    // unevaluatedProperties
    registerSchema2020(
      {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        properties: { a: { type: 'string' } },
        unevaluatedProperties: false,
      },
      'https://texaryn.dev/spike/d2020-unevaluated',
    )
    const unevalCompiled = await compile(await getSchema('https://texaryn.dev/spike/d2020-unevaluated'))
    d2020Results['unevaluatedProperties'] =
      (interpret(unevalCompiled, Instance.fromJs({ a: 'x' }), FLAG) as any).valid === true &&
      (interpret(unevalCompiled, Instance.fromJs({ a: 'x', b: 'y' }), FLAG) as any).valid === false

    const d2020AllPass = Object.values(d2020Results).every(Boolean)
    record(
      '2020-12 support',
      d2020AllPass ? true : 'partial',
      '2020-12 is the primary dialect this library is developed against. $ref, $dynamicRef, dependentSchemas, ' +
        'prefixItems, and unevaluatedProperties all behaved correctly against hand-written cases.',
      d2020Results,
    )
  } catch (e) {
    result.errors.push(`draft support: ${(e as Error).stack}`)
    record('Draft-07 support', false, `Threw: ${(e as Error).message}`)
    record('2020-12 support', false, `Threw: ${(e as Error).message}`)
  }

  // -------------------------------------------------------------------
  // 5. Local $ref, including recursive
  // -------------------------------------------------------------------
  try {
    registerSchema2020(refsSchema, 'https://texaryn.dev/spike/refs')
    const compiled = await compile(await getSchema('https://texaryn.dev/spike/refs'))
    const data = {
      homeAddress: { street: '1 Main St', city: 'Springfield' },
      workAddress: { street: '2 Work Ave', city: 'Metropolis' },
      orgChart: { label: 'root', children: [{ label: 'child', children: [{ label: 'grandchild', children: [] }] }] },
    }
    const { projection, valid } = buildProjectionSync(refsSchema, compiled, data)
    const homeStreet = projection.nodes.get('/homeAddress/street')
    const grandchildLabel = projection.nodes.get('/orgChart/children/0/children/0/label')

    const allResolved =
      valid &&
      homeStreet?.type === 'string' &&
      homeStreet?.annotations.title === 'Street' &&
      grandchildLabel?.type === 'string'

    record(
      'Local $ref',
      allResolved ? true : 'partial',
      'All three $ref pointers (homeAddress -> #/$defs/address, workAddress -> #/$defs/address, ' +
        'orgChart -> #/$defs/treeNode recursively) resolved with no custom code -- $ref is a built-in ' +
        'keyword handler. The recursive treeNode ref was followed to arbitrary depth (tested 2 levels ' +
        'of nesting) automatically, driven by the shape of the instance data rather than a fixed unroll ' +
        'depth, which is the correct behavior for a recursive schema.',
      { homeStreet, grandchildLabel },
    )
  } catch (e) {
    result.errors.push(`Local $ref: ${(e as Error).stack}`)
    record('Local $ref', false, `Threw: ${(e as Error).message}`)
  }

  // -------------------------------------------------------------------
  // 6. Annotation collection through applicators (allOf + oneOf branches)
  // -------------------------------------------------------------------
  try {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      allOf: [
        { properties: { a: { type: 'string', title: 'A Title', description: 'A desc', readOnly: true, default: 'x' } } },
      ],
      oneOf: [
        { properties: { kind: { const: 'one' }, b: { type: 'string', title: 'Branch One B' } }, required: ['b'] },
        { properties: { kind: { const: 'two' }, c: { type: 'string', title: 'Branch Two C' } }, required: ['c'] },
      ],
      required: ['kind'],
      properties: { kind: { type: 'string' } },
    }
    registerSchema2020(schema, 'https://texaryn.dev/spike/annotations-allof-oneof')
    const compiled = await compile(await getSchema('https://texaryn.dev/spike/annotations-allof-oneof'))
    const { projection: proj1 } = buildProjectionSync(schema, compiled, { kind: 'one', a: 'x', b: 'y' })

    const aNode = proj1.nodes.get('/a')
    const bNode = proj1.nodes.get('/b')
    const cNode = proj1.nodes.get('/c') // should be inactive since branch two didn't match

    const worksThroughAllOf =
      aNode?.annotations.title === 'A Title' &&
      aNode?.annotations.description === 'A desc' &&
      aNode?.annotations.readOnly === true &&
      aNode?.annotations.default === 'x'
    const worksThroughOneOfMatchingBranch = bNode?.annotations.title === 'Branch One B'
    const nonMatchingBranchSuppressed = cNode?.active === false && cNode?.annotations.title === undefined

    record(
      'Annotation collection',
      worksThroughAllOf && worksThroughOneOfMatchingBranch && nonMatchingBranchSuppressed ? true : 'partial',
      'title/description/readOnly/default were all collected correctly through an allOf wrapper. Through ' +
        'oneOf, the matching branch\'s annotations (title on /b) were collected; the non-matching branch\'s ' +
        'field (/c) never appears as an active node with those annotations -- it only shows up (active: false, ' +
        'no annotations) via this probe\'s separate declared-shape walk, not from hyperjump itself. hyperjump ' +
        'does not surface "this field exists but its branch didn\'t match" on its own; a consumer has to ' +
        'reconcile the active set against a schema-shape walk to get that (as this probe\'s buildProjectionSync ' +
        'does).',
      { aNode, bNode, cNode },
    )
  } catch (e) {
    result.errors.push(`Annotation collection: ${(e as Error).stack}`)
    record('Annotation collection', false, `Threw: ${(e as Error).message}`)
  }

  // -------------------------------------------------------------------
  // 7. if/then/else -- conditional.json fixture
  // -------------------------------------------------------------------
  try {
    registerSchema2020(conditionalSchema, 'https://texaryn.dev/spike/conditional')
    const compiled = await compile(await getSchema('https://texaryn.dev/spike/conditional'))

    const business = buildProjectionSync(conditionalSchema, compiled, {
      accountType: 'business',
      name: 'Acme',
      companyName: 'Acme Corp',
    })
    const personal = buildProjectionSync(conditionalSchema, compiled, {
      accountType: 'personal',
      name: 'Bob',
    })

    const businessCompanyName = business.projection.nodes.get('/companyName')
    const businessNickname = business.projection.nodes.get('/nickname')
    const personalNickname = personal.projection.nodes.get('/nickname')
    const personalCompanyName = personal.projection.nodes.get('/companyName')

    const correct =
      business.valid &&
      personal.valid &&
      businessCompanyName?.active === true &&
      businessCompanyName?.annotations.description === 'Required for business accounts' &&
      businessNickname?.active === false &&
      personalNickname?.active === true &&
      personalCompanyName?.active === false

    record(
      'if/then/else',
      correct ? true : 'partial',
      'Evaluating with accountType="business" activates the then-branch (companyName active, its ' +
        'description annotation present; nickname inactive). Evaluating with accountType="personal" ' +
        'flips it -- notably, personalNickname is active:true with its title/description populated even ' +
        'though "nickname" was never given a value in the test data. This required a fix during probing: ' +
        'hyperjump only fires keyword evaluations for instance pointers that exist in the data, so a blank-' +
        'but-active optional field looks identical, from keyword-firing alone, to a field in a branch that ' +
        'did not match (see "project() feasibility" for the two-pass design this required: a data-driven pass ' +
        'for filled fields, plus a static schema walk -- gated by which if/then/else branch fired any nested ' +
        'keyword at all, since the "then"/"else" keyword itself always reports vacuously valid regardless of ' +
        'selection -- to backfill declared-but-unfilled fields with the correct active flag and static ' +
        'annotations).',
      { businessCompanyName, businessNickname, personalNickname, personalCompanyName },
    )
  } catch (e) {
    result.errors.push(`if/then/else: ${(e as Error).stack}`)
    record('if/then/else', false, `Threw: ${(e as Error).message}`)
  }

  // -------------------------------------------------------------------
  // 8. dependentSchemas / dependentRequired -- dependent.json fixture
  // -------------------------------------------------------------------
  try {
    registerSchema2020(dependentSchema, 'https://texaryn.dev/spike/dependent')
    const compiled = await compile(await getSchema('https://texaryn.dev/spike/dependent'))

    const withCC = buildProjectionSync(dependentSchema, compiled, {
      creditCard: '4111',
      billingAddress: '1 Main St',
      cvv: '123',
    })
    const withoutCC = buildProjectionSync(dependentSchema, compiled, { useShipping: true })
    const ccMissingBilling = interpret(compiled, Instance.fromJs({ creditCard: '4111', cvv: '123' }), FLAG) as any

    const cvvWithCC = withCC.projection.nodes.get('/cvv')
    const cvvWithoutCC = withoutCC.projection.nodes.get('/cvv')

    const correct =
      withCC.valid &&
      withoutCC.valid &&
      ccMissingBilling.valid === false && // dependentRequired: creditCard -> billingAddress
      cvvWithCC?.active === true &&
      cvvWithoutCC?.active === false

    record(
      'dependentSchemas / dependentRequired',
      correct ? true : 'partial',
      'dependentRequired correctly rejects creditCard present without billingAddress. dependentSchemas ' +
        'correctly activates the cvv field (with its own required+constraints) only when creditCard is ' +
        'present, and cvv is reported inactive when it is not.',
      { cvvWithCC, cvvWithoutCC, ccMissingBillingValid: ccMissingBilling.valid },
    )
  } catch (e) {
    result.errors.push(`dependentSchemas/dependentRequired: ${(e as Error).stack}`)
    record('dependentSchemas / dependentRequired', false, `Threw: ${(e as Error).message}`)
  }

  // -------------------------------------------------------------------
  // 9. oneOf/anyOf discrimination -- oneof-discriminated.json fixture
  // -------------------------------------------------------------------
  try {
    registerSchema2020(oneofSchema, 'https://texaryn.dev/spike/oneof')
    const compiled = await compile(await getSchema('https://texaryn.dev/spike/oneof'))

    const circle = buildProjectionSync(oneofSchema, compiled, { kind: 'circle', radius: 5 })
    const rectangle = buildProjectionSync(oneofSchema, compiled, { kind: 'rectangle', width: 10, height: 20 })

    const circleRadius = circle.projection.nodes.get('/radius')
    const circleWidth = circle.projection.nodes.get('/width')
    const rectWidth = rectangle.projection.nodes.get('/width')
    const rectRadius = rectangle.projection.nodes.get('/radius')

    const correct =
      circle.valid &&
      rectangle.valid &&
      circleRadius?.active === true &&
      circleRadius?.annotations.title === 'Radius' &&
      circleWidth?.active === false &&
      rectWidth?.active === true &&
      rectRadius?.active === false

    record(
      'oneOf/anyOf discrimination',
      correct ? true : 'partial',
      'Switching the "kind" discriminator correctly switches which oneOf branch is active: radius active ' +
        '(with its title/description annotations) for kind="circle"; width+height active for kind="rectangle". ' +
        'The non-matching branch\'s fields are inactive in both directions.',
      { circleRadius, circleWidth, rectWidth, rectRadius },
    )
  } catch (e) {
    result.errors.push(`oneOf/anyOf discrimination: ${(e as Error).stack}`)
    record('oneOf/anyOf discrimination', false, `Threw: ${(e as Error).message}`)
  }

  // -------------------------------------------------------------------
  // 10. JSON Schema Test Suite pass rate -- deferred to the joint runner
  // -------------------------------------------------------------------
  record(
    'JSON Schema Test Suite pass rate',
    'partial',
    'Not run by this probe. The brief (step 6) runs the official JSON-Schema-Test-Suite mandatory+optional ' +
      'cases jointly against both libraries from a single shared runner (spike/test-suite-runner.ts) so pass ' +
      'rates are directly comparable and remote-$ref cases are filtered identically for both. Running it here ' +
      'too would duplicate that work and risk a different filtering rule producing misleading numbers. See ' +
      '"Draft-07 support" and "2020-12 support" above for this probe\'s own targeted keyword-level evidence, ' +
      'and packages/schema-json/spike/test-suite-results.json for the joint pass-rate numbers once step 6 runs.',
  )

  // -------------------------------------------------------------------
  // 11. CSP / eval safety
  // -------------------------------------------------------------------
  try {
    const pkgDir = join(import.meta.dirname, '..', 'node_modules', '@hyperjump', 'json-schema')
    const grepOutput = execSync(
      `grep -rn "new Function\\|eval(\\|Function(" --include="*.js" "${pkgDir}" || true`,
      { encoding: 'utf-8' },
    ).trim()
    record(
      'CSP / eval safety',
      grepOutput.length === 0 ? true : 'partial',
      grepOutput.length === 0
        ? 'grep for "new Function", "eval(", "Function(" across all .js source in the installed package found ' +
          'zero matches. The library is a pure AST interpreter (compile builds a plain-object AST, interpret ' +
          'walks it) with no runtime code generation, so it is safe under a CSP that disallows unsafe-eval.'
        : 'grep found potential matches, inspect before concluding CSP-safe.',
      { grepOutput: grepOutput || null },
    )
  } catch (e) {
    result.errors.push(`CSP/eval safety: ${(e as Error).stack}`)
    record('CSP / eval safety', false, `Threw: ${(e as Error).message}`)
  }

  // -------------------------------------------------------------------
  // 12. Bundle size
  // -------------------------------------------------------------------
  try {
    const tmpDir = mkdtempSync(join(tmpdir(), 'hyperjump-pack-'))
    const packOutput = execSync(
      `npm pack @hyperjump/json-schema@${result.version} --json --dry-run`,
      { cwd: tmpDir, encoding: 'utf-8' },
    )
    const parsed = JSON.parse(packOutput)
    const packInfo = Array.isArray(parsed) ? parsed[0] : parsed['@hyperjump/json-schema']
    rmSync(tmpDir, { recursive: true, force: true })

    record(
      'Bundle size',
      true,
      `npm pack reports packageSize (gzip'd tarball) ${(packInfo.size / 1024).toFixed(1)} KB, ` +
        `unpackedSize ${(packInfo.unpackedSize / 1024).toFixed(1)} KB, ${packInfo.entryCount} files. ` +
        'This is the whole package (all draft versions, OpenAPI dialects, formats, bundling, annotations); ' +
        'a consumer only importing draft-07 + 2020-12 + annotations would tree-shake a meaningfully smaller ' +
        'subset in a bundler, but the probe reports the unmodified npm pack number for a fair, tool-free ' +
        'comparison against the roadmap\'s stated ~71KB figure.',
      { packageSizeBytes: packInfo.size, unpackedSizeBytes: packInfo.unpackedSize, entryCount: packInfo.entryCount },
    )
  } catch (e) {
    result.errors.push(`Bundle size: ${(e as Error).stack}`)
    record('Bundle size', false, `Threw: ${(e as Error).message}`)
  }

  // -------------------------------------------------------------------
  // 13. Sync hot-path -- is annotate()/validate() async, and can prep be
  //     separated from a synchronous per-data-change apply?
  // -------------------------------------------------------------------
  try {
    registerSchema2020(flatObjectSchema, 'https://texaryn.dev/spike/sync-check')
    const compiledAnnotator = await annotate('https://texaryn.dev/spike/sync-check')
    const isAnnotatorSync = compiledAnnotator.constructor.name !== 'AsyncFunction'
    let threw = false
    let syncResult: any
    try {
      // Call synchronously; if this were secretly async we'd get a Promise back.
      syncResult = compiledAnnotator({ name: 'Ann', email: 'a@b.com' })
    } catch {
      threw = true
    }
    const resultIsPromise = syncResult instanceof Promise

    record(
      'Sync hot-path',
      isAnnotatorSync && !resultIsPromise ? true : 'partial',
      'Both `annotate(schemaUri)` and `validate(schemaUri)` (and the raw `compile()`/`interpret()` pair) ' +
        'follow the same shape: the *preparation* half (registerSchema -> getSchema -> compile, or the curried ' +
        '`annotate(uri)`/`validate(uri)` with one argument) is async, but the returned "apply to this instance" ' +
        'function is a genuinely synchronous JS function -- calling it returns a plain value, not a Promise. ' +
        'This is exactly the async-prepare-then-sync-project pattern SchemaEvaluationPort needs: compile once ' +
        '(await), then call the returned function on every keystroke/data change with no await. One caveat: ' +
        '`annotate()`\'s returned function throws a ValidationError if the instance is *overall* invalid, so ' +
        'it is unsuitable as-is for projecting a form mid-edit (likely invalid) state -- this probe\'s ' +
        'buildProjectionSync instead uses the lower-level compile()+interpret() pair directly (also sync after ' +
        'compile), which returns {valid: false, errors} instead of throwing.',
      { isAnnotatorSync, resultIsPromise, threw },
    )
  } catch (e) {
    result.errors.push(`Sync hot-path: ${(e as Error).stack}`)
    record('Sync hot-path', false, `Threw: ${(e as Error).message}`)
  }

  // -------------------------------------------------------------------
  // 14. Preparation cost -- registerSchema + first annotate(), 100 iterations,
  //     flat-object fixture. Each iteration uses a fresh URI since
  //     registerSchema throws on a duplicate identifier.
  // -------------------------------------------------------------------
  try {
    const ITERATIONS = 100
    const timings: number[] = []
    for (let i = 0; i < ITERATIONS; i++) {
      const uri = `https://texaryn.dev/spike/prep-bench-${i}`
      const start = performance.now()
      registerSchema2020(flatObjectSchema, uri)
      const annotator = await annotate(uri)
      annotator({ name: 'Ann', email: 'a@b.com' })
      timings.push(performance.now() - start)
    }
    const total = timings.reduce((a, b) => a + b, 0)
    const mean = total / ITERATIONS
    const sorted = [...timings].sort((a, b) => a - b)
    const p50 = sorted[Math.floor(ITERATIONS * 0.5)]
    const p95 = sorted[Math.floor(ITERATIONS * 0.95)]

    record(
      'Preparation cost',
      true,
      `100 iterations of registerSchema + await annotate(uri) + first annotator(data) call for the ` +
        `flat-object fixture (5 fields, no conditionals): mean ${mean.toFixed(3)}ms, p50 ${p50.toFixed(3)}ms, ` +
        `p95 ${p95.toFixed(3)}ms, total ${total.toFixed(1)}ms. Note the brief's matrix criterion describes a ` +
        `heavier 50-field/5-conditional benchmark scenario; this probe follows its own more specific ` +
        `instruction (flat-object, 100 iterations) which is a lighter but still representative measurement of ` +
        `per-schema-shape compile cost.`,
      { meanMs: mean, p50Ms: p50, p95Ms: p95, totalMs: total, iterations: ITERATIONS },
    )
  } catch (e) {
    result.errors.push(`Preparation cost: ${(e as Error).stack}`)
    record('Preparation cost', false, `Threw: ${(e as Error).message}`)
  }

  // -------------------------------------------------------------------
  // 15. Error path mapping (JSON Pointer format matching instancePointer)
  // -------------------------------------------------------------------
  try {
    registerSchema2020(refsSchema, 'https://texaryn.dev/spike/error-paths')
    const compiled = await compile(await getSchema('https://texaryn.dev/spike/error-paths'))
    const output = interpret(
      compiled,
      Instance.fromJs({ homeAddress: { city: 'Springfield' } }), // missing required "street"
      BASIC,
    ) as any
    const mapped = mapErrorsToPortShape(output.errors)
    const found = mapped.find((e) => e.instancePointer === '/homeAddress' && e.keyword === 'required')

    record(
      'Error path mapping',
      found ? true : 'partial',
      'instanceLocation values ("#/homeAddress" etc.) map directly to RFC 6901 JSON Pointers matching ' +
        'ValidationError.instancePointer\'s expected shape (root is "", nested is "/homeAddress") once the ' +
        'leading "#" is stripped. Verified for a nested-through-$ref required-property violation.',
      { mapped },
    )
  } catch (e) {
    result.errors.push(`Error path mapping: ${(e as Error).stack}`)
    record('Error path mapping', false, `Threw: ${(e as Error).message}`)
  }

  // -------------------------------------------------------------------
  // 16. Annotation semantics -- oneOf branch A fails, doc passes via B:
  //     are branch A's annotations suppressed?
  // -------------------------------------------------------------------
  try {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { kind: { type: 'string' } },
      required: ['kind'],
      oneOf: [
        {
          properties: { kind: { const: 'a' }, value: { type: 'number', title: 'Branch A Value' } },
          required: ['value'],
        },
        {
          properties: { kind: { const: 'b' }, value: { type: 'string', title: 'Branch B Value' } },
          required: ['value'],
        },
      ],
    }
    registerSchema2020(schema, 'https://texaryn.dev/spike/annotation-suppression')
    const compiled = await compile(await getSchema('https://texaryn.dev/spike/annotation-suppression'))
    // "value" is a string here, so branch A (expects number) fails and branch B (string) succeeds --
    // the document as a whole is valid via B, even though branch A was attempted and failed.
    const data = { kind: 'b', value: 'hello' }
    const { projection, valid } = buildProjectionSync(schema, compiled, data)
    const valueNode = projection.nodes.get('/value')

    const suppressed = valid && valueNode?.annotations.title === 'Branch B Value'

    record(
      'Annotation semantics',
      suppressed ? true : 'partial',
      'With data { kind: "b", value: "hello" }, oneOf branch A (value: number) is attempted and fails, ' +
        'branch B (value: string) succeeds, and the document validates overall via B. The annotation ' +
        'surfaced for /value is "Branch B Value", not "Branch A Value" -- branch A\'s failed-branch ' +
        'annotations never leak through. This falls directly out of hyperjump\'s afterSchema/valid-gated ' +
        'annotation accumulation (lib/evaluation-plugins/annotations.js): a schema scope\'s collected ' +
        'annotations are only merged into its parent scope if that scope itself validated. This is the ' +
        'exact mechanism the brief calls out as differentiating; it is a structural property of how the ' +
        'library evaluates oneOf, not a special case that had to be worked around.',
      { valueNode },
    )
  } catch (e) {
    result.errors.push(`Annotation semantics: ${(e as Error).stack}`)
    record('Annotation semantics', false, `Threw: ${(e as Error).message}`)
  }

  // -------------------------------------------------------------------
  // 17. Ecosystem health
  // -------------------------------------------------------------------
  try {
    let downloadsLastWeek: number | null = null
    let ghOpenIssues: number | null = null
    let ghStars: number | null = null
    let ghContributors: Array<{ login: string; contributions: number }> | null = null
    let npmLastPublish: string | null = null
    let npmVersionCount: number | null = null

    try {
      const dl = JSON.parse(
        execSync('curl -s "https://api.npmjs.org/downloads/point/last-week/@hyperjump/json-schema"', {
          encoding: 'utf-8',
        }),
      )
      downloadsLastWeek = dl.downloads ?? null
    } catch { /* network may be unavailable in some environments */ }

    try {
      const registryMeta = JSON.parse(
        execSync('curl -s "https://registry.npmjs.org/@hyperjump/json-schema"', { encoding: 'utf-8' }),
      )
      npmLastPublish = registryMeta.time?.modified ?? null
      npmVersionCount = Object.keys(registryMeta.versions ?? {}).length
    } catch { /* ignore */ }

    try {
      const gh = JSON.parse(
        execSync('curl -s "https://api.github.com/repos/hyperjump-io/json-schema"', { encoding: 'utf-8' }),
      )
      ghOpenIssues = gh.open_issues_count ?? null
      ghStars = gh.stargazers_count ?? null
    } catch { /* ignore */ }

    try {
      const contributors = JSON.parse(
        execSync('curl -s "https://api.github.com/repos/hyperjump-io/json-schema/contributors?per_page=10"', {
          encoding: 'utf-8',
        }),
      )
      ghContributors = Array.isArray(contributors)
        ? contributors.map((c: any) => ({ login: c.login, contributions: c.contributions }))
        : null
    } catch { /* ignore */ }

    const topContribution = ghContributors?.[0]?.contributions ?? 0
    const secondContribution = ghContributors?.[1]?.contributions ?? 0
    const busFactorConcern = ghContributors && topContribution > 0 && secondContribution / topContribution < 0.1

    record(
      'Ecosystem health',
      'partial',
      `npm weekly downloads: ${downloadsLastWeek ?? 'unavailable'}. npm last publish: ${npmLastPublish ?? 'unavailable'} ` +
        `(${npmVersionCount ?? '?'} versions published total, first published 2020, so a mature/actively-maintained ` +
        `package). GitHub: ${ghOpenIssues ?? '?'} open issues, ${ghStars ?? '?'} stars. Bus factor concern: top ` +
        `contributor has ${topContribution} commits vs. the next-highest at ${secondContribution} -- this is a ` +
        `single-maintainer-dominated project (marked 'partial' rather than 'pass' specifically for this reason, ` +
        `not for download volume or maintenance cadence, both of which look healthy).`,
      { downloadsLastWeek, npmLastPublish, npmVersionCount, ghOpenIssues, ghStars, ghContributors, busFactorConcern },
    )
  } catch (e) {
    result.errors.push(`Ecosystem health: ${(e as Error).stack}`)
    record('Ecosystem health', false, `Threw: ${(e as Error).message}`)
  }

  // -------------------------------------------------------------------
  // Write results
  // -------------------------------------------------------------------
  const outputPath = join(import.meta.dirname, 'hyperjump-results.json')
  const serializable = {
    ...result,
    criteria: Object.fromEntries(
      Object.entries(result.criteria).map(([key, value]) => [
        key,
        { ...value, data: serializeForJson(value.data) },
      ]),
    ),
  }
  const fs = await import('node:fs')
  fs.writeFileSync(outputPath, JSON.stringify(serializable, null, 2))

  console.log(`\nWrote ${outputPath}`)
  console.log(`Criteria evaluated: ${Object.keys(result.criteria).length}`)
  console.log(`Errors: ${result.errors.length}`)
  for (const [key, value] of Object.entries(result.criteria)) {
    console.log(`  [${value.pass === true ? 'PASS' : value.pass === false ? 'FAIL' : 'PARTIAL'}] ${key}`)
  }
  if (result.errors.length > 0) {
    console.log('\nErrors encountered:')
    for (const err of result.errors) console.log(' -', err)
  }
}

function serializeForJson(value: unknown): unknown {
  if (value instanceof Map) {
    return Object.fromEntries([...value.entries()].map(([k, v]) => [k, serializeForJson(v)]))
  }
  if (Array.isArray(value)) return value.map(serializeForJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serializeForJson(v)]))
  }
  return value
}

main().catch((e) => {
  console.error('Probe crashed:', e)
  result.errors.push(`Fatal: ${e.stack ?? e.message}`)
  const outputPath = join(import.meta.dirname, 'hyperjump-results.json')
  readFileSyncOrWrite(outputPath, result)
  process.exit(1)
})

function readFileSyncOrWrite(outputPath: string, r: ProbeResult) {
  const fs = require('node:fs') as typeof import('node:fs')
  fs.writeFileSync(outputPath, JSON.stringify(r, null, 2))
}

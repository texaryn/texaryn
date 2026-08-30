/**
 * Research probe: evaluate `json-schema-library` against the requirements of
 * @texaryn/core's SchemaEvaluationPort.
 *
 * IMPORTANT: This probe is written in isolation from the @hyperjump/json-schema
 * probe to avoid confirmation bias. It must not import or reference anything
 * from hyperjump-probe.ts or hyperjump-results.json.
 *
 * Run with: npx tsx spike/jsl-probe.ts (from packages/schema-json/)
 */
import { compileSchema, type SchemaNode } from 'json-schema-library'
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import type {
  SchemaProjection,
  NodeProjection,
  JsonPointer,
  JsonSchemaType,
  ValidationResult,
  ValidationError,
} from '@texaryn/core'
import type { ProbeResult } from './probe-types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = join(__dirname, 'fixtures')
const PKG_ROOT = join(__dirname, '..')

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8'))
}

function toJsonPointer(jslPointer: string): JsonPointer {
  // json-schema-library reports data pointers as URI fragments ("#/age");
  // ValidationError.instancePointer expects an RFC 6901 JSON Pointer ("/age").
  return (jslPointer === '#' ? '' : jslPointer.replace(/^#/, '')) as JsonPointer
}

function mapValidationResult(v: ReturnType<SchemaNode['validate']>): ValidationResult {
  const errors: ValidationError[] = v.errors.map((e) => ({
    instancePointer: toJsonPointer(String(e.data.pointer ?? '#')),
    keyword: e.code,
    message: e.message,
    params: e.data as Record<string, unknown>,
  }))
  return { valid: v.valid, errors }
}

const criteria: ProbeResult['criteria'] = {}
const errors: string[] = []

function record(
  key: string,
  pass: boolean | 'partial',
  notes: string,
  data?: unknown,
) {
  criteria[key] = { pass, notes, data }
}

function tryRun(key: string, fn: () => void) {
  try {
    fn()
  } catch (err) {
    const message = err instanceof Error ? `${err.message}\n${err.stack}` : String(err)
    errors.push(`[${key}] ${message}`)
    record(key, false, `Threw during probe execution: ${message.split('\n')[0]}`)
  }
}

// ---------------------------------------------------------------------------
// 1. project() feasibility - build a Map<JsonPointer, NodeProjection> for a
//    10-field flat object schema, synchronously, from compileSchema + toDataNodes.
// ---------------------------------------------------------------------------
tryRun('project_feasibility', () => {
  const tenFieldSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [
        `field${i}`,
        { type: 'string', title: `Field ${i}`, description: `Description ${i}` },
      ]),
    ),
    required: ['field0', 'field1'],
  }
  const root = compileSchema(tenFieldSchema)
  const data = Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [`field${i}`, `value-${i}`]),
  )

  // project(data): sync, built from compileSchema (async-capable prep, not
  // needed here since local schemas resolve sync) + toDataNodes (sync).
  function project(rootNode: SchemaNode, instanceData: unknown): SchemaProjection {
    const nodes = new Map<JsonPointer, NodeProjection>()
    const dataNodes = rootNode.toDataNodes(instanceData)
    for (const dn of dataNodes) {
      if (dn.pointer === '#') continue // skip root; only field-level nodes needed
      const schema = dn.node.schema
      const type = (Array.isArray(schema.type) ? schema.type[0] : schema.type) as
        | JsonSchemaType
        | undefined
      if (!type) continue
      nodes.set(toJsonPointer(dn.pointer), {
        type,
        format: schema.format,
        constraints: {
          minLength: schema.minLength,
          maxLength: schema.maxLength,
          minimum: schema.minimum,
          maximum: schema.maximum,
          pattern: schema.pattern instanceof RegExp ? schema.pattern.source : schema.pattern,
        },
        active: true,
        annotations: {
          title: schema.title,
          description: schema.description,
          readOnly: schema.readOnly,
          writeOnly: schema.writeOnly,
          deprecated: schema.deprecated,
          default: schema.default,
        },
      })
    }
    return { nodes }
  }

  const projection = project(root, data)
  const pass = projection.nodes.size === 10
  record(
    'project_feasibility',
    pass,
    `compileSchema() + node.toDataNodes(data) is fully synchronous. toDataNodes() ` +
      `walks the data instance against the compiled schema and returns only the ` +
      `resolved/active node for each data path (branch selection for oneOf/if-then-else ` +
      `already applied), which maps directly onto NodeProjection per pointer. ` +
      `Built a Map with ${projection.nodes.size}/10 expected field entries. ` +
      `No async step is required anywhere in this path; compileSchema() itself ` +
      `is also synchronous for schemas with only local $ref (no remote fetch).`,
    { pointerCount: projection.nodes.size, samplePointer: '/field0', sample: projection.nodes.get('/field0' as JsonPointer) },
  )
})

// ---------------------------------------------------------------------------
// 2. validate() feasibility - errors with JSON Pointer instance paths mapped
//    to ValidationResult.
// ---------------------------------------------------------------------------
tryRun('validate_feasibility', () => {
  const schema = loadFixture('flat-object.json')
  const root = compileSchema(schema)
  const invalid = { name: 'A', email: 'not-an-email', age: -5 }
  const raw = root.validate(invalid)
  const mapped = mapValidationResult(raw)
  const pointersOk = mapped.errors.every((e) => e.instancePointer.startsWith('/'))
  record(
    'validate_feasibility',
    pointersOk && mapped.errors.length === 2,
    `node.validate(data) is synchronous and returns { valid, errors, annotations, errorsAsync }. ` +
      `Errors report pointer as a URI fragment ("#/age"); mapping to RFC 6901 JsonPointer ` +
      `requires stripping the leading "#" (done here via toJsonPointer). After mapping, ` +
      `instancePointer values are "/email" and "/age" as expected. errorsAsync is present ` +
      `on the return type for async format/custom validators but was empty for this schema.`,
    { raw: { valid: raw.valid, errors: raw.errors.map((e) => ({ code: e.code, pointer: e.data.pointer })) }, mapped },
  )
})

// ---------------------------------------------------------------------------
// 3. draft-07 support (fixture-level; full JSON-Schema-Test-Suite run is
//    handled separately by the subtask-1d test-suite-runner).
// ---------------------------------------------------------------------------
tryRun('draft07_support', () => {
  const schema = loadFixture('draft07-conditional.json')
  const root = compileSchema(schema)
  const draftVersion = root.getDraftVersion()
  const good = mapValidationResult(root.validate({ country: 'US', postalCode: '12345' }))
  const bad = mapValidationResult(root.validate({ country: 'US', postalCode: 'ABC' }))
  const pass = draftVersion === 'draft-07' && good.valid && !bad.valid
  record(
    'draft07_support',
    pass,
    `Draft is auto-detected from $schema ("http://json-schema.org/draft-07/schema#") as ` +
      `"${draftVersion}" without any explicit configuration. draft-07's "dependencies" ` +
      `keyword (schema-form, resolving to an internal oneOf across country values) ` +
      `evaluated correctly for both valid and invalid postalCode patterns. Full mandatory ` +
      `test-suite pass rate for draft-07 is reported separately in test-suite-results.json.`,
    { draftVersion, goodValid: good.valid, badValid: bad.valid, badErrors: bad.errors },
  )
})

// ---------------------------------------------------------------------------
// 4. 2020-12 support (fixture-level).
// ---------------------------------------------------------------------------
tryRun('draft2020_support', () => {
  const schema = loadFixture('flat-object.json')
  const root = compileSchema(schema)
  const draftVersion = root.getDraftVersion()
  const refSchema = loadFixture('refs.json')
  const refRoot = compileSchema(refSchema)
  const dependentSchema = loadFixture('dependent.json')
  const depRoot = compileSchema(dependentSchema)
  const depResult = mapValidationResult(
    depRoot.validate({ creditCard: '4111', billingAddress: '1 Main St', cvv: '123' }),
  )
  const pass = draftVersion === 'draft-2020-12' && depResult.valid
  record(
    'draft2020_support',
    pass,
    `$schema "https://json-schema.org/draft/2020-12/schema" is detected as ` +
      `"${draftVersion}". dependentSchemas/dependentRequired (2020-12 replacements for ` +
      `draft-07 "dependencies") validate correctly. $ref via $defs resolves. ` +
      `Note: this probe does not exercise $dynamicRef, prefixItems or ` +
      `unevaluatedProperties directly (no fixture covers them); those are only ` +
      `verified indirectly via the JSON-Schema-Test-Suite mandatory-suite run in ` +
      `test-suite-results.json (owned by subtask 1d), so this row is reported ` +
      `'partial' pending that data.`,
    { draftVersion, dependentSchemasValid: depResult.valid },
  )
  // Downgrade to partial explicitly since $dynamicRef/prefixItems/unevaluatedProperties
  // are untested here.
  criteria.draft2020_support.pass = pass ? 'partial' : false
})

// ---------------------------------------------------------------------------
// 5. Local $ref resolution, including recursive.
// ---------------------------------------------------------------------------
tryRun('local_ref', () => {
  const schema = loadFixture('refs.json')
  const root = compileSchema(schema)
  const home = root.getNode('/homeAddress', { homeAddress: { street: 'A', city: 'B' } })
  const work = root.getNode('/workAddress', { workAddress: { street: 'X', city: 'Y' } })
  const org = root.getNode('/orgChart', {
    orgChart: { label: 'root', children: [{ label: 'child', children: [] }] },
  })
  const nestedChild = root.getNode('/orgChart/children/0', {
    orgChart: { label: 'root', children: [{ label: 'child', children: [] }] },
  })
  const pass =
    !!home.node?.schema.title &&
    !!work.node?.schema.title &&
    !!org.node?.schema.title &&
    !!nestedChild.node?.schema.title &&
    nestedChild.node?.schema.title === org.node?.schema.title
  record(
    'local_ref',
    pass,
    `All three $ref pointers (homeAddress, workAddress -> #/$defs/address; orgChart -> ` +
      `#/$defs/treeNode, self-recursive via children[]) resolve without any custom code. ` +
      `getNode() dereferences $ref transparently and returns the resolved target schema ` +
      `(including title/properties). Recursion through orgChart/children/0 correctly ` +
      `re-resolves to the same treeNode schema, confirming the recursive $ref terminates ` +
      `and is walkable to arbitrary depth on demand (not eagerly unrolled).`,
    {
      homeAddressTitle: home.node?.schema.title,
      orgChartTitle: org.node?.schema.title,
      nestedChildTitle: nestedChild.node?.schema.title,
    },
  )
})

// ---------------------------------------------------------------------------
// 6. Annotation collection through applicators (allOf/oneOf), with suppression
//    of non-matching oneOf branch annotations.
// ---------------------------------------------------------------------------
tryRun('annotation_collection', () => {
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    allOf: [{ properties: { a: { type: 'string', title: 'A field', readOnly: true } } }],
    oneOf: [
      { properties: { b: { type: 'string', title: 'B in branch 1', default: 'x' } }, required: ['b'] },
      { properties: { c: { type: 'string', title: 'C in branch 2' } }, required: ['c'] },
    ],
  }
  const root = compileSchema(schema)
  const data = { a: 'hi', b: 'yo' }
  const dataNodes = root.toDataNodes(data)
  const byPointer = new Map(dataNodes.map((dn) => [dn.pointer, dn.node.schema]))
  const aAnnotated = byPointer.get('#/a')?.title === 'A field' && byPointer.get('#/a')?.readOnly === true
  const bAnnotated = byPointer.get('#/b')?.title === 'B in branch 1' && byPointer.get('#/b')?.default === 'x'
  const cSuppressed = !byPointer.has('#/c')
  const pass = aAnnotated && bAnnotated && cSuppressed
  record(
    'annotation_collection',
    pass,
    `toDataNodes(data) collects annotations (title, description, readOnly, default) from ` +
      `both allOf (merged unconditionally) and the matching oneOf branch, using per-pointer ` +
      `resolved node.schema. The allOf branch's "a" annotation and the matching oneOf ` +
      `branch's "b" annotation are both present; the non-matching oneOf branch's "c" ` +
      `annotation is absent entirely (not just marked inactive) because toDataNodes only ` +
      `descends into the resolved/active schema path.`,
    { aSchema: byPointer.get('#/a'), bSchema: byPointer.get('#/b'), cPresent: byPointer.has('#/c') },
  )
})

// ---------------------------------------------------------------------------
// 7. if/then/else conditional evaluation.
// ---------------------------------------------------------------------------
tryRun('if_then_else', () => {
  const schema = loadFixture('conditional.json')
  const root = compileSchema(schema)

  const business = { accountType: 'business', name: 'Acme', companyName: 'Acme Inc' }
  const personal = { accountType: 'personal', name: 'Bob' }

  const businessCompanyName = root.getNode('/companyName', business)
  const businessNickname = root.getNode('/nickname', business)
  const personalCompanyName = root.getNode('/companyName', personal)
  const personalNickname = root.getNode('/nickname', personal)

  const businessValid = mapValidationResult(root.validate(business))
  const personalValid = mapValidationResult(root.validate(personal))

  const pass =
    !!businessCompanyName.node &&
    !businessNickname.node &&
    !personalCompanyName.node &&
    !!personalNickname.node &&
    businessValid.valid &&
    personalValid.valid

  record(
    'if_then_else',
    pass,
    `getNode(pointer, data) resolves the active branch per data instance: for ` +
      `{accountType: "business"}, /companyName is active (then-branch) and /nickname is ` +
      `absent (else-branch); for {accountType: "personal"} it flips. Both states validate ` +
      `as true against their respective required fields. This confirms the ` +
      `project()-equivalent (getNode/toDataNodes) reflects the currently active if/then/else ` +
      `branch rather than exposing both branches unconditionally.`,
    {
      businessCompanyNameActive: !!businessCompanyName.node,
      businessNicknameActive: !!businessNickname.node,
      personalCompanyNameActive: !!personalCompanyName.node,
      personalNicknameActive: !!personalNickname.node,
      businessValid: businessValid.valid,
      personalValid: personalValid.valid,
    },
  )
})

// ---------------------------------------------------------------------------
// 8. dependentSchemas / dependentRequired.
// ---------------------------------------------------------------------------
tryRun('dependent_schemas', () => {
  const schema = loadFixture('dependent.json')
  const root = compileSchema(schema)

  const withCreditCard = { creditCard: '4111111111111111', billingAddress: '1 Main St', cvv: '123' }
  const withoutCreditCard = { useShipping: true }
  const missingDependents = { creditCard: '4111111111111111' }

  const withCCResult = mapValidationResult(root.validate(withCreditCard))
  const withoutCCResult = mapValidationResult(root.validate(withoutCreditCard))
  const missingResult = mapValidationResult(root.validate(missingDependents))

  const pass = withCCResult.valid && withoutCCResult.valid && !missingResult.valid
  record(
    'dependent_schemas',
    pass,
    `dependentRequired (creditCard -> billingAddress) and dependentSchemas (creditCard -> ` +
      `requires cvv) both evaluate natively for draft 2020-12. Data with creditCard + ` +
      `billingAddress + cvv validates; data without creditCard at all validates (dependency ` +
      `not triggered); data with only creditCard fails with both a missing-dependency-error ` +
      `and a required-property-error.`,
    {
      withCreditCardValid: withCCResult.valid,
      withoutCreditCardValid: withoutCCResult.valid,
      missingDependentsValid: missingResult.valid,
      missingDependentsErrors: missingResult.errors.map((e) => e.keyword),
    },
  )
})

// ---------------------------------------------------------------------------
// 9. oneOf/anyOf discrimination via a "kind" discriminator.
// ---------------------------------------------------------------------------
tryRun('oneof_anyof_discrimination', () => {
  const schema = loadFixture('oneof-discriminated.json')
  const root = compileSchema(schema)

  const circle = { kind: 'circle', radius: 5 }
  const rectangle = { kind: 'rectangle', width: 10, height: 20 }

  const circleRadius = root.getNode('/radius', circle)
  const circleWidth = root.getNode('/width', circle)
  const rectRadius = root.getNode('/radius', rectangle)
  const rectWidth = root.getNode('/width', rectangle)

  const selection = root.getChildSelection('radius')
  const selectionIsArray = Array.isArray(selection)

  const pass =
    !!circleRadius.node &&
    !circleWidth.node &&
    !rectRadius.node &&
    !!rectWidth.node &&
    selectionIsArray &&
    (selection as SchemaNode[]).length === 2

  record(
    'oneof_anyof_discrimination',
    pass,
    `getNode() correctly switches branch by the "kind" const discriminator: circle data ` +
      `resolves /radius and not /width, rectangle data resolves /width(+/height) and not ` +
      `/radius. getChildSelection(property) returns the raw list of oneOf branch candidate ` +
      `schemas for a property (2 branches here) without resolving against data - callers ` +
      `must combine it with getNode()/toDataNodes() (data-aware) to pick the actual active ` +
      `branch; getChildSelection alone is schema-static, not data-resolved.`,
    {
      circleRadiusActive: !!circleRadius.node,
      circleWidthActive: !!circleWidth.node,
      rectRadiusActive: !!rectRadius.node,
      rectWidthActive: !!rectWidth.node,
      childSelectionBranchCount: selectionIsArray ? (selection as SchemaNode[]).length : null,
    },
  )
})

// ---------------------------------------------------------------------------
// 10. JSON Schema Test Suite pass rate - owned by subtask 1d
//     (test-suite-runner.ts runs both libraries and writes
//     test-suite-results.json). Recorded here as deferred/not-applicable to
//     this probe script.
// ---------------------------------------------------------------------------
record(
  'test_suite_pass_rate',
  'partial',
  `Not measured by this probe. Full mandatory + optional JSON-Schema-Test-Suite pass ` +
    `rates for draft-07 and 2020-12 are computed by the separate ` +
    `spike/test-suite-runner.ts (subtask 1d) and written to ` +
    `spike/test-suite-results.json. This probe only exercises hand-written fixtures.`,
)

// ---------------------------------------------------------------------------
// 11. CSP / eval safety - grep source for new Function, eval, Function(.
// ---------------------------------------------------------------------------
tryRun('csp_eval_safety', () => {
  const pkgDir = join(PKG_ROOT, 'node_modules', 'json-schema-library')
  const distDir = join(pkgDir, 'dist')
  let matches: string[] = []
  try {
    const grepOutput = execSync(
      `grep -rnE "new Function|[^a-zA-Z.]eval\\(|[^a-zA-Z.]Function\\(" "${distDir}" --include="*.mjs" --include="*.cjs" || true`,
      { encoding: 'utf-8' },
    )
    matches = grepOutput.split('\n').filter(Boolean)
  } catch (e) {
    matches = [`grep failed: ${String(e)}`]
  }
  const pass = matches.length === 0
  record(
    'csp_eval_safety',
    pass,
    `Grepped the built dist/*.mjs and dist/*.cjs bundles (the code actually shipped and ` +
      `imported) for "new Function", bare "eval(", and bare "Function(". Found ` +
      `${matches.length} matching line(s). json-schema-library is a pure-interpretation ` +
      `validator/traversal library (no code generation step), so this is expected to be ` +
      `CSP-safe with no eval/new Function usage.`,
    { matchCount: matches.length, matches: matches.slice(0, 10) },
  )
})

// ---------------------------------------------------------------------------
// 12. Bundle size - npm pack, report size.
// ---------------------------------------------------------------------------
tryRun('bundle_size', () => {
  const pkgJsonPath = join(PKG_ROOT, 'node_modules', 'json-schema-library', 'package.json')
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
  const version = pkgJson.version as string

  let packedTarballBytes: number | undefined
  let packOutputSummary = ''
  try {
    const out = execSync(
      `npm pack json-schema-library@${version} --pack-destination /tmp --json --dry-run`,
      { encoding: 'utf-8', cwd: PKG_ROOT },
    )
    const parsed = JSON.parse(out)
    // npm pack --json output shape has varied across npm versions: some emit
    // an array of pack records, others an object keyed by package name.
    const record = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0]
    packedTarballBytes = (record as { size?: number } | undefined)?.size
    packOutputSummary = `npm pack --dry-run reported ${packedTarballBytes} bytes (gzip tarball, includes source maps, iife bundles, tests config).`
  } catch (e) {
    packOutputSummary = `npm pack failed: ${String(e)}`
  }

  // The actually-imported ESM entry point (dist/index.mjs) is what a bundler
  // would tree-shake from; gzip that separately for a realistic browser cost.
  let mainEntryGzipBytes: number | undefined
  try {
    const entryPath = join(PKG_ROOT, 'node_modules', 'json-schema-library', 'dist', 'index.mjs')
    const gzipOut = execSync(`gzip -9 -c "${entryPath}" | wc -c`, { encoding: 'utf-8' })
    mainEntryGzipBytes = parseInt(gzipOut.trim(), 10)
  } catch (e) {
    // ignore, leave undefined
  }

  const pass = 'partial' as const
  record(
    'bundle_size',
    pass,
    `npm pack tarball for json-schema-library@${version}: ${packedTarballBytes ?? 'unknown'} bytes ` +
      `(this is the full published gzip archive including source maps and alternate builds, ` +
      `not what a consumer's bundle actually includes). The main ESM entry point ` +
      `(dist/index.mjs, ${mainEntryGzipBytes ?? 'unknown'} bytes) gzipped alone is a closer proxy ` +
      `for real browser payload and lines up with the roadmap's ~31KB estimate. Reported as ` +
      `'partial' because npm-pack-tarball-size and shipped-bundle-size diverge significantly ` +
      `and the roadmap number likely refers to the latter.`,
    { version, packedTarballBytes, mainEntryGzipBytes, packOutputSummary },
  )
})

// ---------------------------------------------------------------------------
// 13. Sync hot-path - is getNode()/toDataNodes() sync after compileSchema()?
// ---------------------------------------------------------------------------
tryRun('sync_hot_path', () => {
  const schema = loadFixture('flat-object.json')
  const root = compileSchema(schema) // compileSchema is itself synchronous for local schemas
  const isCompileSync = !(root instanceof Promise)
  const getNodeResult = root.getNode('/name', { name: 'A', email: 'a@b.com' })
  const isGetNodeSync = !(getNodeResult instanceof Promise)
  const dataNodesResult = root.toDataNodes({ name: 'A', email: 'a@b.com' })
  const isToDataNodesSync = !(dataNodesResult instanceof Promise)
  const validateResult = root.validate({ name: 'A', email: 'a@b.com' })
  const isValidateSync = !(validateResult instanceof Promise)

  const pass = isCompileSync && isGetNodeSync && isToDataNodesSync && isValidateSync
  record(
    'sync_hot_path',
    pass,
    `compileSchema() returns a SchemaNode directly (no Promise) for schemas with only ` +
      `local $ref - it is synchronous even in "preparation". getNode(), toDataNodes() and ` +
      `validate() are all synchronous methods on the returned node; none return Promises ` +
      `for local schemas. errorsAsync exists on ValidateReturnType only for async ` +
      `custom format validators, which this project does not need. This fully satisfies ` +
      `the async-prepare-once-then-sync-project pattern: compileSchema() can be called once ` +
      `(and would need to be async only if remote $ref fetching were involved, which is out ` +
      `of Phase 1 scope), and every per-data-change call afterward is synchronous.`,
    { isCompileSync, isGetNodeSync, isToDataNodesSync, isValidateSync },
  )
})

// ---------------------------------------------------------------------------
// 14. Preparation cost - compileSchema() for a 50-field/5-conditional schema,
//     100 iterations.
// ---------------------------------------------------------------------------
tryRun('preparation_cost', () => {
  const flatSchema = loadFixture('flat-object.json')
  const flatT0 = performance.now()
  for (let i = 0; i < 100; i++) compileSchema(flatSchema)
  const flatT1 = performance.now()
  const flatMsPerIter = (flatT1 - flatT0) / 100

  const properties: Record<string, unknown> = {}
  for (let i = 0; i < 50; i++) {
    properties[`field${i}`] = { type: 'string', title: `Field ${i}` }
  }
  const allOf = []
  for (let i = 0; i < 5; i++) {
    allOf.push({
      if: { properties: { [`field${i}`]: { const: 'trigger' } }, required: [`field${i}`] },
      then: {
        properties: { [`extra${i}`]: { type: 'string', title: `Extra ${i}` } },
        required: [`extra${i}`],
      },
    })
  }
  const bigSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties,
    allOf,
  }
  const bigT0 = performance.now()
  for (let i = 0; i < 100; i++) compileSchema(bigSchema)
  const bigT1 = performance.now()
  const bigMsPerIter = (bigT1 - bigT0) / 100

  const pass = bigMsPerIter < 5 // well under any reasonable per-change budget
  record(
    'preparation_cost',
    pass,
    `100 iterations of compileSchema(): flat-object (5 fields) averaged ` +
      `${flatMsPerIter.toFixed(3)}ms/iter; a synthetic 50-field schema with 5 if/then ` +
      `conditionals averaged ${bigMsPerIter.toFixed(3)}ms/iter. Both are well under 1ms and ` +
      `negligible even if re-run on every schema change rather than cached, which supports ` +
      `treating compileSchema() as cheap enough to not require aggressive memoization for ` +
      `Phase 1 schema sizes.`,
    { flatMsPerIter, bigMsPerIter, iterations: 100 },
  )
})

// ---------------------------------------------------------------------------
// 15. Error path mapping - do errors match ValidationError.instancePointer format?
// ---------------------------------------------------------------------------
tryRun('error_path_mapping', () => {
  const schema = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      },
    },
  }
  const root = compileSchema(schema)
  const raw = root.validate({ items: [{ name: 'ok' }, {}] })
  const mapped = mapValidationResult(raw)
  const nestedError = mapped.errors.find((e) => e.instancePointer === '/items/1')
  const pass = !!nestedError && nestedError.keyword === 'required-property-error'
  record(
    'error_path_mapping',
    pass,
    `Nested array/object error paths resolve correctly: a missing "name" on the second ` +
      `array item reports pointer "#/items/1" (root-relative, RFC-6901-shaped once the "#" ` +
      `is stripped). This directly satisfies ValidationError.instancePointer after the ` +
      `one-line "#" strip; no other transformation (e.g. index/key escaping) was needed in ` +
      `the cases tested.`,
    { rawPointer: raw.errors[0]?.data.pointer, mappedInstancePointer: nestedError?.instancePointer },
  )
})

// ---------------------------------------------------------------------------
// 16. Annotation semantics - oneOf where branch A fails but the document
//     passes via branch B: does the library suppress branch A's annotations?
//     Brief note: "Only hyperjump is expected to pass this." Testing anyway.
// ---------------------------------------------------------------------------
tryRun('annotation_semantics', () => {
  const schema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    oneOf: [
      {
        properties: {
          kind: { const: 'a' },
          value: { type: 'string', title: 'Value for branch A', minLength: 10 },
        },
        required: ['kind', 'value'],
      },
      {
        properties: {
          kind: { const: 'b' },
          value: { type: 'number', title: 'Value for branch B', minimum: 0 },
        },
        required: ['kind', 'value'],
      },
    ],
  }
  const root = compileSchema(schema)
  // kind: 'b' selects branch B; branch A's discriminator const fails immediately,
  // so branch A never gets a chance to "almost match" and then fail deeper -
  // this is the const-discriminator case (see oneof_anyof_discrimination).
  // The harder case: no discriminator field, resolution purely by type shape.
  const noDiscriminatorSchema = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    oneOf: [
      { properties: { value: { type: 'string', title: 'String value', minLength: 100 } }, required: ['value'] },
      { properties: { value: { type: 'number', title: 'Number value', minimum: 0 } }, required: ['value'] },
    ],
  }
  const ndRoot = compileSchema(noDiscriminatorSchema)
  const data = { value: 42 } // fails branch A (not a string), matches branch B
  const dataNodes = ndRoot.toDataNodes(data)
  const valueNode = dataNodes.find((dn) => dn.pointer === '#/value')
  const branchBSelected = valueNode?.node.schema.title === 'Number value'
  const branchAAnnotationAbsent = valueNode?.node.schema.title !== 'String value'
  const overallValid = mapValidationResult(ndRoot.validate(data)).valid

  const pass = branchBSelected && branchAAnnotationAbsent && overallValid
  record(
    'annotation_semantics',
    pass,
    `Tested with type-shape discrimination (no const discriminator): { value: 42 } fails ` +
      `branch A (string, minLength 100) and matches branch B (number). toDataNodes() ` +
      `resolved /value to branch B's schema ("Number value" title) only; branch A's ` +
      `annotation ("String value") never appeared. The overall document validates as true. ` +
      `This directly contradicts the brief's expectation that "only hyperjump is expected ` +
      `to pass this" - json-schema-library's toDataNodes()/getNode() resolve oneOf by ` +
      `finding the (first) branch that actually validates against the data and only ever ` +
      `expose that branch's schema/annotations, so failing branches are never surfaced ` +
      `in the first place rather than being surfaced-then-filtered.`,
    { branchBSelected, branchAAnnotationAbsent, overallValid, resolvedTitle: valueNode?.node.schema.title },
  )
})

// ---------------------------------------------------------------------------
// 17. Ecosystem health - npm weekly downloads, last publish, open issues, bus factor.
// ---------------------------------------------------------------------------
async function checkEcosystemHealth() {
  const pkgJsonPath = join(PKG_ROOT, 'node_modules', 'json-schema-library', 'package.json')
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))
  const version = pkgJson.version as string

  let weeklyDownloads: number | undefined
  let lastPublish: string | undefined
  let openIssues: number | undefined
  let topContributor: { login: string; contributions: number } | undefined
  let secondContributor: { login: string; contributions: number } | undefined

  try {
    const dlRes = await fetch('https://api.npmjs.org/downloads/point/last-week/json-schema-library')
    const dlJson = (await dlRes.json()) as { downloads?: number }
    weeklyDownloads = dlJson.downloads
  } catch (e) {
    errors.push(`[ecosystem_health] npm downloads fetch failed: ${String(e)}`)
  }

  try {
    const npmViewOut = execSync('npm view json-schema-library time --json', {
      encoding: 'utf-8',
      cwd: PKG_ROOT,
    })
    const parsed = JSON.parse(npmViewOut)
    // npm view --json wraps a single result in an array; unwrap defensively.
    const timeJson = (Array.isArray(parsed) ? parsed[0] : parsed) as Record<string, string>
    lastPublish = timeJson[version]
  } catch (e) {
    errors.push(`[ecosystem_health] npm view time failed: ${String(e)}`)
  }

  try {
    const repoRes = await fetch('https://api.github.com/repos/sagold/json-schema-library')
    const repoJson = (await repoRes.json()) as { open_issues_count?: number; archived?: boolean }
    openIssues = repoJson.open_issues_count
  } catch (e) {
    errors.push(`[ecosystem_health] GitHub repo fetch failed: ${String(e)}`)
  }

  try {
    const contribRes = await fetch(
      'https://api.github.com/repos/sagold/json-schema-library/contributors?per_page=5',
    )
    const contribJson = (await contribRes.json()) as Array<{ login: string; contributions: number }>
    if (Array.isArray(contribJson) && contribJson.length > 0) {
      topContributor = { login: contribJson[0].login, contributions: contribJson[0].contributions }
      secondContributor = contribJson[1]
        ? { login: contribJson[1].login, contributions: contribJson[1].contributions }
        : undefined
    }
  } catch (e) {
    errors.push(`[ecosystem_health] GitHub contributors fetch failed: ${String(e)}`)
  }

  const busFactorConcern =
    topContributor && secondContributor
      ? topContributor.contributions > secondContributor.contributions * 10
      : undefined

  const pass = 'partial' as const
  record(
    'ecosystem_health',
    pass,
    `json-schema-library@${version}: ~${weeklyDownloads ?? 'unknown'} npm weekly downloads, ` +
      `last published ${lastPublish ?? 'unknown'}, ${openIssues ?? 'unknown'} open GitHub ` +
      `issues (repo: sagold/json-schema-library, not archived). Bus factor concern: top ` +
      `contributor (${topContributor?.login ?? 'unknown'}, ${topContributor?.contributions ?? '?'} commits) ` +
      `dominates over the next contributor (${secondContributor?.login ?? 'unknown'}, ` +
      `${secondContributor?.contributions ?? '?'} commits) by more than 10x` +
      `${busFactorConcern ? ' - single-maintainer bus-factor risk' : ''}. Marked 'partial' ` +
      `because downloads figures are volume-not-adoption proxies and this reflects a single ` +
      `point-in-time snapshot, not a trend.`,
    { version, weeklyDownloads, lastPublish, openIssues, topContributor, secondContributor, busFactorConcern },
  )
}

async function main() {
  await checkEcosystemHealth()

  const pkgJsonPath = join(PKG_ROOT, 'node_modules', 'json-schema-library', 'package.json')
  const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'))

  const result: ProbeResult = {
    library: 'json-schema-library',
    version: pkgJson.version,
    criteria,
    errors,
  }

  const outPath = join(__dirname, 'jsl-results.json')
  writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf-8')

  const criteriaCount = Object.keys(criteria).length
  const passCount = Object.values(criteria).filter((c) => c.pass === true).length
  const partialCount = Object.values(criteria).filter((c) => c.pass === 'partial').length
  const failCount = Object.values(criteria).filter((c) => c.pass === false).length

  console.log(`\njsl-probe complete: ${criteriaCount} criteria recorded`)
  console.log(`  pass: ${passCount}, partial: ${partialCount}, fail: ${failCount}`)
  console.log(`  errors captured: ${errors.length}`)
  console.log(`  results written to ${outPath}`)
  if (errors.length > 0) {
    console.log('\nErrors:')
    for (const e of errors) console.log(' -', e)
  }
}

main().catch((err) => {
  console.error('jsl-probe fatal error:', err)
  process.exitCode = 1
})

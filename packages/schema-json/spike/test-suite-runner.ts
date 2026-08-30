// JSON Schema Test Suite runner (subtask 1d, task-1-brief.md step 6).
//
// Runs both candidate libraries' validate() against the official mandatory
// test suites for draft-07 and draft2020-12, so their pass rates are directly
// comparable. Remote-$ref cases are filtered identically for both libraries
// before either one sees them (out of Phase 1 scope; SchemaEvaluationPort
// only needs local $ref resolution).
//
// Run with: npx tsx spike/test-suite-runner.ts   (from packages/schema-json/)

import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

import { registerSchema as registerSchema2020, FLAG } from '@hyperjump/json-schema/draft-2020-12'
import { registerSchema as registerSchema07 } from '@hyperjump/json-schema/draft-07'
import { compile, interpret, getSchema } from '@hyperjump/json-schema/experimental'
import * as Instance from '@hyperjump/json-schema/instance/experimental'

import { compileSchema } from 'json-schema-library'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEST_SUITE_DIR = join(__dirname, 'test-suite', 'tests')

type Draft = 'draft7' | 'draft2020-12'

interface TestCase {
  description: string
  data: unknown
  valid: boolean
}

interface TestGroup {
  description: string
  schema: unknown
  tests: TestCase[]
}

interface DraftTotals {
  totalCases: number
  skippedRemoteRef: number
  hyperjump: { pass: number; fail: number; errors: number }
  jsl: { pass: number; fail: number; errors: number }
}

interface RunnerResults {
  generatedAt: string
  drafts: Record<Draft, DraftTotals>
  skippedGroups: { draft: Draft; file: string; description: string; refs: string[] }[]
  sampleFailures: {
    draft: Draft
    library: 'hyperjump' | 'jsl'
    file: string
    group: string
    test: string
    expected: boolean
    actualOrError: string
  }[]
}

// ---------------------------------------------------------------------------
// Remote-$ref detection: walk the whole schema document (all applicators --
// properties, items, allOf/anyOf/oneOf, $defs/definitions, dependencies,
// patternProperties, etc.) looking for any $ref/$dynamicRef/$recursiveRef
// whose target does not start with "#". Those require fetching a document
// outside the schema itself (either a real network/file fetch, or -- for the
// $id-based base-URI-change and bare $dynamicRef-anchor cases -- resolution
// machinery equivalent to it) which is out of scope for Phase 1. A schema
// that declares a custom $schema hosted on the suite's local test server
// (http://localhost:1234/...) needs the same kind of remote metaschema fetch
// and is filtered on the same basis.
// ---------------------------------------------------------------------------
const REF_KEYS = ['$ref', '$dynamicRef', '$recursiveRef']

function findRemoteRefs(node: unknown, found: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) findRemoteRefs(item, found)
    return
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (REF_KEYS.includes(key) && typeof value === 'string' && !value.startsWith('#')) {
        found.add(value)
      }
      findRemoteRefs(value, found)
    }
  }
}

function requiresRemoteRef(schema: unknown): string[] {
  const found = new Set<string>()
  findRemoteRefs(schema, found)
  if (
    schema &&
    typeof schema === 'object' &&
    !Array.isArray(schema) &&
    typeof (schema as Record<string, unknown>).$schema === 'string' &&
    ((schema as Record<string, unknown>).$schema as string).includes('localhost:1234')
  ) {
    found.add((schema as Record<string, unknown>).$schema as string)
  }
  return [...found]
}

// ---------------------------------------------------------------------------
// Loading mandatory test files: every *.json directly under tests/<draft>/,
// excluding the optional/ subdirectory (task instruction: "mandatory test
// files").
// ---------------------------------------------------------------------------
function loadMandatoryFiles(draft: Draft): { file: string; groups: TestGroup[] }[] {
  const dir = join(TEST_SUITE_DIR, draft)
  const entries = readdirSync(dir).filter((name) => {
    const full = join(dir, name)
    return statSync(full).isFile() && name.endsWith('.json')
  })
  return entries.map((file) => ({
    file,
    groups: JSON.parse(readFileSync(join(dir, file), 'utf-8')) as TestGroup[],
  }))
}

// The test suite relies on directory placement (tests/draft7/,
// tests/draft2020-12/) to convey dialect rather than an explicit $schema
// keyword on every fixture (confirmed: no draft7 fixture declares $schema at
// all). Both libraries accept a fallback dialect hint that only applies when
// the schema itself doesn't declare one, so it is passed unconditionally
// rather than mutating the schema document.
const DIALECT_URI: Record<Draft, string> = {
  draft7: 'http://json-schema.org/draft-07/schema#',
  'draft2020-12': 'https://json-schema.org/draft/2020-12/schema',
}

// ---------------------------------------------------------------------------
// hyperjump: register + compile once per group, then interpret per test case.
// ---------------------------------------------------------------------------
let hyperjumpUriCounter = 0

async function runHyperjump(
  draft: Draft,
  file: string,
  group: TestGroup,
): Promise<{ valid: boolean; threw: boolean }[]> {
  const uri = `https://texaryn.dev/spike/test-suite/${draft}/${file}/${hyperjumpUriCounter++}`

  if (draft === 'draft7') {
    registerSchema07(group.schema as never, uri, DIALECT_URI[draft])
  } else {
    registerSchema2020(group.schema as never, uri, DIALECT_URI[draft])
  }

  const compiled = await compile(await getSchema(uri))

  return group.tests.map((test) => {
    try {
      const output = interpret(compiled, Instance.fromJs(test.data), FLAG) as { valid: boolean }
      return { valid: output.valid, threw: false }
    } catch {
      return { valid: false, threw: true }
    }
  })
}

// ---------------------------------------------------------------------------
// json-schema-library: compileSchema() once per group, then .validate() per
// test case.
// ---------------------------------------------------------------------------
function runJsl(draft: Draft, group: TestGroup): { valid: boolean; threw: boolean }[] {
  let root: ReturnType<typeof compileSchema>
  try {
    root = compileSchema(group.schema as never, { draft: draft === 'draft7' ? 'draft-07' : 'draft-2020-12' })
  } catch {
    return group.tests.map(() => ({ valid: false, threw: true }))
  }

  return group.tests.map((test) => {
    try {
      const result = root.validate(test.data)
      return { valid: result.valid, threw: false }
    } catch {
      return { valid: false, threw: true }
    }
  })
}

async function main() {
  const drafts: Draft[] = ['draft7', 'draft2020-12']
  const results: RunnerResults = {
    generatedAt: new Date().toISOString(),
    drafts: {} as Record<Draft, DraftTotals>,
    skippedGroups: [],
    sampleFailures: [],
  }

  for (const draft of drafts) {
    const totals: DraftTotals = {
      totalCases: 0,
      skippedRemoteRef: 0,
      hyperjump: { pass: 0, fail: 0, errors: 0 },
      jsl: { pass: 0, fail: 0, errors: 0 },
    }

    const files = loadMandatoryFiles(draft)

    for (const { file, groups } of files) {
      for (const group of groups) {
        const remoteRefs = requiresRemoteRef(group.schema)
        if (remoteRefs.length > 0) {
          totals.skippedRemoteRef += group.tests.length
          results.skippedGroups.push({ draft, file, description: group.description, refs: remoteRefs })
          continue
        }

        totals.totalCases += group.tests.length

        let hyperjumpOutcomes: { valid: boolean; threw: boolean }[]
        try {
          hyperjumpOutcomes = await runHyperjump(draft, file, group)
        } catch {
          hyperjumpOutcomes = group.tests.map(() => ({ valid: false, threw: true }))
        }

        const jslOutcomes = runJsl(draft, group)

        group.tests.forEach((test, i) => {
          const hj = hyperjumpOutcomes[i]
          const jsl = jslOutcomes[i]

          if (hj.threw) {
            totals.hyperjump.errors++
          } else if (hj.valid === test.valid) {
            totals.hyperjump.pass++
          } else {
            totals.hyperjump.fail++
            if (results.sampleFailures.filter((f) => f.library === 'hyperjump').length < 15) {
              results.sampleFailures.push({
                draft,
                library: 'hyperjump',
                file,
                group: group.description,
                test: test.description,
                expected: test.valid,
                actualOrError: String(hj.valid),
              })
            }
          }

          if (jsl.threw) {
            totals.jsl.errors++
          } else if (jsl.valid === test.valid) {
            totals.jsl.pass++
          } else {
            totals.jsl.fail++
            if (results.sampleFailures.filter((f) => f.library === 'jsl').length < 15) {
              results.sampleFailures.push({
                draft,
                library: 'jsl',
                file,
                group: group.description,
                test: test.description,
                expected: test.valid,
                actualOrError: String(jsl.valid),
              })
            }
          }
        })
      }
    }

    results.drafts[draft] = totals

    console.log(`\n=== ${draft} ===`)
    console.log(`total cases run: ${totals.totalCases}`)
    console.log(`skipped (remote $ref): ${totals.skippedRemoteRef}`)
    console.log(
      `hyperjump: ${totals.hyperjump.pass} pass / ${totals.hyperjump.fail} fail / ${totals.hyperjump.errors} thrown`,
    )
    console.log(`jsl:       ${totals.jsl.pass} pass / ${totals.jsl.fail} fail / ${totals.jsl.errors} thrown`)
  }

  const outPath = join(__dirname, 'test-suite-results.json')
  writeFileSync(outPath, JSON.stringify(results, null, 2))
  console.log(`\nWrote ${outPath}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

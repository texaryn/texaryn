// Texaryn's adapters against the official JSON Schema Test Suite, pinned to
// one upstream commit.
//
// The absolute pass rate is not the gate. What is gated is drift: a mandatory
// test that regresses fails, a declared deviation that starts passing fails so
// the declaration has to go, and a failure nobody has classified fails from
// the first run. Passing is the default, so the committed baseline records
// totals and deviations rather than thousands of successes.
//
// Everything runs through the public adapter surface. Configuring the
// underlying validator directly would report a capability a Texaryn consumer
// cannot invoke.
import { describe, it, expect } from 'vitest'
import { writeFileSync } from 'node:fs'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createHyperjumpAdapter } from '@texaryn/schema-json-hyperjump'
import type { SchemaEvaluationPort } from '@texaryn/core'
import { loadSuite, suiteDialects, suiteRevision, testId } from './runner.js'
import type { SuiteDialect } from './runner.js'
import { baselinePath, readBaseline } from './baseline.js'
import type { Baseline, DialectBaseline } from './baseline.js'

const UPDATE = process.env.UPDATE_JSON_SCHEMA_BASELINE === '1'

type AdapterFactory = (schema: unknown, dialect: SuiteDialect) => Promise<SchemaEvaluationPort>

// Reported per adapter and never aggregated. A combined "Texaryn compliance"
// figure would describe no package a consumer can install: schema-json is the
// default, and schema-json-hyperjump is a private reference implementation kept
// to check the port contract is not shaped around one validator.
const adapters: Record<string, AdapterFactory> = {
  'schema-json': (schema, dialect) => createJsonSchemaAdapter(schema, { defaultDialect: dialect }),
  'schema-json-hyperjump': (schema, dialect) =>
    createHyperjumpAdapter(schema, { defaultDialect: dialect }),
}

interface Observed {
  mandatory: { total: number; passed: number }
  optional: { total: number; passed: number }
  /** Mandatory tests that did not match the suite's expectation. */
  failures: Map<string, string>
}

async function observe(createAdapter: AdapterFactory, dialect: SuiteDialect): Promise<Observed> {
  const observed: Observed = {
    mandatory: { total: 0, passed: 0 },
    optional: { total: 0, passed: 0 },
    failures: new Map(),
  }

  for (const suiteCase of loadSuite(dialect)) {
    const bucket = suiteCase.optional ? observed.optional : observed.mandatory
    let port: SchemaEvaluationPort | null = null
    let compileError: string | null = null
    try {
      port = await createAdapter(suiteCase.schema, dialect)
    } catch (error) {
      compileError = `compile: ${(error as Error).message}`
    }

    for (const test of suiteCase.tests) {
      bucket.total += 1
      let detail = compileError
      if (port) {
        try {
          const result = await port.validate(test.data)
          detail = result.valid === test.expected ? null : `expected valid=${test.expected}`
        } catch (error) {
          detail = `validate: ${(error as Error).message}`
        }
      }
      if (detail === null) {
        bucket.passed += 1
      } else if (!suiteCase.optional) {
        observed.failures.set(testId(suiteCase.file, suiteCase.description, test.description), detail)
      }
    }
  }
  return observed
}

const dialectNames = Object.keys(suiteDialects) as SuiteDialect[]

const results = new Map<string, Map<SuiteDialect, Observed>>()
for (const [name, createAdapter] of Object.entries(adapters)) {
  const perDialect = new Map<SuiteDialect, Observed>()
  for (const dialect of dialectNames) {
    perDialect.set(dialect, await observe(createAdapter, dialect))
  }
  results.set(name, perDialect)
}

if (UPDATE) {
  const previous = (() => {
    try {
      return readBaseline()
    } catch {
      return null
    }
  })()
  const next: Baseline = { suiteRevision, adapters: {} }
  for (const [name, perDialect] of results) {
    next.adapters[name] = {} as Record<SuiteDialect, DialectBaseline>
    for (const dialect of dialectNames) {
      const observed = perDialect.get(dialect)!
      const deviations: DialectBaseline['deviations'] = {}
      for (const [id, detail] of [...observed.failures].sort(([a], [b]) => (a < b ? -1 : 1))) {
        // A new failure arrives unclassified on purpose, so the assertions
        // below fail until a human states why it is expected.
        deviations[id] = previous?.adapters?.[name]?.[dialect]?.deviations?.[id] ?? {
          reason: 'texaryn-adapter-deviation',
          note: `UNCLASSIFIED: ${detail}`,
        }
      }
      next.adapters[name][dialect] = {
        mandatory: observed.mandatory,
        optional: observed.optional,
        deviations,
      }
    }
  }
  writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`)
}

const baseline = readBaseline()

describe('official JSON Schema Test Suite', () => {
  it('runs the revision the baseline was recorded against', () => {
    expect(
      suiteRevision,
      'the vendored suite moved without the baseline being regenerated',
    ).toBe(baseline.suiteRevision)
  })

  for (const [name, perDialect] of results) {
    describe(name, () => {
      for (const dialect of dialectNames) {
        const observed = perDialect.get(dialect)!
        const recorded = baseline.adapters[name]?.[dialect]

        describe(dialect, () => {
          it('has a baseline', () => {
            expect(recorded, `no baseline for ${name} ${dialect}`).toBeDefined()
          })

          it('regresses no mandatory test', () => {
            const unexpected = [...observed.failures.keys()].filter(
              (id) => !(id in (recorded?.deviations ?? {})),
            )
            expect(
              unexpected,
              `mandatory tests failing without a recorded deviation:\n${unexpected
                .map((id) => `  ${id}: ${observed.failures.get(id)}`)
                .join('\n')}`,
            ).toEqual([])
          })

          it('declares no deviation that now passes', () => {
            const stale = Object.keys(recorded?.deviations ?? {}).filter(
              (id) => !observed.failures.has(id),
            )
            expect(
              stale,
              `these now pass; remove them from the baseline:\n${stale.map((id) => `  ${id}`).join('\n')}`,
            ).toEqual([])
          })

          it('classifies every deviation', () => {
            const unclassified = Object.entries(recorded?.deviations ?? {})
              .filter(([, d]) => d.note.startsWith('UNCLASSIFIED'))
              .map(([id]) => id)
            expect(
              unclassified,
              `give each of these a reason and a note:\n${unclassified.map((id) => `  ${id}`).join('\n')}`,
            ).toEqual([])
          })

          it('backs a generic deviation reason with evidence', () => {
            const generic = Object.entries(recorded?.deviations ?? {}).filter(
              ([, d]) =>
                (d.reason === 'upstream-validator-deviation' || d.reason === 'suite-known-issue') &&
                !d.issue,
            )
            expect(
              generic.map(([id]) => id),
              'these reasons require an issue link',
            ).toEqual([])
          })

          it('counts the same number of tests the baseline recorded', () => {
            expect(observed.mandatory.total).toBe(recorded?.mandatory.total)
            expect(observed.optional.total).toBe(recorded?.optional.total)
          })

          // The optional bucket is a count rather than named entries, because
          // naming several hundred per dialect would cost a large diff for no
          // decision. Pinning the count is still what makes an optional-only
          // behaviour change visible: without it, turning format assertion on
          // or off moves nothing a test can see, and the published figure
          // silently stops describing the adapter.
          it('holds the optional pass count the baseline recorded', () => {
            expect(
              observed.optional.passed,
              `optional passes moved from ${recorded?.optional.passed} to ${observed.optional.passed}; regenerate the baseline if that was intended`,
            ).toBe(recorded?.optional.passed)
          })
        })
      }
    })
  }
})

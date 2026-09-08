// Texaryn's adapters against the official JSON Schema Test Suite, pinned to
// one upstream commit.
//
// The absolute pass rate is not the gate. What is gated is drift: a mandatory
// test that regresses fails, a mandatory test that starts failing a different
// way fails, a declared deviation that starts passing fails so the declaration
// has to go, a failure nobody has classified fails from the first run, and a
// moved pass count or optional failure set fails. Passing is the default, so
// the committed baseline records totals, the optional failure ids and the
// mandatory deviations rather than thousands of successes.
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
import { baselinePath, baselineProblems, readBaseline } from './baseline.js'
import type { Baseline, DialectBaseline, FailureOutcome } from './baseline.js'

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
  optional: { total: number; passed: number; failures: string[] }
  /** Mandatory tests that did not match the suite's expectation. */
  failures: Map<string, FailureOutcome>
}

function describeOutcome(outcome: FailureOutcome): string {
  return outcome.kind === 'wrong-validity'
    ? `returned valid=${outcome.actual}`
    : `${outcome.kind} ${outcome.errorName}`
}

function sameOutcome(a: FailureOutcome, b: FailureOutcome): boolean {
  if (a.kind !== b.kind) return false
  return a.kind === 'wrong-validity'
    ? a.actual === (b as { actual: boolean }).actual
    : a.errorName === (b as { errorName: string }).errorName
}

async function observe(createAdapter: AdapterFactory, dialect: SuiteDialect): Promise<Observed> {
  const observed: Observed = {
    mandatory: { total: 0, passed: 0 },
    optional: { total: 0, passed: 0, failures: [] },
    failures: new Map(),
  }

  for (const suiteCase of loadSuite(dialect)) {
    const bucket = suiteCase.optional ? observed.optional : observed.mandatory
    let port: SchemaEvaluationPort | null = null
    let compileFailure: FailureOutcome | null = null
    try {
      port = await createAdapter(suiteCase.schema, dialect)
    } catch (error) {
      compileFailure = { kind: 'compile-error', errorName: (error as Error).name }
    }

    for (const test of suiteCase.tests) {
      bucket.total += 1
      let failure: FailureOutcome | null = compileFailure
      if (port) {
        try {
          const result = await port.validate(test.data)
          failure =
            result.valid === test.expected
              ? null
              : { kind: 'wrong-validity', actual: result.valid }
        } catch (error) {
          failure = { kind: 'validate-error', errorName: (error as Error).name }
        }
      }
      const id = testId(suiteCase.file, suiteCase.description, test.description)
      if (failure === null) {
        bucket.passed += 1
      } else if (suiteCase.optional) {
        observed.optional.failures.push(id)
      } else {
        observed.failures.set(id, failure)
      }
    }
  }
  observed.optional.failures.sort()
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
      for (const [id, outcome] of [...observed.failures].sort(([a], [b]) => (a < b ? -1 : 1))) {
        // A new failure keeps a reason no reader accepts, so the assertions
        // below fail until a human states why it is expected. Seeding a real
        // reason instead would let an unreviewed failure be laundered into the
        // baseline by editing one word of the note.
        const carried = previous?.adapters?.[name]?.[dialect]?.deviations?.[id]
        deviations[id] = carried
          ? { ...carried, outcome }
          : {
              reason: 'UNCLASSIFIED' as DialectBaseline['deviations'][string]['reason'],
              outcome,
              note: `UNCLASSIFIED: ${describeOutcome(outcome)}`,
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

  // The baseline arrives through JSON.parse, where the reason union proves
  // nothing, so the closed set and the evidence rule are enforced here.
  it('is a structurally valid baseline', () => {
    const problems = baselineProblems(baseline)
    expect(problems, `baseline.json is not valid:\n${problems.map((p) => `  ${p}`).join('\n')}`).toEqual(
      [],
    )
  })

  // Deviations are keyed by description, which survives upstream reordering
  // but is not promised to be unique. A collision would silently collapse two
  // failures into one entry, so it fails here rather than skewing a count.
  describe('test ids', () => {
    for (const dialect of dialectNames) {
      it(`are unique across ${dialect}`, () => {
        const seen = new Set<string>()
        const duplicates: string[] = []
        for (const suiteCase of loadSuite(dialect)) {
          for (const test of suiteCase.tests) {
            const id = testId(suiteCase.file, suiteCase.description, test.description)
            if (seen.has(id)) duplicates.push(id)
            seen.add(id)
          }
        }
        expect(
          duplicates,
          `upstream now has colliding descriptions; the baseline key is no longer an identity:\n${duplicates
            .map((id) => `  ${id}`)
            .join('\n')}`,
        ).toEqual([])
      })
    }
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
                .map((id) => `  ${id}: ${describeOutcome(observed.failures.get(id)!)}`)
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

          // A deviation that stays red for a new reason is a new fact, and
          // without this the recorded classification would quietly describe
          // something that is no longer happening.
          it('fails each declared deviation the way the baseline recorded', () => {
            const changed: string[] = []
            for (const [id, deviation] of Object.entries(recorded?.deviations ?? {})) {
              const now = observed.failures.get(id)
              if (now && deviation.outcome && !sameOutcome(deviation.outcome, now)) {
                changed.push(
                  `  ${id}: recorded ${describeOutcome(deviation.outcome)}, now ${describeOutcome(now)}`,
                )
              }
            }
            expect(
              changed,
              `these still fail, but differently, so the recorded reason may no longer apply:\n${changed.join('\n')}`,
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

          it('counts the same number of tests the baseline recorded', () => {
            expect(observed.mandatory.total).toBe(recorded?.mandatory.total)
            expect(observed.optional.total).toBe(recorded?.optional.total)
          })

          // Both counts are published, so both are asserted rather than left
          // to be implied by the deviation set.
          it('holds the pass counts the baseline recorded', () => {
            expect(
              observed.mandatory.passed,
              `mandatory passes moved from ${recorded?.mandatory.passed} to ${observed.mandatory.passed}; regenerate the baseline if that was intended`,
            ).toBe(recorded?.mandatory.passed)
            expect(
              observed.optional.passed,
              `optional passes moved from ${recorded?.optional.passed} to ${observed.optional.passed}; regenerate the baseline if that was intended`,
            ).toBe(recorded?.optional.passed)
          })

          // The count alone would miss one optional test regressing while
          // another starts passing, which is the shape an adapter change most
          // often takes.
          it('fails the same optional tests the baseline recorded', () => {
            const before = new Set(recorded?.optional.failures ?? [])
            const after = new Set(observed.optional.failures)
            const started = [...after].filter((id) => !before.has(id))
            const stopped = [...before].filter((id) => !after.has(id))
            expect(
              { started, stopped },
              `the optional failure set moved:\n${[
                ...started.map((id) => `  now failing: ${id}`),
                ...stopped.map((id) => `  now passing: ${id}`),
              ].join('\n')}`,
            ).toEqual({ started: [], stopped: [] })
          })
        })
      }
    })
  }
})

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { suiteDialects, type SuiteDialect } from './runner.js'

/**
 * Why a mandatory test is expected to fail. A closed set on purpose: an open
 * string field would let a real regression be relabelled into silence.
 *
 * Every entry names one exact upstream test. Wildcards over a keyword or a
 * file are deliberately impossible, because "skip all unevaluatedProperties
 * tests" is how a suite stops meaning anything.
 */
export const deviationReasons = [
  // A document the suite expects to be retrieved from http://localhost:1234.
  'external-schema-resolution-not-exposed',
  // A $ref or $schema naming the dialect's own metaschema. Kept apart from
  // the above because a validator can reasonably be expected to know the
  // metaschema of a dialect it claims, without any user-supplied resolver:
  // schema-json-hyperjump passes these and schema-json does not, so folding
  // them together would hide a real difference in what the two support.
  'standard-metaschema-resolution-missing',
  'texaryn-adapter-deviation',
  'upstream-validator-deviation',
  'suite-known-issue',
] as const

export type DeviationReason = (typeof deviationReasons)[number]

/**
 * Reasons a reader can confirm from the failing test alone, because the test
 * asks for something no adapter exposes. Every other reason asserts something
 * about code (ours or someone else's) that could be fixed instead, so it has
 * to cite the record of that decision rather than a sentence someone typed.
 */
export const issueExemptReasons: readonly DeviationReason[] = [
  'external-schema-resolution-not-exposed',
  'standard-metaschema-resolution-missing',
]

/**
 * How the test failed, not merely that it did. Without this a deviation stays
 * satisfied when the same test starts failing for an unrelated new reason: a
 * remote reference that used to return the wrong answer and now throws is a
 * different fact about the adapter. The error class rather than the message,
 * because messages are not a contract.
 */
export type FailureOutcome =
  | { kind: 'wrong-validity'; actual: boolean }
  | { kind: 'compile-error'; errorName: string }
  | { kind: 'validate-error'; errorName: string }

export interface Deviation {
  reason: DeviationReason
  outcome: FailureOutcome
  /** Required for every reason outside `issueExemptReasons`. */
  issue?: string
  note: string
}

export interface DialectBaseline {
  mandatory: { total: number; passed: number }
  /**
   * `failures` lists the ids, not just the count, because two optional tests
   * swapping states leaves the count identical. Reasons are deliberately not
   * recorded here: the specification leaves this behaviour open, so an entry
   * is an observation rather than a claim.
   */
  optional: { total: number; passed: number; failures: string[] }
  /** Keyed by `testId`, and expected to fail for the stated reason. */
  deviations: Record<string, Deviation>
}

export interface Baseline {
  suiteRevision: string
  adapters: Record<string, Record<SuiteDialect, DialectBaseline>>
}

const baselinePath = fileURLToPath(new URL('./baseline.json', import.meta.url))

export function readBaseline(): Baseline {
  return JSON.parse(readFileSync(baselinePath, 'utf8')) as Baseline
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function outcomeProblem(where: string, outcome: unknown): string | null {
  if (!isRecord(outcome)) return `${where}: outcome is missing`
  if (outcome.kind === 'wrong-validity') {
    return typeof outcome.actual === 'boolean'
      ? null
      : `${where}: wrong-validity needs a boolean actual`
  }
  if (outcome.kind === 'compile-error' || outcome.kind === 'validate-error') {
    return typeof outcome.errorName === 'string' && outcome.errorName.length > 0
      ? null
      : `${where}: ${outcome.kind} needs an errorName`
  }
  return `${where}: unknown outcome kind ${JSON.stringify(outcome.kind)}`
}

/**
 * The reason enum is a TypeScript union, and the baseline arrives through
 * JSON.parse, where a union proves nothing. Without this check a hand-edited
 * file could carry any string as a reason, or drop the evidence an issue-bound
 * reason owes, and the compiler would never see it.
 */
export function baselineProblems(value: unknown, ranAdapters: readonly string[]): string[] {
  const problems: string[] = []
  if (!isRecord(value)) return ['baseline is not an object']
  if (typeof value.suiteRevision !== 'string' || !/^[0-9a-f]{40}$/.test(value.suiteRevision)) {
    problems.push('suiteRevision is not a full 40-character commit sha')
  }
  if (!isRecord(value.adapters)) return [...problems, 'adapters is not an object']

  // The published table renders whatever adapters the file holds. Without this
  // an entry could exist only in the baseline, satisfy every other rule, and
  // be published as a measurement no runner ever took.
  const recordedNames = Object.keys(value.adapters).sort()
  const expected = [...ranAdapters].sort()
  for (const name of recordedNames.filter((n) => !expected.includes(n))) {
    problems.push(`${name}: recorded in the baseline but no runner executed it`)
  }
  for (const name of expected.filter((n) => !recordedNames.includes(n))) {
    problems.push(`${name}: executed but missing from the baseline`)
  }

  for (const [adapter, perDialect] of Object.entries(value.adapters)) {
    if (!isRecord(perDialect)) {
      problems.push(`${adapter}: not an object`)
      continue
    }
    const missing = Object.keys(suiteDialects).filter((d) => !(d in perDialect))
    if (missing.length > 0) problems.push(`${adapter}: missing dialects ${missing.join(', ')}`)

    for (const [dialect, recorded] of Object.entries(perDialect)) {
      const at = `${adapter} ${dialect}`
      if (!(dialect in suiteDialects)) problems.push(`${at}: unknown dialect`)
      if (!isRecord(recorded)) {
        problems.push(`${at}: not an object`)
        continue
      }
      for (const bucket of ['mandatory', 'optional'] as const) {
        const counts = recorded[bucket]
        if (
          !isRecord(counts) ||
          typeof counts.total !== 'number' ||
          typeof counts.passed !== 'number' ||
          counts.passed > counts.total
        ) {
          problems.push(`${at}: ${bucket} counts are missing or impossible`)
        }
      }
      const optional = recorded.optional
      if (isRecord(optional)) {
        if (!Array.isArray(optional.failures)) {
          problems.push(`${at}: optional.failures is not an array`)
        } else if (
          typeof optional.total === 'number' &&
          typeof optional.passed === 'number' &&
          optional.failures.length !== optional.total - optional.passed
        ) {
          problems.push(
            `${at}: optional.failures lists ${optional.failures.length} ids but the counts imply ${
              optional.total - optional.passed
            }`,
          )
        }
      }

      const deviations = recorded.deviations
      if (!isRecord(deviations)) {
        problems.push(`${at}: deviations is not an object`)
        continue
      }
      const mandatory = recorded.mandatory
      if (
        isRecord(mandatory) &&
        typeof mandatory.total === 'number' &&
        typeof mandatory.passed === 'number' &&
        Object.keys(deviations).length !== mandatory.total - mandatory.passed
      ) {
        problems.push(
          `${at}: ${Object.keys(deviations).length} deviations but the counts imply ${
            mandatory.total - mandatory.passed
          }`,
        )
      }
      for (const [testId, deviation] of Object.entries(deviations)) {
        const where = `${at} ${testId}`
        if (!isRecord(deviation)) {
          problems.push(`${where}: not an object`)
          continue
        }
        const reason = deviation.reason
        if (typeof reason !== 'string' || !deviationReasons.includes(reason as DeviationReason)) {
          problems.push(`${where}: reason ${JSON.stringify(reason)} is not one of the declared set`)
        } else if (!issueExemptReasons.includes(reason as DeviationReason)) {
          if (typeof deviation.issue !== 'string' || !deviation.issue.startsWith('https://')) {
            problems.push(`${where}: reason ${reason} requires an issue url`)
          }
        }
        if (typeof deviation.note !== 'string' || deviation.note.trim().length === 0) {
          problems.push(`${where}: note is empty`)
        }
        const bad = outcomeProblem(where, deviation.outcome)
        if (bad) problems.push(bad)
      }
    }
  }
  return problems
}

export { baselinePath }

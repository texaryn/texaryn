import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { SuiteDialect } from './runner.js'

/**
 * Why a mandatory test is expected to fail. A closed set on purpose: an open
 * string field would let a real regression be relabelled into silence.
 *
 * Every entry names one exact upstream test. Wildcards over a keyword or a
 * file are deliberately impossible, because "skip all unevaluatedProperties
 * tests" is how a suite stops meaning anything.
 */
export type DeviationReason =
  | 'remote-schema-resolution-not-exposed'
  | 'texaryn-adapter-deviation'
  | 'upstream-validator-deviation'
  | 'suite-known-issue'

export interface Deviation {
  reason: DeviationReason
  /** Required for the two generic reasons, so a claim carries evidence. */
  issue?: string
  note: string
}

export interface DialectBaseline {
  mandatory: { total: number; passed: number }
  optional: { total: number; passed: number }
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

export { baselinePath }

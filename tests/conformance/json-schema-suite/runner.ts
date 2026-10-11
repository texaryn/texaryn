import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const suiteRoot = fileURLToPath(new URL('../json-schema-test-suite/', import.meta.url))

export const suiteRevision = readFileSync(join(suiteRoot, 'UPSTREAM_REVISION'), 'utf8').trim()

/** The dialects Texaryn claims, mapped to the suite's directory names. */
export const suiteDialects = {
  'draft-04': 'draft4',
  'draft-07': 'draft7',
  '2019-09': 'draft2019-09',
  '2020-12': 'draft2020-12',
} as const

export type SuiteDialect = keyof typeof suiteDialects

function jsonFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...jsonFiles(full))
    else if (entry.name.endsWith('.json')) out.push(full)
  }
  return out
}

/** Every vendored JSON file, as paths relative to the suite root. */
export function suiteFiles(): string[] {
  return [...jsonFiles(join(suiteRoot, 'tests')), ...jsonFiles(join(suiteRoot, 'remotes'))]
    .map((path) => relative(suiteRoot, path).split('\\').join('/'))
    .sort()
}

/** Resolves the suite's localhost fixtures from disk without network access. */
export function loadSuiteResource(uri: string): unknown | undefined {
  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch {
    return undefined
  }
  if (
    parsed.href !== uri ||
    parsed.protocol !== 'http:' ||
    parsed.hostname !== 'localhost' ||
    parsed.port !== '1234' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    return undefined
  }
  let pathname: string
  try {
    pathname = decodeURIComponent(parsed.pathname).replace(/^\/+/, '')
  } catch {
    return undefined
  }
  const remotePath = join(suiteRoot, 'remotes', pathname)
  if (remotePath.startsWith(`${join(suiteRoot, 'remotes')}/`) && existsSync(remotePath)) {
    return JSON.parse(readFileSync(remotePath, 'utf8')) as unknown
  }
  if (pathname === 'integer.json') return { type: 'integer' }
  return undefined
}

/** One suite case: a schema plus the assertions made against it. */
export interface SuiteCase {
  file: string
  description: string
  schema: unknown
  optional: boolean
  tests: ReadonlyArray<{ description: string; data: unknown; expected: boolean }>
}

/**
 * Cases rather than a flat list of tests, because the schema is compiled once
 * per case. Compiling per assertion would multiply the work by roughly five
 * for no extra coverage.
 */
export function loadSuite(dialect: SuiteDialect): SuiteCase[] {
  const dir = join(suiteRoot, 'tests', suiteDialects[dialect])
  const cases: SuiteCase[] = []
  for (const path of jsonFiles(dir)) {
    const file = relative(dir, path).split('\\').join('/')
    const groups = JSON.parse(readFileSync(path, 'utf8')) as Array<{
      description: string
      schema: unknown
      tests: Array<{ description: string; data: unknown; valid: boolean }>
    }>
    for (const group of groups) {
      cases.push({
        file,
        description: group.description,
        schema: group.schema,
        optional: file.startsWith('optional/'),
        tests: group.tests.map((t) => ({
          description: t.description,
          data: t.data,
          expected: t.valid,
        })),
      })
    }
  }
  return cases
}

/** The address used in the baseline, stable across suite reorderings. */
export function testId(file: string, caseDescription: string, testDescription: string): string {
  return `${file} :: ${caseDescription} :: ${testDescription}`
}

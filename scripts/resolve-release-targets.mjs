import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { publishedPackages } from './packages.mjs'

const repository = 'https://github.com/texaryn/texaryn'
const workflowPath = '.github/workflows/ci-release.yml'
const sourceUri = 'git+https://github.com/texaryn/texaryn@refs/heads/main'
const provenancePredicate = 'https://slsa.dev/provenance/v1'
const packageDirectories = new Map(publishedPackages.map(({ name, dir }) => [name, dir]))

export function parsePackageInputs(...rawInputs) {
  const packages = new Map()

  for (const raw of rawInputs) {
    if (typeof raw !== 'string' || raw.trim() === '') continue
    let entries
    try {
      entries = JSON.parse(raw)
    } catch {
      continue
    }
    if (!Array.isArray(entries)) continue

    for (const entry of entries) {
      if (
        entry === null ||
        typeof entry !== 'object' ||
        typeof entry.name !== 'string' ||
        !packageDirectories.has(entry.name) ||
        typeof entry.version !== 'string' ||
        !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(entry.version)
      ) {
        continue
      }
      packages.set(`${entry.name}@${entry.version}`, { name: entry.name, version: entry.version })
    }
  }

  return [...packages.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`))
}

export function sourceCommitFromVerifiedEntry(entry) {
  const { name, version } = entry ?? {}
  if (typeof name !== 'string' || typeof version !== 'string') {
    throw new TypeError('Verified npm entry is missing its package name or version')
  }

  const expectedSubject = `pkg:npm/${name.replace(/^@/, '%40')}@${version}`
  const bundle = entry.attestationBundles?.find(
    ({ predicateType }) => predicateType === provenancePredicate,
  )
  const payload = bundle?.bundle?.dsseEnvelope?.payload
  if (typeof payload !== 'string') {
    throw new Error(`Verified npm entry has no SLSA provenance for ${name}@${version}`)
  }

  let statement
  try {
    statement = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
  } catch {
    throw new Error(`Verified npm entry has invalid provenance for ${name}@${version}`)
  }

  if (!statement.subject?.some(({ name: subject }) => subject === expectedSubject)) {
    throw new TypeError(`Provenance subject does not match ${name}@${version}`)
  }

  const predicate = statement.predicate
  const build = predicate?.buildDefinition
  const workflow = build?.externalParameters?.workflow
  if (
    statement.predicateType !== provenancePredicate ||
    workflow?.repository !== repository ||
    workflow?.ref !== 'refs/heads/main' ||
    workflow?.path !== workflowPath ||
    predicate?.buildDefinition?.internalParameters?.github?.event_name !== 'push' ||
    predicate?.runDetails?.metadata?.invocationId === undefined
  ) {
    throw new Error(`Provenance does not identify the Texaryn main release workflow for ${name}@${version}`)
  }

  const sources = (build.resolvedDependencies ?? []).filter(
    ({ uri, digest }) => uri === sourceUri && typeof digest?.gitCommit === 'string',
  )
  if (sources.length !== 1 || !/^[0-9a-f]{40}$/.test(sources[0].digest.gitCommit)) {
    throw new Error(`Provenance has no unique source commit for ${name}@${version}`)
  }

  return sources[0].digest.gitCommit
}

export function verifySourceCommit(
  { name, version, commit },
  {
    root = process.cwd(),
    headCommit = process.env.GITHUB_SHA,
    run = execFileSync,
  } = {},
) {
  const directory = packageDirectories.get(name)
  if (!directory || !/^[0-9a-f]{40}$/.test(commit ?? '')) {
    throw new Error(`Invalid package source commit for ${name}@${version}`)
  }
  if (!/^[0-9a-f]{40}$/.test(headCommit ?? '')) {
    throw new Error('GITHUB_SHA is missing or invalid')
  }

  try {
    run('git', ['merge-base', '--is-ancestor', commit, headCommit], { cwd: root, stdio: 'ignore' })
  } catch {
    throw new Error(`Source commit ${commit} for ${name}@${version} is not an ancestor of main`)
  }

  const rawManifest = run('git', ['show', `${commit}:${directory}/package.json`], {
    cwd: root,
    encoding: 'utf8',
  })
  const manifest = JSON.parse(rawManifest)
  if (manifest.name !== name || manifest.version !== version) {
    throw new Error(`Source commit ${commit} does not contain ${name}@${version}`)
  }

  return { name, version, commit }
}

export function resolveReleaseTargets(
  packages,
  verifiedEntries,
  options,
) {
  const verifiedByVersion = new Map(
    verifiedEntries.map((entry) => [`${entry.name}@${entry.version}`, entry]),
  )

  return packages.map((pkg) => {
    const key = `${pkg.name}@${pkg.version}`
    const entry = verifiedByVersion.get(key)
    if (!entry) throw new Error(`npm did not verify a signature and provenance for ${key}`)
    const commit = sourceCommitFromVerifiedEntry(entry)
    return verifySourceCommit({ ...pkg, commit }, options)
  })
}

export function main({ env = process.env, run = execFileSync, log = console.log } = {}) {
  const existingReleases = new Set(
    (env.EXISTING_RELEASES ?? '').split(/\r?\n/).map((tag) => tag.trim()).filter(Boolean),
  )
  // First local 2FA publishes predate npm trusted publishing and have no
  // provenance. Their existing GitHub releases complete reconciliation.
  const packages = parsePackageInputs(env.PUBLISHED_PACKAGES, env.REGISTRY_PACKAGES)
    .filter(({ name, version }) => !existingReleases.has(`${name}@${version}`))
  if (packages.length === 0) {
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, 'source-commits=[]\n')
    log('No published package versions need release reconciliation')
    return []
  }

  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'texaryn-release-provenance-'))
  try {
    writeFileSync(
      join(temporaryDirectory, 'package.json'),
      JSON.stringify({
        name: 'texaryn-release-provenance-check',
        version: '1.0.0',
        private: true,
        dependencies: Object.fromEntries(packages.map(({ name, version }) => [name, version])),
      }),
    )
    run('npm', [
      'install',
      '--prefix', temporaryDirectory,
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ], { stdio: 'inherit' })
    const report = JSON.parse(run('npm', [
      'audit',
      'signatures',
      '--prefix', temporaryDirectory,
      '--json',
      '--include-attestations',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }))
    const resolved = resolveReleaseTargets(packages, report.verified ?? [])
    for (const pkg of resolved) log(`${pkg.name}@${pkg.version}: ${pkg.commit}`)
    if (env.GITHUB_OUTPUT) {
      appendFileSync(env.GITHUB_OUTPUT, `source-commits=${JSON.stringify(resolved)}\n`)
    }
    return resolved
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}

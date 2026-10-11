// Plans one GitHub release per published package. Every package versions
// independently, so there is no repository-wide version to hang a single
// `v*` release on; each release sits on the `<name>@<version>` tag for the
// verified npm package source commit.
//
// The plan combines the changesets action output with exact package versions
// confirmed by the registry. This recovers partial publishes even when their
// tags were never pushed or no longer point at the current commit.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { publishedPackages } from './packages.mjs'

export const packages = publishedPackages

const directoryByName = new Map(packages.map(({ name, dir }) => [name, dir]))

export function parsePublishedPackages(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return []
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter(
    (entry) =>
      entry !== null &&
      typeof entry === 'object' &&
      typeof entry.name === 'string' &&
      typeof entry.version === 'string',
  )
}

export function parseSourceCommits(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return []
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter(
    (entry) =>
      entry !== null &&
      typeof entry === 'object' &&
      typeof entry.name === 'string' &&
      typeof entry.version === 'string' &&
      typeof entry.commit === 'string' &&
      /^[0-9a-f]{40}$/.test(entry.commit),
  )
}

export function extractVersionSection(changelog, version) {
  const marker = `## ${version}`
  const start = changelog.indexOf(marker)
  if (start === -1) return 'No user-facing changes.'

  const contentStart = start + marker.length
  const next = changelog.indexOf('\n## ', contentStart)
  return changelog.slice(contentStart, next === -1 ? undefined : next).trim()
}

function readNotes(name, version, { root, readFile }) {
  const dir = directoryByName.get(name)
  try {
    return extractVersionSection(readFile(`${root}/${dir}/CHANGELOG.md`), version)
  } catch {
    return 'No user-facing changes.'
  }
}

export function planReleases({
  publishedPackages = '',
  registryPackages = '',
  sourceCommits = [],
  existingReleases = [],
  root = process.cwd(),
  readFile = (path) => readFileSync(path, 'utf8'),
} = {}) {
  const published = parsePublishedPackages(publishedPackages)
  const fromRegistry = parsePublishedPackages(registryPackages)
  const source = [...published, ...fromRegistry]
  const commitsByTag = new Map(
    sourceCommits.map(({ name, version, commit }) => [`${name}@${version}`, commit]),
  )
  const released = new Set(existingReleases)

  const seen = new Set()
  const plan = []

  for (const { name, version } of source) {
    if (!directoryByName.has(name)) continue
    const tag = `${name}@${version}`
    if (seen.has(tag)) continue
    seen.add(tag)
    if (released.has(tag)) continue

    plan.push({
      tag,
      title: tag,
      name,
      version,
      target: commitsByTag.get(tag) ?? null,
      prerelease: version.includes('-'),
      notes: readNotes(name, version, { root, readFile }),
    })
  }

  return plan.sort((a, b) => a.tag.localeCompare(b.tag))
}

export function main({ env = process.env, log = console.log } = {}) {
  const existingReleases = (env.EXISTING_RELEASES ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  log(JSON.stringify(planReleases({
    publishedPackages: env.PUBLISHED_PACKAGES ?? '',
    registryPackages: env.REGISTRY_PACKAGES ?? '',
    sourceCommits: parseSourceCommits(env.SOURCE_COMMITS ?? ''),
    existingReleases,
  })))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}

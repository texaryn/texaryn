// Plans one GitHub release per published package. Every package versions
// independently, so there is no repository-wide version to hang a single
// `v*` release on; each release sits on the `<name>@<version>` tag that
// `changeset publish` already pushed.
//
// The plan has two sources. `published-packages` is the changesets action
// output and describes only what that execution published, so a rerun after
// npm succeeded reports nothing. Tags pointing at the release commit survive
// that, which is what makes a retry able to finish the job.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const packages = [
  { name: '@texaryn/core', dir: 'packages/core' },
  { name: '@texaryn/schema-json', dir: 'packages/schema-json' },
  { name: '@texaryn/react', dir: 'packages/react' },
  { name: '@texaryn/react-bootstrap', dir: 'packages/react-bootstrap' },
  { name: '@texaryn/react-mui', dir: 'packages/react-mui' },
]

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

// `changeset publish` tags as `<name>@<version>`, and the name is itself
// scoped, so the version is whatever follows the final `@`.
export function parsePackageTag(tag) {
  const at = tag.lastIndexOf('@')
  if (at <= 0) return null
  const name = tag.slice(0, at)
  const version = tag.slice(at + 1)
  if (!directoryByName.has(name) || version === '') return null
  return { name, version }
}

export function packagesFromTags(tags) {
  return tags.map(parsePackageTag).filter((entry) => entry !== null)
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

// Prefers the action output and falls back to the commit's tags, so a rerun
// after a partial failure still plans the releases that are missing.
export function planReleases({
  publishedPackages = '',
  tags = [],
  root = process.cwd(),
  readFile = (path) => readFileSync(path, 'utf8'),
} = {}) {
  const published = parsePublishedPackages(publishedPackages)
  const source = published.length > 0 ? published : packagesFromTags(tags)

  const seen = new Set()
  const plan = []

  for (const { name, version } of source) {
    if (!directoryByName.has(name)) continue
    const tag = `${name}@${version}`
    if (seen.has(tag)) continue
    seen.add(tag)

    plan.push({
      tag,
      title: tag,
      name,
      version,
      prerelease: version.includes('-'),
      notes: readNotes(name, version, { root, readFile }),
    })
  }

  return plan.sort((a, b) => a.tag.localeCompare(b.tag))
}

export function main({ env = process.env, log = console.log } = {}) {
  const tags = (env.RELEASE_TAGS ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  log(JSON.stringify(planReleases({ publishedPackages: env.PUBLISHED_PACKAGES ?? '', tags })))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}

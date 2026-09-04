// Decides whether the publish job should run when main carries no pending
// changesets. It asks the registry for the exact version in each public
// package.json. Any version the registry does not have, or cannot confirm,
// means publish should run: the protected environment gate is the place to
// say no, and a registry outage must never suppress a real release.
import { readFileSync, appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const packages = [
  { name: '@texaryn/core', dir: 'packages/core' },
  { name: '@texaryn/schema-json', dir: 'packages/schema-json' },
  { name: '@texaryn/react', dir: 'packages/react' },
  { name: '@texaryn/react-bootstrap', dir: 'packages/react-bootstrap' },
]

export const registry = 'https://registry.npmjs.org'

export function readVersions(root = process.cwd()) {
  return packages.map(({ name, dir }) => {
    const manifest = JSON.parse(readFileSync(`${root}/${dir}/package.json`, 'utf8'))
    return { name, version: manifest.version }
  })
}

// 'published' when the registry serves the version document, 'missing' on 404,
// 'unknown' for every other outcome (5xx, timeout, network failure).
export async function checkVersion(name, version, { fetch = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  const url = `${registry}/${name.replace('/', '%2F')}/${version}`
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (response.status === 200) return { name, version, status: 'published' }
    if (response.status === 404) return { name, version, status: 'missing' }
    return { name, version, status: 'unknown', detail: `HTTP ${response.status}` }
  } catch (error) {
    return { name, version, status: 'unknown', detail: error instanceof Error ? error.message : String(error) }
  }
}

// Publish unless every package is confirmed published.
export function decide(results) {
  if (results.length === 0) return true
  return results.some((r) => r.status !== 'published')
}

export async function main({ root = process.cwd(), fetch = globalThis.fetch, log = console.log } = {}) {
  const results = await Promise.all(
    readVersions(root).map(({ name, version }) => checkVersion(name, version, { fetch })),
  )
  for (const r of results) {
    log(`${r.name}@${r.version}: ${r.status}${r.detail ? ` (${r.detail})` : ''}`)
  }
  const shouldPublish = decide(results)
  log(`should-publish=${shouldPublish}`)
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `should-publish=${shouldPublish}\n`)
  }
  return shouldPublish
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}

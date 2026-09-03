import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkVersion, decide, main, packages, readVersions } from './check-unpublished-packages.mjs'

function fakeFetch(statusByUrl) {
  return async (url) => {
    const status = statusByUrl(url)
    if (status instanceof Error) throw status
    return { status }
  }
}

function fakeRepo(versions) {
  const root = mkdtempSync(join(tmpdir(), 'texaryn-gate-'))
  for (const { name, dir } of packages) {
    mkdirSync(join(root, dir), { recursive: true })
    writeFileSync(join(root, dir, 'package.json'), JSON.stringify({ name, version: versions[name] }))
  }
  return root
}

describe('checkVersion', () => {
  it('asks the registry for the exact scoped version', async () => {
    const seen = []
    await checkVersion('@texaryn/core', '0.1.1', {
      fetch: async (url) => {
        seen.push(url)
        return { status: 200 }
      },
    })
    expect(seen).toEqual(['https://registry.npmjs.org/@texaryn%2Fcore/0.1.1'])
  })

  it('maps 200 to published, 404 to missing, anything else to unknown', async () => {
    const at = (status) => checkVersion('@texaryn/core', '0.1.1', { fetch: fakeFetch(() => status) })
    expect((await at(200)).status).toBe('published')
    expect((await at(404)).status).toBe('missing')
    expect((await at(500)).status).toBe('unknown')
    expect((await at(503)).status).toBe('unknown')
    expect((await at(429)).status).toBe('unknown')
  })

  it('treats a thrown fetch as unknown rather than failing', async () => {
    const result = await checkVersion('@texaryn/core', '0.1.1', {
      fetch: fakeFetch(() => new Error('ECONNRESET')),
    })
    expect(result.status).toBe('unknown')
    expect(result.detail).toBe('ECONNRESET')
  })
})

describe('decide', () => {
  const published = (name) => ({ name, version: '0.1.1', status: 'published' })
  const missing = (name) => ({ name, version: '0.1.1', status: 'missing' })
  const unknown = (name) => ({ name, version: '0.1.1', status: 'unknown' })

  it('does not publish when every version is already on the registry', () => {
    expect(decide([published('a'), published('b'), published('c')])).toBe(false)
  })

  it('publishes when one version is missing', () => {
    expect(decide([published('a'), missing('b'), published('c')])).toBe(true)
  })

  it('publishes after a partial publish where only the first package landed', () => {
    expect(decide([published('core'), missing('schema-json'), missing('react')])).toBe(true)
  })

  it('publishes when the registry could not be consulted', () => {
    expect(decide([published('a'), unknown('b'), published('c')])).toBe(true)
    expect(decide([unknown('a'), unknown('b'), unknown('c')])).toBe(true)
  })

  it('publishes when there is nothing to base a decision on', () => {
    expect(decide([])).toBe(true)
  })
})

describe('main', () => {
  it('reads the exact versions from the three package manifests', () => {
    const root = fakeRepo({ '@texaryn/core': '1.2.3', '@texaryn/schema-json': '1.2.3', '@texaryn/react': '1.2.3' })
    expect(readVersions(root)).toEqual([
      { name: '@texaryn/core', version: '1.2.3' },
      { name: '@texaryn/schema-json', version: '1.2.3' },
      { name: '@texaryn/react', version: '1.2.3' },
    ])
  })

  it('returns false and logs each package when all versions exist', async () => {
    const root = fakeRepo({ '@texaryn/core': '0.1.0', '@texaryn/schema-json': '0.1.0', '@texaryn/react': '0.1.0' })
    const lines = []
    const result = await main({ root, fetch: fakeFetch(() => 200), log: (l) => lines.push(l) })
    expect(result).toBe(false)
    expect(lines).toContain('@texaryn/core@0.1.0: published')
    expect(lines.at(-1)).toBe('should-publish=false')
  })

  it('returns true when the registry answers 5xx for one package', async () => {
    const root = fakeRepo({ '@texaryn/core': '0.1.1', '@texaryn/schema-json': '0.1.1', '@texaryn/react': '0.1.1' })
    const lines = []
    const result = await main({
      root,
      fetch: fakeFetch((url) => (url.includes('schema-json') ? 502 : 200)),
      log: (l) => lines.push(l),
    })
    expect(result).toBe(true)
    expect(lines).toContain('@texaryn/schema-json@0.1.1: unknown (HTTP 502)')
    expect(lines.at(-1)).toBe('should-publish=true')
  })

  it('returns true when the network fails entirely', async () => {
    const root = fakeRepo({ '@texaryn/core': '0.1.1', '@texaryn/schema-json': '0.1.1', '@texaryn/react': '0.1.1' })
    const result = await main({ root, fetch: fakeFetch(() => new Error('fetch failed')), log: () => {} })
    expect(result).toBe(true)
  })
})

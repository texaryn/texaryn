import { describe, it, expect } from 'vitest'
import { publishedPackages } from './packages.mjs'
import {
  extractVersionSection,
  main,
  parsePublishedPackages,
  parseSourceCommits,
  planReleases,
} from './release-plan.mjs'

const changelogs = {
  'packages/core/CHANGELOG.md': '# @texaryn/core\n\n## 0.3.0\n\n### Minor Changes\n\n- core did a thing\n\n## 0.2.0\n\n- older\n',
  'packages/schema-json/CHANGELOG.md': '# @texaryn/schema-json\n\n## 0.2.1\n\n- schema patch\n',
  'packages/react/CHANGELOG.md': '# @texaryn/react\n\n## 0.3.0\n\n- react change\n',
  'packages/react-bootstrap/CHANGELOG.md': '# @texaryn/react-bootstrap\n\n## 0.1.1\n\n- bootstrap change\n',
  'packages/react-mui/CHANGELOG.md': '# @texaryn/react-mui\n\n## 0.1.0\n\n- mui first release\n\n## 0.0.0\n\n- placeholder\n',
  'packages/schema-zod/CHANGELOG.md': '# @texaryn/schema-zod\n\n## 0.1.0\n\nInitial Zod 4 adapter release.\n',
}

function fakeReadFile(path) {
  const key = path.replace(/^\/repo\//, '')
  if (!(key in changelogs)) throw new Error(`no such file: ${path}`)
  return changelogs[key]
}

function plan(options) {
  return planReleases({ root: '/repo', readFile: fakeReadFile, ...options })
}

function published(entries) {
  return JSON.stringify(entries)
}

describe('parsePublishedPackages', () => {
  it('reads the action output shape', () => {
    expect(parsePublishedPackages(published([{ name: '@texaryn/core', version: '0.3.0' }]))).toEqual([
      { name: '@texaryn/core', version: '0.3.0' },
    ])
  })

  it('treats empty, malformed and non-array input as nothing published', () => {
    expect(parsePublishedPackages('')).toEqual([])
    expect(parsePublishedPackages('   ')).toEqual([])
    expect(parsePublishedPackages('not json')).toEqual([])
    expect(parsePublishedPackages('{"name":"x"}')).toEqual([])
    expect(parsePublishedPackages(undefined)).toEqual([])
  })

  it('drops entries missing a name or version', () => {
    const raw = published([{ name: '@texaryn/core' }, { version: '1.0.0' }, null, { name: '@texaryn/react', version: '0.3.0' }])
    expect(parsePublishedPackages(raw)).toEqual([{ name: '@texaryn/react', version: '0.3.0' }])
  })
})

describe('parseSourceCommits', () => {
  it('keeps entries with full commit hashes', () => {
    expect(parseSourceCommits(JSON.stringify([
      { name: '@texaryn/core', version: '0.3.0', commit: 'a'.repeat(40) },
      { name: '@texaryn/core', version: '0.3.1', commit: 'bad' },
    ]))).toEqual([{ name: '@texaryn/core', version: '0.3.0', commit: 'a'.repeat(40) }])
  })
})

describe('extractVersionSection', () => {
  it('returns just the requested version section', () => {
    expect(extractVersionSection(changelogs['packages/core/CHANGELOG.md'], '0.3.0')).toBe(
      '### Minor Changes\n\n- core did a thing',
    )
  })

  it('falls back when the version is absent', () => {
    expect(extractVersionSection('# pkg\n', '9.9.9')).toBe('No user-facing changes.')
  })
})

describe('planReleases', () => {
  it('plans one release per formerly-fixed package, with no aggregate v tag', () => {
    const result = plan({
      publishedPackages: published([
        { name: '@texaryn/core', version: '0.3.0' },
        { name: '@texaryn/schema-json', version: '0.2.1' },
        { name: '@texaryn/react', version: '0.3.0' },
      ]),
    })

    expect(result.map((r) => r.tag)).toEqual([
      '@texaryn/core@0.3.0',
      '@texaryn/react@0.3.0',
      '@texaryn/schema-json@0.2.1',
    ])
    expect(result.every((r) => !r.tag.startsWith('v'))).toBe(true)
    expect(result[0].notes).toBe('### Minor Changes\n\n- core did a thing')
  })

  it('plans a single release when only MUI published', () => {
    const result = plan({
      publishedPackages: published([{ name: '@texaryn/react-mui', version: '0.1.0' }]),
    })
    expect(result).toHaveLength(1)
    expect(result[0].tag).toBe('@texaryn/react-mui@0.1.0')
    expect(result[0].notes).toBe('- mui first release')
  })

  it('plans a single release when only Bootstrap published', () => {
    const result = plan({
      publishedPackages: published([{ name: '@texaryn/react-bootstrap', version: '0.1.1' }]),
    })
    expect(result).toHaveLength(1)
    expect(result[0].tag).toBe('@texaryn/react-bootstrap@0.1.1')
    expect(result[0].notes).toBe('- bootstrap change')
  })

  it('plans the Zod schema adapter release', () => {
    const result = plan({
      publishedPackages: published([{ name: '@texaryn/schema-zod', version: '0.1.0' }]),
    })
    expect(result).toEqual([
      expect.objectContaining({
        tag: '@texaryn/schema-zod@0.1.0',
        notes: 'Initial Zod 4 adapter release.',
      }),
    ])
  })

  it('plans every package when a formerly-fixed one and an independent one publish together', () => {
    const result = plan({
      publishedPackages: published([
        { name: '@texaryn/core', version: '0.3.0' },
        { name: '@texaryn/react-mui', version: '0.1.0' },
      ]),
    })
    expect(result.map((r) => r.tag)).toEqual(['@texaryn/core@0.3.0', '@texaryn/react-mui@0.1.0'])
  })

  it('plans multiple independents in one publish', () => {
    const result = plan({
      publishedPackages: published([
        { name: '@texaryn/react-mui', version: '0.1.0' },
        { name: '@texaryn/react-bootstrap', version: '0.1.1' },
      ]),
    })
    expect(result.map((r) => r.tag)).toEqual([
      '@texaryn/react-bootstrap@0.1.1',
      '@texaryn/react-mui@0.1.0',
    ])
  })

  it('marks prerelease versions', () => {
    const result = plan({
      publishedPackages: published([{ name: '@texaryn/core', version: '1.0.0-rc.1' }]),
    })
    expect(result[0].prerelease).toBe(true)
    expect(result[0].notes).toBe('No user-facing changes.')
  })

  it('does not mark stable versions as prerelease', () => {
    const result = plan({
      publishedPackages: published([{ name: '@texaryn/core', version: '0.3.0' }]),
    })
    expect(result[0].prerelease).toBe(false)
  })

  it('recovers package releases from exact versions on the registry', () => {
    const result = plan({
      registryPackages: published([{ name: '@texaryn/react-mui', version: '0.1.0' }]),
    })
    expect(result.map((r) => r.tag)).toEqual(['@texaryn/react-mui@0.1.0'])
    expect(result[0].notes).toBe('- mui first release')
  })

  it('attaches the verified source commit to a release candidate', () => {
    const target = 'a'.repeat(40)
    const result = plan({
      registryPackages: published([{ name: '@texaryn/react-mui', version: '0.1.0' }]),
      sourceCommits: [{ name: '@texaryn/react-mui', version: '0.1.0', commit: target }],
    })
    expect(result[0].target).toBe(target)
  })

  it('combines the action output with registry confirmed versions', () => {
    const result = plan({
      publishedPackages: published([{ name: '@texaryn/core', version: '0.3.0' }]),
      registryPackages: published([{ name: '@texaryn/react-mui', version: '0.1.0' }]),
    })
    expect(result.map((r) => r.tag)).toEqual([
      '@texaryn/core@0.3.0',
      '@texaryn/react-mui@0.1.0',
    ])
  })

  it('skips tags that already have GitHub releases', () => {
    const result = plan({
      publishedPackages: published([{ name: '@texaryn/core', version: '0.3.0' }]),
      registryPackages: published([{ name: '@texaryn/react-mui', version: '0.1.0' }]),
      existingReleases: ['@texaryn/react-mui@0.1.0'],
    })
    expect(result.map((r) => r.tag)).toEqual(['@texaryn/core@0.3.0'])
  })

  it('plans nothing when neither source has anything', () => {
    expect(plan({ publishedPackages: '', registryPackages: '' })).toEqual([])
    expect(plan({ publishedPackages: '[]', registryPackages: 'not json' })).toEqual([])
  })

  it('deduplicates a package that appears in both forms', () => {
    const result = plan({
      publishedPackages: published([{ name: '@texaryn/react-mui', version: '0.1.0' }]),
      registryPackages: published([{ name: '@texaryn/react-mui', version: '0.1.0' }]),
    })
    expect(result).toHaveLength(1)
  })

  it('survives a missing changelog rather than failing the release', () => {
    const result = planReleases({
      root: '/repo',
      readFile: () => {
        throw new Error('ENOENT')
      },
      publishedPackages: published([{ name: '@texaryn/core', version: '0.3.0' }]),
    })
    expect(result[0].notes).toBe('No user-facing changes.')
  })
})

describe('main', () => {
  it('emits JSON built from the environment', () => {
    const lines = []
    main({
      env: {
        PUBLISHED_PACKAGES: published([{ name: '@texaryn/react-mui', version: '0.1.0' }]),
        REGISTRY_PACKAGES: published([{ name: '@texaryn/core', version: '0.3.0' }]),
        SOURCE_COMMITS: JSON.stringify([
          { name: '@texaryn/core', version: '0.3.0', commit: 'a'.repeat(40) },
          { name: '@texaryn/react-mui', version: '0.1.0', commit: 'b'.repeat(40) },
        ]),
        EXISTING_RELEASES: '',
      },
      log: (line) => lines.push(line),
    })
    const parsed = JSON.parse(lines[0])
    expect(parsed.map((release) => release.tag)).toEqual([
      '@texaryn/core@0.3.0',
      '@texaryn/react-mui@0.1.0',
    ])
    expect(parsed[0].target).toBe('a'.repeat(40))
  })

  it('reads registry packages and existing releases for the recovery path', () => {
    const lines = []
    main({
      env: {
        PUBLISHED_PACKAGES: '',
        REGISTRY_PACKAGES: published([{ name: '@texaryn/react-mui', version: '0.1.0' }]),
        EXISTING_RELEASES: '@texaryn/core@0.3.0\n',
      },
      log: (line) => lines.push(line),
    })
    expect(JSON.parse(lines[0]).map((r) => r.tag)).toEqual(['@texaryn/react-mui@0.1.0'])
  })
})

// The gap that let @texaryn/vue publish to npm with no GitHub release. Three
// scripts carried their own copy of the package list, adding the package
// reached two of them, and the planner silently dropped what it did not
// recognise: "planned releases: 0" while npm served 0.1.0.
describe('every published package can actually be planned', () => {
  it('plans a release for each one, naming any it cannot', () => {
    const readAny = (path) => {
      const name = path.split('/').slice(-2)[0]
      return `# pkg\n\n## 9.9.9\n\n- ${name} changed\n`
    }
    const planned = planReleases({
      root: '/repo',
      readFile: readAny,
      publishedPackages: JSON.stringify(
        publishedPackages.map(({ name }) => ({ name, version: '9.9.9' })),
      ),
      tags: [],
    })

    const missing = publishedPackages
      .map(({ name }) => name)
      .filter((name) => !planned.some((release) => release.tag === `${name}@9.9.9`))

    expect(missing, 'these packages publish but would get no GitHub release').toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
import {
  extractVersionSection,
  main,
  packagesFromTags,
  parsePackageTag,
  parsePublishedPackages,
  planReleases,
} from './release-plan.mjs'

const changelogs = {
  'packages/core/CHANGELOG.md': '# @texaryn/core\n\n## 0.3.0\n\n### Minor Changes\n\n- core did a thing\n\n## 0.2.0\n\n- older\n',
  'packages/schema-json/CHANGELOG.md': '# @texaryn/schema-json\n\n## 0.2.1\n\n- schema patch\n',
  'packages/react/CHANGELOG.md': '# @texaryn/react\n\n## 0.3.0\n\n- react change\n',
  'packages/react-bootstrap/CHANGELOG.md': '# @texaryn/react-bootstrap\n\n## 0.1.1\n\n- bootstrap change\n',
  'packages/react-mui/CHANGELOG.md': '# @texaryn/react-mui\n\n## 0.1.0\n\n- mui first release\n\n## 0.0.0\n\n- placeholder\n',
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

describe('parsePackageTag', () => {
  it('splits on the final @ so the scope survives', () => {
    expect(parsePackageTag('@texaryn/react-mui@0.1.0')).toEqual({
      name: '@texaryn/react-mui',
      version: '0.1.0',
    })
  })

  it('keeps prerelease versions intact', () => {
    expect(parsePackageTag('@texaryn/core@1.0.0-rc.1')).toEqual({
      name: '@texaryn/core',
      version: '1.0.0-rc.1',
    })
  })

  it('ignores tags that are not package tags', () => {
    expect(parsePackageTag('v0.2.0')).toBeNull()
    expect(parsePackageTag('@texaryn/core')).toBeNull()
    expect(parsePackageTag('@texaryn/core@')).toBeNull()
    expect(parsePackageTag('@other/thing@1.0.0')).toBeNull()
  })
})

describe('packagesFromTags', () => {
  it('keeps package tags and discards the rest', () => {
    expect(packagesFromTags(['v0.2.0', '@texaryn/react-mui@0.1.0', 'nightly'])).toEqual([
      { name: '@texaryn/react-mui', version: '0.1.0' },
    ])
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

  it('falls back to commit tags when a rerun reports nothing published', () => {
    const result = plan({
      publishedPackages: '',
      tags: ['@texaryn/react-mui@0.1.0', 'v0.2.0'],
    })
    expect(result.map((r) => r.tag)).toEqual(['@texaryn/react-mui@0.1.0'])
    expect(result[0].notes).toBe('- mui first release')
  })

  it('prefers the action output over tags when both are present', () => {
    const result = plan({
      publishedPackages: published([{ name: '@texaryn/core', version: '0.3.0' }]),
      tags: ['@texaryn/react-mui@0.1.0'],
    })
    expect(result.map((r) => r.tag)).toEqual(['@texaryn/core@0.3.0'])
  })

  it('plans nothing when neither source has anything', () => {
    expect(plan({ publishedPackages: '', tags: [] })).toEqual([])
    expect(plan({ publishedPackages: '[]', tags: ['v0.2.0'] })).toEqual([])
  })

  it('deduplicates a package that appears in both forms', () => {
    const result = plan({
      publishedPackages: published([
        { name: '@texaryn/react-mui', version: '0.1.0' },
        { name: '@texaryn/react-mui', version: '0.1.0' },
      ]),
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
        RELEASE_TAGS: '',
      },
      log: (line) => lines.push(line),
    })
    const parsed = JSON.parse(lines[0])
    expect(parsed).toHaveLength(1)
    expect(parsed[0].tag).toBe('@texaryn/react-mui@0.1.0')
  })

  it('reads newline separated tags for the retry path', () => {
    const lines = []
    main({
      env: { PUBLISHED_PACKAGES: '', RELEASE_TAGS: '@texaryn/react-mui@0.1.0\nv0.2.0\n' },
      log: (line) => lines.push(line),
    })
    expect(JSON.parse(lines[0]).map((r) => r.tag)).toEqual(['@texaryn/react-mui@0.1.0'])
  })
})

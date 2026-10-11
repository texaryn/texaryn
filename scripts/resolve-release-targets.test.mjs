import { describe, expect, it } from 'vitest'
import {
  parsePackageInputs,
  resolveReleaseTargets,
  sourceCommitFromVerifiedEntry,
  verifySourceCommit,
} from './resolve-release-targets.mjs'

const commit = 'a'.repeat(40)
const name = '@texaryn/react-bootstrap'
const version = '0.6.0'

function verifiedEntry({
  packageName = name,
  packageVersion = version,
  subject = `pkg:npm/${packageName.replace(/^@/, '%40')}@${packageVersion}`,
  repository = 'https://github.com/texaryn/texaryn',
  ref = 'refs/heads/main',
  path = '.github/workflows/ci-release.yml',
  eventName = 'push',
  sourceCommit = commit,
} = {}) {
  const statement = {
    subject: [{ name: subject }],
    predicateType: 'https://slsa.dev/provenance/v1',
    predicate: {
      buildDefinition: {
        externalParameters: { workflow: { repository, ref, path } },
        internalParameters: { github: { event_name: eventName } },
        resolvedDependencies: [{
          uri: 'git+https://github.com/texaryn/texaryn@refs/heads/main',
          digest: { gitCommit: sourceCommit },
        }],
      },
      runDetails: { metadata: { invocationId: 'https://github.com/texaryn/texaryn/actions/runs/123/attempts/1' } },
    },
  }

  return {
    name: packageName,
    version: packageVersion,
    attestationBundles: [{
      predicateType: 'https://slsa.dev/provenance/v1',
      bundle: { dsseEnvelope: { payload: Buffer.from(JSON.stringify(statement)).toString('base64') } },
    }],
  }
}

describe('parsePackageInputs', () => {
  it('combines and deduplicates action and registry package versions', () => {
    expect(parsePackageInputs(
      JSON.stringify([{ name, version }]),
      JSON.stringify([{ name, version }, { name: '@texaryn/private', version }]),
    )).toEqual([{ name, version }])
  })

  it('ignores invalid inputs', () => {
    expect(parsePackageInputs('not json', JSON.stringify([{ name, version: 'latest' }]))).toEqual([])
  })
})

describe('sourceCommitFromVerifiedEntry', () => {
  it('extracts the source commit from a matching verified npm provenance bundle', () => {
    expect(sourceCommitFromVerifiedEntry(verifiedEntry())).toBe(commit)
  })

  it.each([
    ['repository', { repository: 'https://github.com/someone/else' }],
    ['branch', { ref: 'refs/heads/feature' }],
    ['workflow', { path: '.github/workflows/other.yml' }],
    ['event', { eventName: 'pull_request' }],
    ['subject', { subject: 'pkg:npm/%40texaryn/react-bootstrap@0.5.0' }],
  ])('rejects provenance with a mismatched %s', (_label, overrides) => {
    expect(() => sourceCommitFromVerifiedEntry(verifiedEntry(overrides))).toThrow()
  })

  it('rejects a missing or malformed source commit', () => {
    expect(() => sourceCommitFromVerifiedEntry(verifiedEntry({ sourceCommit: 'deadbeef' }))).toThrow(
      'no unique source commit',
    )
  })
})

describe('verifySourceCommit', () => {
  it('requires the package manifest at the attested commit and ancestry to main', () => {
    const calls = []
    const result = verifySourceCommit({ name, version, commit }, {
      root: '/repo',
      headCommit: 'b'.repeat(40),
      run: (command, args, options) => {
        calls.push({ command, args, options })
        return args[0] === 'show' ? JSON.stringify({ name, version }) : ''
      },
    })

    expect(result).toEqual({ name, version, commit })
    expect(calls[0].args).toEqual(['merge-base', '--is-ancestor', commit, 'b'.repeat(40)])
    expect(calls[1].args).toEqual(['show', `${commit}:packages/react-bootstrap/package.json`])
  })

  it('rejects a source commit whose package manifest does not match the version', () => {
    expect(() => verifySourceCommit({ name, version, commit }, {
      headCommit: 'b'.repeat(40),
      run: (_command, args) => args[0] === 'show' ? JSON.stringify({ name, version: '0.5.0' }) : '',
    })).toThrow('does not contain @texaryn/react-bootstrap@0.6.0')
  })
})

describe('resolveReleaseTargets', () => {
  it('requires a verified provenance entry for every package version', () => {
    expect(() => resolveReleaseTargets([{ name, version }], [], {
      headCommit: 'b'.repeat(40),
    })).toThrow('npm did not verify a signature and provenance')
  })
})

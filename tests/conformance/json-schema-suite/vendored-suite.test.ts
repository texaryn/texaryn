// The vendored suite is third-party input, and UPSTREAM_REVISION only says
// what someone typed into it. This checks the files still match the digests
// recorded when they were imported, so a local edit, a truncated copy or a
// half-finished update cannot masquerade as the pinned revision.
//
// It proves integrity since import, not provenance: it cannot show the files
// came from that upstream commit. Only re-importing does that.
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { suiteFiles, suiteRoot } from './runner.js'

const manifest = JSON.parse(
  readFileSync(join(suiteRoot, 'SHA256SUMS.json'), 'utf8'),
) as Record<string, string>

function digest(relative: string): string {
  return createHash('sha256').update(readFileSync(join(suiteRoot, relative))).digest('hex')
}

describe('vendored JSON Schema Test Suite', () => {
  it('covers every vendored file in the manifest', () => {
    const present = [...suiteFiles(), 'LICENSE'].sort()
    expect(
      present.filter((file) => !(file in manifest)),
      'these files are vendored but not recorded in SHA256SUMS.json',
    ).toEqual([])
    expect(
      Object.keys(manifest).filter((file) => !present.includes(file)),
      'these files are recorded in SHA256SUMS.json but missing from the tree',
    ).toEqual([])
  })

  it('matches the recorded digest of every file', () => {
    const changed = Object.keys(manifest)
      .filter((file) => digest(file) !== manifest[file])
      .map((file) => `  ${file}`)
    expect(
      changed,
      `these vendored files no longer match their recorded digest, so the pinned revision no longer describes them:\n${changed.join('\n')}`,
    ).toEqual([])
  })
})

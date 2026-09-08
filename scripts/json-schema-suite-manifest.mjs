// Records a SHA-256 digest per vendored JSON Schema Test Suite file.
//
// Run this only as part of importing a new upstream revision. The conformance
// suite checks the tree against this manifest on every run, so regenerating it
// to clear a digest failure would destroy the only evidence that a vendored
// file was edited locally.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const suiteRoot = fileURLToPath(new URL('../tests/conformance/json-schema-test-suite/', import.meta.url))
const extraFiles = ['LICENSE']

function jsonFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...jsonFiles(full))
    else if (entry.name.endsWith('.json')) out.push(full)
  }
  return out
}

const files = [
  ...jsonFiles(join(suiteRoot, 'tests')).map((path) =>
    relative(suiteRoot, path).split('\\').join('/'),
  ),
  ...extraFiles,
].sort()

const manifest = {}
for (const file of files) {
  manifest[file] = createHash('sha256').update(readFileSync(join(suiteRoot, file))).digest('hex')
}

writeFileSync(join(suiteRoot, 'SHA256SUMS.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`json-schema-suite-manifest: recorded ${files.length} digests`)

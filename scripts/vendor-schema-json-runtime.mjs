import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageRoot = join(root, 'packages/schema-json')
const dependencyRoot = join(packageRoot, 'node_modules/json-schema-library')
const dependencyDist = join(dependencyRoot, 'dist')
const vendorRoot = join(packageRoot, 'dist/vendor/json-schema-library')
const dependency = JSON.parse(readFileSync(join(dependencyRoot, 'package.json'), 'utf8'))
const dependencySource = readFileSync(join(dependencyRoot, 'src/keywords/dependencies.ts'), 'utf8')
const runtime = readFileSync(join(dependencyDist, 'index.mjs'), 'utf8')

if (dependency.version !== '11.6.2') {
  throw new Error(`Expected json-schema-library 11.6.2, received ${dependency.version}`)
}

for (const marker of ['const { node: reducedDependency, error }', 'if (error)', 'if (!reducedDependency)']) {
  if (!dependencySource.includes(marker)) {
    throw new Error(`json-schema-library is missing the dependent schema fix: ${marker}`)
  }
}

for (const marker of ['if(error)return;', 'if(d.error){error=d.error;return}']) {
  if (!runtime.includes(marker)) {
    throw new Error(`json-schema-library ESM bundle is missing the dependent schema fix: ${marker}`)
  }
}

rmSync(vendorRoot, { recursive: true, force: true })
mkdirSync(vendorRoot, { recursive: true })
for (const file of ['index.mjs', 'index.mjs.map']) {
  cpSync(join(dependencyDist, file), join(vendorRoot, file))
}
cpSync(join(dependencyRoot, 'LICENSE.md'), join(vendorRoot, 'LICENSE.md'))

function rewriteRuntimeImports(directory) {
  let found = false
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    const stats = statSync(path)
    if (stats.isDirectory()) {
      if (rewriteRuntimeImports(path)) found = true
      continue
    }
    if (!entry.endsWith('.js')) continue

    const source = readFileSync(path, 'utf8')
    const target = relative(dirname(path), join(vendorRoot, 'index.mjs')).split(sep).join('/')
    const specifier = target.startsWith('.') ? target : `./${target}`
    if (
      source.includes(`from '${specifier}'`) ||
      source.includes(`from "${specifier}"`) ||
      source.includes(`import('${specifier}')`) ||
      source.includes(`import("${specifier}")`)
    ) {
      found = true
    }
    const updated = source.replace(
      /(\bfrom\s*|\bimport\s*\()(["'])json-schema-library\2/g,
      (_match, prefix, quote) => `${prefix}${quote}${specifier}${quote}`,
    )
    if (updated !== source) {
      found = true
      writeFileSync(path, updated)
    }
  }
  return found
}

if (!rewriteRuntimeImports(join(packageRoot, 'dist'))) {
  throw new Error('@texaryn/schema-json build emitted no json-schema-library runtime imports')
}

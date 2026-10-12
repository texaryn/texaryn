import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

export const LIMITS = { initial: 175 * 1024, editor: 150 * 1024, palette: 25 * 1024 }

export function gzipSize(source) {
  return gzipSync(source, { level: 9 }).length
}

// Files a manifest entry loads without a dynamic import, itself included.
function staticClosure(manifest, keys) {
  const seen = new Set()
  const visit = (chunk) => {
    if (!chunk || seen.has(chunk.file)) return
    seen.add(chunk.file)
    for (const key of chunk.imports ?? []) visit(manifest[key])
  }
  for (const key of keys) visit(manifest[key])
  return seen
}

function entryKeys(manifest) {
  return Object.keys(manifest).filter((key) => manifest[key].isEntry)
}

function dynamicEntryKeys(manifest, matches) {
  return Object.keys(manifest).filter((key) => manifest[key].isDynamicEntry && matches(key))
}

export function measure({ manifest, read }) {
  const initial = staticClosure(manifest, entryKeys(manifest))
  const lazy = (keys) => [...staticClosure(manifest, keys)].filter((file) => !initial.has(file))
  const sum = (files) => files.reduce((total, file) => total + gzipSize(read(file)), 0)
  return {
    initial: sum([...initial]),
    editor: sum(lazy(dynamicEntryKeys(manifest, (key) => key === 'src/editor/SchemaEditor.tsx'))),
    palette: sum(lazy(dynamicEntryKeys(manifest, (key) => key.startsWith('src/palette/')))),
  }
}

export function overLimit(sizes, limits = LIMITS) {
  return Object.keys(limits).filter((key) => sizes[key] > limits[key])
}

export function lazyLeaks(manifest) {
  return [...staticClosure(manifest, entryKeys(manifest))].filter((file) => /(^|\/)(editor|palette)-[^/]*\.js$/.test(file))
}

function main(dist) {
  const root = resolve(dist)
  const manifest = JSON.parse(readFileSync(join(root, '.vite', 'manifest.json'), 'utf8'))
  const sizes = measure({ manifest, read: (file) => readFileSync(join(root, file)) })
  for (const key of Object.keys(LIMITS)) {
    console.log(`${key}: ${(sizes[key] / 1024).toFixed(1)} KB gzipped, limit ${LIMITS[key] / 1024} KB`)
  }
  const over = overLimit(sizes)
  const leaks = lazyLeaks(manifest)
  if (over.length > 0) console.error(`check-playground-size: over the limit: ${over.join(', ')}`)
  if (leaks.length > 0) {
    console.error(`check-playground-size: loaded on first visit but meant to be lazy: ${leaks.join(', ')}`)
  }
  if (over.length > 0 || leaks.length > 0) process.exit(1)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv[2] ?? 'apps/playground/dist')

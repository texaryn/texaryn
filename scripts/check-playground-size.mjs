import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

export const LIMITS = { initial: 175 * 1024, editor: 150 * 1024, palette: 25 * 1024 }

export function gzipSize(source) {
  return gzipSync(source, { level: 9 }).length
}

export function initialScripts(html) {
  const found = new Set()
  for (const match of html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)) found.add(match[1])
  for (const match of html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)) found.add(match[1])
  return [...found]
}

export function measure({ html, assets, read }) {
  const sum = (names) => names.reduce((total, name) => total + gzipSize(read(name)), 0)
  return {
    initial: sum(initialScripts(html).map((src) => src.split('/').pop())),
    editor: sum(assets.filter((name) => /^editor-.*\.js$/.test(name))),
    palette: sum(assets.filter((name) => /^palette-.*\.js$/.test(name))),
  }
}

export function overLimit(sizes, limits = LIMITS) {
  return Object.keys(limits).filter((key) => sizes[key] > limits[key])
}

// Every file the entry pulls in without a dynamic import, from Vite's manifest.
export function eagerChunks(manifest) {
  const seen = new Set()
  const visit = (chunk) => {
    if (!chunk || seen.has(chunk.file)) return
    seen.add(chunk.file)
    for (const key of chunk.imports ?? []) visit(manifest[key])
  }
  visit(Object.values(manifest).find((chunk) => chunk.isEntry))
  return [...seen]
}

export function lazyLeaks(manifest) {
  return eagerChunks(manifest).filter((file) => /(^|\/)(editor|palette)-[^/]*\.js$/.test(file))
}

function main(dist) {
  const root = resolve(dist)
  const assetsDir = join(root, 'assets')
  const sizes = measure({
    html: readFileSync(join(root, 'index.html'), 'utf8'),
    assets: readdirSync(assetsDir).filter((name) => name.endsWith('.js')),
    read: (name) => readFileSync(join(assetsDir, name)),
  })
  for (const key of Object.keys(LIMITS)) {
    console.log(`${key}: ${(sizes[key] / 1024).toFixed(1)} KB gzipped, limit ${LIMITS[key] / 1024} KB`)
  }
  const over = overLimit(sizes)
  if (over.length > 0) {
    console.error(`check-playground-size: over the limit: ${over.join(', ')}`)
    process.exit(1)
  }
  const leaks = lazyLeaks(JSON.parse(readFileSync(join(root, '.vite', 'manifest.json'), 'utf8')))
  if (leaks.length > 0) {
    console.error(`check-playground-size: loaded on first visit but meant to be lazy: ${leaks.join(', ')}`)
    process.exit(1)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv[2] ?? 'apps/playground/dist')

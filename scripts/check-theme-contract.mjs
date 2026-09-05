// One theme authority across the composed Pages artifact.
//
// The documentation site and the playground are separate builds that become
// one origin, so they share a `localStorage` preference. That only works while
// both resolve it the same way, and the resolution lives in an inline boot
// script neither build can import: each embeds a generated copy.
//
// Two things can quietly break that. A Starlight upgrade can reintroduce its
// own boot script, and then two scripts stamp `data-theme` from two different
// keys, the later one winning by accident of order. Or one of the two builds
// can stop injecting the script at all, and that half of the site loses its
// theme on a cold load while every other check stays green.
//
// So this asserts the artifact, not the source: every document that should
// carry the boot script carries the exact bytes this repository generates, and
// Starlight's own preference key appears nowhere.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { themeBootScript } from '../theme.config.mjs'

// The element name legitimately contains the key as a substring: the picker is
// still Starlight's custom element. Matching the key as a whole token is what
// separates "we kept their component" from "we kept their storage".
const STARLIGHT_KEY = /(?<![\w-])starlight-theme(?![\w-])/

export function findHtmlFiles(root) {
  const found = []
  const walk = (directory) => {
    for (const entry of readdirSync(directory).sort()) {
      const full = join(directory, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith('.html')) found.push(full)
    }
  }
  walk(root)
  return found
}

/**
 * @returns {{ missing: string[]; foreign: string[]; checked: number }}
 */
export function auditThemeContract(files, read) {
  const expected = themeBootScript()
  const missing = []
  const foreign = []

  for (const file of files) {
    const html = read(file)
    if (!html.includes(expected)) missing.push(file)
    if (STARLIGHT_KEY.test(html)) foreign.push(file)
  }

  return { missing, foreign, checked: files.length }
}

function main(root) {
  const resolved = resolve(root)
  const files = findHtmlFiles(resolved)
  if (files.length === 0) {
    console.error(`check-theme-contract: no HTML under ${root}. Did the site build run?`)
    process.exit(1)
  }

  const { missing, foreign, checked } = auditThemeContract(files, (file) =>
    readFileSync(file, 'utf8'),
  )
  const relative = (file) => file.slice(resolved.length + 1) || file

  if (missing.length > 0) {
    console.error(
      `check-theme-contract: ${missing.length} of ${checked} documents do not carry this repository's boot script.`,
    )
    console.error('A document without it has no theme until the application hydrates.')
    for (const file of missing.slice(0, 10)) console.error(`  ${relative(file)}`)
    process.exit(1)
  }

  if (foreign.length > 0) {
    console.error(
      `check-theme-contract: ${foreign.length} documents still reference Starlight's own preference key.`,
    )
    console.error('Two keys means two authorities, and the one that wins is whichever runs last.')
    for (const file of foreign.slice(0, 10)) console.error(`  ${relative(file)}`)
    process.exit(1)
  }

  console.log(
    `check-theme-contract: ${checked} documents, one boot script, no second preference key`,
  )
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.argv[2]
  if (!root) {
    console.error('usage: node scripts/check-theme-contract.mjs <site-root>')
    process.exit(1)
  }
  main(root.split('/').join(sep))
}

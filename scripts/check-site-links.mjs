// Navigation correctness for the composed Pages artifact.
//
// Route correctness is already covered twice over: the docs build fails on a
// broken internal link, and the playground writes an entry point per catalog
// example. Both stayed green while every "Open in the playground" link on the
// site pointed at /texarynplayground/<id>. Neither could see it. The docs
// checker excludes the playground subtree because those files belong to the
// other build, and the playground never sees the links pointing into it.
//
// The gap closes on the composed artifact, where the two applications are one
// site and no exclusion is needed. A page that exists is not the same as a
// page anyone can reach, so this asserts both directions: no anchor leads
// somewhere the artifact cannot serve, and the routes into the playground are
// actually offered.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, posix, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BASE_PATH, PLAYGROUND_PATH } from '../site.config.mjs'

const ANCHOR = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))/gi

export function extractHrefs(html) {
  const hrefs = []
  for (const match of html.matchAll(ANCHOR)) {
    hrefs.push(match[1] ?? match[2] ?? match[3])
  }
  return hrefs
}

export function classify(href) {
  const trimmed = href.trim()
  if (trimmed === '') return { kind: 'empty' }
  if (trimmed.startsWith('#')) return { kind: 'fragment' }
  // Protocol-relative and any scheme (http, mailto, tel, javascript).
  if (trimmed.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return { kind: 'external' }
  }
  const path = trimmed.split('#')[0].split('?')[0]
  if (path === '') return { kind: 'fragment' }
  return { kind: 'internal', path }
}

// The files a static host would try for a URL path, relative to the artifact
// root. GitHub Pages serves an extensionless path by redirecting to its
// trailing-slash form, so a directory index counts as a hit.
//
// Null means the path cannot be served by this artifact at all, which is what
// a root-relative link outside the site base is. That case never reaches a
// file lookup, and it is the one that shipped.
export function targetCandidates(path, { base, fromDir }) {
  const prefix = base.endsWith('/') ? base : `${base}/`

  // Decoding comes before every other decision. %2e%2e is only .. once
  // decoded, and this function's contract is that a target it returns names a
  // file inside the artifact.
  let decoded
  try {
    decoded = decodeURIComponent(path)
  } catch {
    return null
  }

  let rest
  if (decoded.startsWith('/')) {
    if (decoded === prefix || decoded === prefix.slice(0, -1)) return ['index.html']
    if (!decoded.startsWith(prefix)) return null
    rest = posix.normalize(decoded.slice(prefix.length))
  } else {
    rest = posix.join(fromDir, decoded)
  }

  if (rest === '..' || rest.startsWith('../')) return null
  if (rest === '.' || rest === '') return ['index.html']
  if (rest.endsWith('/')) return [posix.join(rest, 'index.html')]
  return [rest, `${rest}.html`, posix.join(rest, 'index.html')]
}

export function checkSite({ pages, exists, base, playground }) {
  const prefix = base.endsWith('/') ? base : `${base}/`
  const mount = playground
  const broken = []
  const playgroundLinks = []

  for (const page of pages) {
    const fromDir = posix.dirname(page.path)
    for (const href of extractHrefs(page.html)) {
      const link = classify(href)
      if (link.kind !== 'internal') continue

      const candidates = targetCandidates(link.path, { base, fromDir })
      if (candidates === null) {
        broken.push({ page: page.path, href, reason: `outside the site base ${prefix}` })
        continue
      }
      if (!candidates.some(exists)) {
        broken.push({ page: page.path, href, reason: 'no file in the artifact' })
        continue
      }
      if (link.path === mount.slice(0, -1) || link.path.startsWith(mount)) {
        playgroundLinks.push({ page: page.path, path: link.path })
      }
    }
  }

  // A link that resolves proves nothing when no page carries one, which is
  // how a landing page with no route to the playground passed as correct.
  const problems = []
  if (pages.length === 0) problems.push('no HTML pages found in the artifact')

  // The playground's own pages must not satisfy assertions about the docs
  // reaching it, so they are excluded by the same mount the links use.
  const mountDir = mount.slice(prefix.length)
  const fromDocs = playgroundLinks.filter((link) => !link.page.startsWith(mountDir))
  const fromLanding = fromDocs.filter((link) => link.page === 'index.html')
  const fromOtherPages = fromDocs.filter((link) => link.page !== 'index.html')
  const toExamples = fromDocs.filter((link) => link.path.length > mount.length)

  if (pages.some((page) => page.path === 'index.html') && fromLanding.length === 0) {
    problems.push('the landing page offers no link into the playground')
  }
  if (fromOtherPages.length === 0) {
    problems.push('no page other than the landing page links into the playground')
  }
  if (toExamples.length === 0) {
    problems.push('no page links to a specific playground example')
  }

  return { broken, problems, pageCount: pages.length, playgroundLinks: fromDocs.length }
}

function htmlPages(dir) {
  const pages = []
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith('.html')) {
        pages.push({
          path: full.slice(dir.length + 1).split(sep).join(posix.sep),
          html: readFileSync(full, 'utf8'),
        })
      }
    }
  }
  walk(dir)
  return pages
}

export function main(argv, { log = console.log, error = console.error } = {}) {
  const [dirArg] = argv
  if (!dirArg) {
    error('usage: node scripts/check-site-links.mjs <artifact-dir>')
    return 2
  }
  const dir = resolve(dirArg)
  const result = checkSite({
    pages: htmlPages(dir),
    exists: (candidate) => {
      try {
        return statSync(join(dir, candidate)).isFile()
      } catch {
        return false
      }
    },
    base: BASE_PATH,
    playground: PLAYGROUND_PATH,
  })

  for (const link of result.broken) {
    error(`broken: ${link.page} links to ${link.href} (${link.reason})`)
  }
  for (const problem of result.problems) {
    error(`missing: ${problem}`)
  }
  if (result.broken.length > 0 || result.problems.length > 0) return 1

  log(
    `check-site-links: ${result.pageCount} pages, every anchor resolves, ` +
      `${result.playgroundLinks} links from the docs into the playground`,
  )
  return 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exit(main(process.argv.slice(2)))
}

import { describe, it, expect } from 'vitest'
import { checkSite, classify, extractHrefs, targetCandidates } from './check-site-links.mjs'

const BASE = '/texaryn/'
const PLAYGROUND = `${BASE}playground/`

// A minimal artifact that satisfies every positive assertion, so a test can
// break one thing at a time.
const FILES = new Set([
  'index.html',
  'start/getting-started/index.html',
  'playground/index.html',
  'playground/basics-object/index.html',
])

function page(path, ...hrefs) {
  return {
    path,
    html: hrefs.map((href) => `<a href="${href}">link</a>`).join('\n'),
  }
}

const LANDING = page('index.html', '/texaryn/playground/', '/texaryn/start/getting-started/')
const GUIDE = page(
  'start/getting-started/index.html',
  '/texaryn/playground/',
  '/texaryn/playground/basics-object',
)
const PLAYGROUND_PAGE = page('playground/index.html', '/texaryn/')

function check(pages, files = FILES) {
  return checkSite({
    pages,
    exists: (path) => files.has(path),
    base: BASE,
    playground: PLAYGROUND,
  })
}

describe('extractHrefs', () => {
  it('reads every quoting style an anchor can carry', () => {
    const html = `<a href="/one">a</a><a class="x" href='/two'>b</a><a href=/three>c</a>`
    expect(extractHrefs(html)).toEqual(['/one', '/two', '/three'])
  })

  it('ignores href on anything that is not an anchor', () => {
    const html = '<link rel="stylesheet" href="/style.css"><area href="/map">'
    expect(extractHrefs(html)).toEqual([])
  })
})

describe('classify', () => {
  it('sets aside what a static artifact cannot own', () => {
    expect(classify('https://example.com').kind).toBe('external')
    expect(classify('//example.com').kind).toBe('external')
    expect(classify('mailto:someone@example.com').kind).toBe('external')
    expect(classify('#section').kind).toBe('fragment')
    expect(classify('').kind).toBe('empty')
  })

  it('drops the query and the fragment from an internal path', () => {
    expect(classify('/texaryn/playground/?renderer=mui#top')).toEqual({
      kind: 'internal',
      path: '/texaryn/playground/',
    })
  })
})

describe('targetCandidates', () => {
  const from = { base: BASE, fromDir: 'start/getting-started' }

  it('serves a trailing slash and the base itself from a directory index', () => {
    expect(targetCandidates('/texaryn/', from)).toEqual(['index.html'])
    expect(targetCandidates('/texaryn', from)).toEqual(['index.html'])
    expect(targetCandidates('/texaryn/api/', from)).toEqual(['api/index.html'])
  })

  it('accepts an extensionless path as a file or a directory index', () => {
    expect(targetCandidates('/texaryn/playground/basics-object', from)).toEqual([
      'playground/basics-object',
      'playground/basics-object.html',
      'playground/basics-object/index.html',
    ])
  })

  it('resolves a relative link against the page that carries it', () => {
    expect(targetCandidates('../what-is-texaryn/', from)).toEqual([
      'start/what-is-texaryn/index.html',
    ])
  })

  it('refuses a path the artifact cannot serve', () => {
    expect(targetCandidates('/texarynplayground/basics-object', from)).toBeNull()
    expect(targetCandidates('/elsewhere/', from)).toBeNull()
    expect(targetCandidates('../../../etc/passwd', from)).toBeNull()
  })

  // The escape is only .. once decoded, so a containment check that ran
  // first would hand back a target outside the artifact and call it inside.
  it('refuses an encoded escape from the artifact', () => {
    expect(targetCandidates('%2e%2e/%2e%2e/%2e%2e/etc/passwd', from)).toBeNull()
    expect(targetCandidates('/texaryn/%2e%2e/secret', from)).toBeNull()
    expect(targetCandidates('/texaryn/api/%2E%2E/%2E%2E/secret', from)).toBeNull()
  })

  it('refuses percent-encoding that decodes to nothing', () => {
    expect(targetCandidates('/texaryn/%E0%A4%A', from)).toBeNull()
  })

  it('decodes an escaped character in a name it keeps', () => {
    expect(targetCandidates('/texaryn/a%20b/', from)).toEqual(['a b/index.html'])
  })
})

describe('checkSite', () => {
  it('passes a composed artifact whose links all resolve', () => {
    const result = check([LANDING, GUIDE, PLAYGROUND_PAGE])
    expect(result.broken).toEqual([])
    expect(result.problems).toEqual([])
    expect(result.playgroundLinks).toBe(3)
  })

  // The regression this exists for. `${import.meta.env.BASE_URL}playground/`
  // concatenated a base with no trailing slash, and the docs build reported
  // every internal link valid because the result is not a site route at all.
  it('catches a link that lost the separator after the base', () => {
    const result = check([LANDING, page('start/getting-started/index.html', '/texarynplayground/basics-object')])
    expect(result.broken).toEqual([
      {
        page: 'start/getting-started/index.html',
        href: '/texarynplayground/basics-object',
        reason: 'outside the site base /texaryn/',
      },
    ])
  })

  it('catches a link that repeats the base', () => {
    const result = check([LANDING, page('start/getting-started/index.html', '/texaryn/texaryn/playground/')])
    expect(result.broken).toEqual([
      {
        page: 'start/getting-started/index.html',
        href: '/texaryn/texaryn/playground/',
        reason: 'no file in the artifact',
      },
    ])
  })

  it('catches a landing page that offers no way into the playground', () => {
    const landing = page('index.html', '/texaryn/start/getting-started/')
    expect(check([landing, GUIDE, PLAYGROUND_PAGE]).problems).toEqual([
      'the landing page offers no link into the playground',
    ])
  })

  // Every link resolving is satisfied by a site with no links at all, so the
  // absence of a route has to be its own failure.
  it('catches a site that links nowhere', () => {
    const result = check([page('index.html'), page('start/getting-started/index.html')])
    expect(result.broken).toEqual([])
    expect(result.problems).toEqual([
      'the landing page offers no link into the playground',
      'no page other than the landing page links into the playground',
      'no page links to a specific playground example',
    ])
  })

  it('catches a site that reaches the playground but never a named example', () => {
    expect(check([LANDING, page('start/getting-started/index.html', '/texaryn/playground/')]).problems).toEqual([
      'no page links to a specific playground example',
    ])
  })

  it('does not let the playground satisfy the docs assertions on its own', () => {
    const result = check([
      page('index.html', '/texaryn/start/getting-started/'),
      page('playground/index.html', '/texaryn/playground/basics-object'),
    ])
    expect(result.problems).toEqual([
      'the landing page offers no link into the playground',
      'no page other than the landing page links into the playground',
      'no page links to a specific playground example',
    ])
  })

  it('fails an empty artifact rather than reporting nothing wrong', () => {
    expect(check([]).problems).toContain('no HTML pages found in the artifact')
  })

  it('leaves external links, fragments and assets alone', () => {
    const guide = page(
      'start/getting-started/index.html',
      '/texaryn/playground/',
      '/texaryn/playground/basics-object',
      'https://github.com/texaryn/texaryn',
      'mailto:someone@example.com',
      '#install',
    )
    expect(check([LANDING, guide]).broken).toEqual([])
  })
})

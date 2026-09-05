// `base` is the application mount. In development that is `/playground/`; on
// Pages it is `/texaryn/playground/`, because the docs site owns the root and
// the playground owns that subtree.
import { describe, it, expect } from 'vitest'
import { formatLocation, parseLocation } from '../routing.js'

const DEV = '/playground/'
const PAGES = '/texaryn/playground/'

describe('parseLocation', () => {
  it('reads the example from the path under the dev mount', () => {
    expect(parseLocation('/playground/basics-string', '', DEV)).toEqual({
      exampleId: 'basics-string',
      renderer: 'default',
    })
  })

  it('reads the example under the Pages mount', () => {
    expect(
      parseLocation('/texaryn/playground/conditional-if-then-else', '', PAGES),
    ).toEqual({ exampleId: 'conditional-if-then-else', renderer: 'default' })
  })

  it('reads the renderer from the query', () => {
    expect(parseLocation('/playground/basics-string', '?renderer=mui', DEV).renderer).toBe(
      'mui',
    )
  })

  it('has no example at the mount point itself', () => {
    expect(parseLocation('/playground/', '', DEV).exampleId).toBeNull()
    expect(parseLocation('/texaryn/playground/', '', PAGES).exampleId).toBeNull()
  })

  it('tolerates a base written without its trailing slash', () => {
    expect(parseLocation('/texaryn/playground/basics-string', '', '/texaryn/playground').exampleId).toBe(
      'basics-string',
    )
  })

  it('ignores a trailing slash on the example', () => {
    expect(parseLocation('/playground/basics-string/', '', DEV).exampleId).toBe('basics-string')
  })

  it('falls back for an unknown renderer rather than breaking', () => {
    expect(parseLocation('/playground/x', '?renderer=svelte', DEV).renderer).toBe('default')
    expect(parseLocation('/playground/x', '?renderer=', DEV).renderer).toBe('default')
  })

  // The parser knows nothing about the word "playground": the mount is
  // configuration, so an entirely different one has to work.
  it('works at any mount, including the origin root', () => {
    expect(parseLocation('/basics-string', '', '/').exampleId).toBe('basics-string')
    expect(parseLocation('/somewhere/else/basics-string', '', '/somewhere/else/').exampleId).toBe(
      'basics-string',
    )
  })
})

describe('formatLocation', () => {
  it('writes the example directly under the mount', () => {
    expect(formatLocation({ exampleId: 'basics-string', renderer: 'default' }, DEV)).toBe(
      '/playground/basics-string',
    )
    expect(formatLocation({ exampleId: 'basics-string', renderer: 'default' }, PAGES)).toBe(
      '/texaryn/playground/basics-string',
    )
  })

  it('leaves the default renderer out of the query', () => {
    expect(formatLocation({ exampleId: 'x', renderer: 'default' }, DEV)).not.toContain('renderer')
  })

  it('writes a chosen renderer into the query', () => {
    expect(formatLocation({ exampleId: 'x', renderer: 'mui' }, PAGES)).toBe(
      '/texaryn/playground/x?renderer=mui',
    )
  })

  it('returns the mount itself when nothing is selected', () => {
    expect(formatLocation({ exampleId: null, renderer: 'default' }, PAGES)).toBe(
      '/texaryn/playground/',
    )
  })

  it('round-trips every renderer at the Pages mount', () => {
    for (const renderer of ['default', 'bootstrap', 'mui'] as const) {
      const url = formatLocation({ exampleId: 'basics-string', renderer }, PAGES)
      const [path, search] = url.split('?')
      expect(parseLocation(path, search ? `?${search}` : '', PAGES)).toEqual({
        exampleId: 'basics-string',
        renderer,
      })
    }
  })

  it('round-trips an id needing encoding', () => {
    const url = formatLocation({ exampleId: 'a b', renderer: 'default' }, DEV)
    const [path, search] = url.split('?')
    expect(parseLocation(path, search ? `?${search}` : '', DEV).exampleId).toBe('a b')
  })
})

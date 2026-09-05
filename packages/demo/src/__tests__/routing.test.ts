import { describe, it, expect } from 'vitest'
import { formatLocation, parseLocation } from '../routing.js'

describe('parseLocation', () => {
  it('reads the example from the path', () => {
    expect(parseLocation('/playground/basics-string', '')).toEqual({
      exampleId: 'basics-string',
      renderer: 'default',
    })
  })

  it('reads the renderer from the query', () => {
    expect(parseLocation('/playground/basics-string', '?renderer=mui').renderer).toBe('mui')
  })

  it('has no example at the root', () => {
    expect(parseLocation('/', '').exampleId).toBeNull()
  })

  // Pages serves the app from /texaryn/, so the base has to come off before
  // the path means anything.
  it('strips a non-root base', () => {
    expect(parseLocation('/texaryn/playground/conditional-if-then-else', '', '/texaryn/')).toEqual(
      { exampleId: 'conditional-if-then-else', renderer: 'default' },
    )
  })

  it('has no example at a non-root base itself', () => {
    expect(parseLocation('/texaryn/', '', '/texaryn/').exampleId).toBeNull()
  })

  it('tolerates a base written without its trailing slash', () => {
    expect(parseLocation('/texaryn/playground/basics-string', '', '/texaryn').exampleId).toBe(
      'basics-string',
    )
  })

  it('ignores a trailing slash on the example', () => {
    expect(parseLocation('/playground/basics-string/', '').exampleId).toBe('basics-string')
  })

  it('falls back for an unknown renderer rather than breaking', () => {
    expect(parseLocation('/playground/basics-string', '?renderer=svelte').renderer).toBe('default')
    expect(parseLocation('/playground/basics-string', '?renderer=').renderer).toBe('default')
  })

  it('round-trips an id needing encoding', () => {
    const url = formatLocation({ exampleId: 'a/b', renderer: 'default' })
    const [path, search] = url.split('?')
    expect(parseLocation(path, search ? `?${search}` : '').exampleId).toBe('a/b')
  })
})

describe('formatLocation', () => {
  it('writes the example into the path', () => {
    expect(formatLocation({ exampleId: 'basics-string', renderer: 'default' })).toBe(
      '/playground/basics-string',
    )
  })

  it('leaves the default renderer out of the query', () => {
    expect(formatLocation({ exampleId: 'x', renderer: 'default' })).not.toContain('renderer')
  })

  it('writes a chosen renderer into the query', () => {
    expect(formatLocation({ exampleId: 'x', renderer: 'mui' })).toBe('/playground/x?renderer=mui')
  })

  it('honours a non-root base', () => {
    expect(formatLocation({ exampleId: 'x', renderer: 'bootstrap' }, '/texaryn/')).toBe(
      '/texaryn/playground/x?renderer=bootstrap',
    )
  })

  it('returns the base itself when nothing is selected', () => {
    expect(formatLocation({ exampleId: null, renderer: 'default' }, '/texaryn/')).toBe('/texaryn/')
  })

  it('round-trips every renderer', () => {
    for (const renderer of ['default', 'bootstrap', 'mui'] as const) {
      const url = formatLocation({ exampleId: 'basics-string', renderer }, '/texaryn/')
      const [path, search] = url.split('?')
      expect(parseLocation(path, search ? `?${search}` : '', '/texaryn/')).toEqual({
        exampleId: 'basics-string',
        renderer,
      })
    }
  })
})

import { describe, it, expect } from 'vitest'
import { createJsonSchemaAdapter } from '../index.js'
import { loadMetaschemas, referencedDialects } from '../metaschemas/index.js'
import type { Dialect } from '../dialect.js'

const dialects: Dialect[] = ['draft-07', '2019-09', '2020-12']

describe('metaschema documents', () => {
  // The vendored files are generated copies of published documents, and the
  // registry keys on $id. A copy or rename error would otherwise surface as a
  // mysterious resolution failure somewhere else.
  it.each(dialects)('registers %s under an $id matching its own document', async (dialect) => {
    const documents = await loadMetaschemas([dialect])
    expect(documents.length).toBeGreaterThan(0)
    for (const document of documents) {
      const id = (document as { $id?: unknown }).$id
      expect(typeof id, `a vendored document has no $id: ${JSON.stringify(document).slice(0, 80)}`).toBe(
        'string',
      )
      // Normalised at the boundary, so no document should carry a bare fragment.
      expect(id as string).not.toMatch(/#$/)
      expect(id as string).toMatch(/^https?:\/\/json-schema\.org\//)
    }
  })

  it('carries the closure each dialect needs', async () => {
    expect((await loadMetaschemas(['draft-07'])).length).toBe(1)
    expect((await loadMetaschemas(['2019-09'])).length).toBe(7)
    expect((await loadMetaschemas(['2020-12'])).length).toBe(8)
  })

  it('gives every caller its own copy, because the validator mutates them', async () => {
    const first = await loadMetaschemas(['2020-12'])
    const second = await loadMetaschemas(['2020-12'])
    expect(first[0]).not.toBe(second[0])
  })

  // The invariant, rather than the upstream quirk that motivated it: the
  // documents cross the dependency boundary as copies, so compiling cannot
  // leave the vendored data altered for whoever compiles next. compileSchema
  // normalises `$id` in place, and sharing a module-level array would mean the
  // first caller silently repairs the input for everyone after it, which is
  // exactly what once hid a resolution bug.
  // Asserted against the vendored module rather than the loader's output, and
  // on Draft 7 rather than a later dialect, because those are the conditions
  // under which the mutation is observable at all: only Draft 7 publishes a
  // fragment for compileSchema to strip. On 2020-12 the same test would pass
  // whether or not the boundary copied anything.
  it('leaves the vendored document untouched when a compile consumes it', async () => {
    const { metaschemas } = await import('../metaschemas/draft-07.js')
    const published = 'http://json-schema.org/draft-07/schema#'
    expect((metaschemas[0] as { $id?: string }).$id).toBe(published)

    const adapter = await createJsonSchemaAdapter(
      { $ref: published },
      { defaultDialect: 'draft-07' },
    )
    expect((await adapter.validate({ type: 'integer' })).valid).toBe(true)

    expect((metaschemas[0] as { $id?: string }).$id).toBe(published)
  })

  // Draft 7 publishes `$id` ending in `#` and the registry keys on that string
  // while a reference resolves with the fragment stripped, so this used to
  // depend on where the document sat: it resolved at index 13 of a
  // 16-document array and failed at index 0. Normalising on the way in makes
  // position irrelevant, and both positions are asserted so it stays that way.
  it('resolves draft-07 wherever it sits in the closure', async () => {
    const alone = await loadMetaschemas(['draft-07'])
    expect((alone[0] as { $id?: string }).$id).toBe('http://json-schema.org/draft-07/schema')

    const first = await loadMetaschemas(['draft-07', '2020-12'])
    const last = await loadMetaschemas(['2020-12', 'draft-07'])
    expect((first[0] as { $id?: string }).$id).toBe('http://json-schema.org/draft-07/schema')
    expect((last[last.length - 1] as { $id?: string }).$id).toBe(
      'http://json-schema.org/draft-07/schema',
    )

    // And through the public surface, where draft-07 is the only document.
    const adapter = await createJsonSchemaAdapter(
      { $ref: 'http://json-schema.org/draft-07/schema#' },
      { defaultDialect: 'draft-07' },
    )
    expect((await adapter.validate({ type: 'integer' })).valid).toBe(true)
    expect((await adapter.validate({ type: 1 })).valid).toBe(false)
  })
})

describe('referencedDialects', () => {
  it('ignores $schema, which every schema declares', () => {
    expect(
      referencedDialects({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'string' }),
    ).toEqual([])
  })

  it('finds a reference nested in a subschema', () => {
    expect(
      referencedDialects({
        type: 'object',
        properties: { a: { items: [{ $ref: 'http://json-schema.org/draft-07/schema#' }] } },
      }),
    ).toEqual(['draft-07'])
  })

  it('reports the referenced dialect, not the declared one', () => {
    expect(
      referencedDialects({
        $schema: 'http://json-schema.org/draft-07/schema#',
        $ref: 'https://json-schema.org/draft/2020-12/schema',
      }),
    ).toEqual(['2020-12'])
  })

  it('finds every dialect a schema reaches for', () => {
    const found = referencedDialects({
      allOf: [
        { $ref: 'https://json-schema.org/draft/2019-09/meta/core' },
        { $ref: 'https://json-schema.org/draft/2020-12/schema' },
      ],
    })
    expect([...found].sort()).toEqual(['2019-09', '2020-12'])
  })

  it('ignores references to anything else', () => {
    expect(referencedDialects({ $ref: 'https://example.com/schema.json' })).toEqual([])
    expect(referencedDialects({ $ref: '#/$defs/foo' })).toEqual([])
  })

  it('survives a cyclic schema object', () => {
    const schema: Record<string, unknown> = { type: 'object' }
    schema.self = schema
    expect(() => referencedDialects(schema)).not.toThrow()
  })
})

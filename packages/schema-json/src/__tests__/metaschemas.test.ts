import { describe, it, expect } from 'vitest'
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

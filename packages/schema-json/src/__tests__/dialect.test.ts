import { describe, it, expect } from 'vitest'
import { detectDialect } from '../dialect.js'

describe('detectDialect', () => {
  it('detects draft-07 from $schema', () => {
    expect(
      detectDialect(
        { $schema: 'http://json-schema.org/draft-07/schema#' },
        { defaultDialect: '2020-12' },
      ),
    ).toBe('draft-07')
  })

  it('detects 2020-12 from $schema', () => {
    expect(
      detectDialect(
        { $schema: 'https://json-schema.org/draft/2020-12/schema' },
        { defaultDialect: 'draft-07' },
      ),
    ).toBe('2020-12')
  })

  it('detects 2019-09 from $schema', () => {
    expect(
      detectDialect(
        { $schema: 'https://json-schema.org/draft/2019-09/schema' },
        { defaultDialect: 'draft-07' },
      ),
    ).toBe('2019-09')
  })

  it('returns defaultDialect when $schema is absent', () => {
    expect(detectDialect({ type: 'object' }, { defaultDialect: 'draft-07' })).toBe('draft-07')
  })

  it('returns defaultDialect for non-object schemas', () => {
    expect(detectDialect(true, { defaultDialect: '2020-12' })).toBe('2020-12')
  })
})

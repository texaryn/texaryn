import { describe, expect, it } from 'vitest'
import { createHyperjumpAdapter } from '../index.js'

async function project(schema: unknown) {
  const adapter = await createHyperjumpAdapter(schema)
  return adapter.project({})
}

describe('$ref sibling defaults', () => {
  it('ignores a $ref sibling default in draft-07', async () => {
    const projection = await project({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: { child: { $ref: '#/definitions/base', default: 'site' } },
      definitions: { base: { type: 'string', default: 'target' } },
    })

    const child = projection.nodes.get('/child' as never)!
    expect(child.annotations.default).toBe('target')
    expect(child.defaultConflict).toBeUndefined()
  })

  it('does not apply a Draft 7 sibling default without a target default', async () => {
    const projection = await project({
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: { child: { $ref: '#/definitions/base', default: 'site' } },
      definitions: { base: { type: 'string' } },
    })

    expect(projection.nodes.get('/child' as never)?.annotations.default).toBeUndefined()
  })

  it.each([
    ['2019-09', 'https://json-schema.org/draft/2019-09/schema'],
    ['2020-12', 'https://json-schema.org/draft/2020-12/schema'],
  ])('applies a %s sibling default when the target has none', async (_name, $schema) => {
    const projection = await project({
      $schema,
      type: 'object',
      properties: { child: { $ref: '#/$defs/base', default: 'site' } },
      $defs: { base: { type: 'string' } },
    })

    const child = projection.nodes.get('/child' as never)!
    expect(child.annotations.default).toBe('site')
    expect(child.defaultConflict).toBeUndefined()
  })

  it.each([
    ['draft-07', 'http://json-schema.org/draft-07/schema#', 'definitions', 'B', undefined],
    [
      '2019-09',
      'https://json-schema.org/draft/2019-09/schema',
      '$defs',
      undefined,
      ['/$defs/a', '/$defs/b'],
    ],
    [
      '2020-12',
      'https://json-schema.org/draft/2020-12/schema',
      '$defs',
      undefined,
      ['/$defs/a', '/$defs/b'],
    ],
  ] as const)('collects defaults through a reference chain in %s', async (
    _name,
    $schema,
    defsKeyword,
    expectedDefault,
    expectedConflict,
  ) => {
    const projection = await project({
      $schema,
      type: 'object',
      properties: { child: { $ref: `#/${defsKeyword}/a` } },
      [defsKeyword]: {
        a: { $ref: `#/${defsKeyword}/b`, type: 'string', default: 'A', minLength: 2 },
        b: { type: 'string', default: 'B' },
      },
    })

    const child = projection.nodes.get('/child' as never)!
    expect(child.annotations.default).toBe(expectedDefault)
    if (expectedConflict) {
      expect(child.defaultConflict).toEqual(expect.arrayContaining([...expectedConflict]))
    } else {
      expect(child.defaultConflict).toBeUndefined()
    }
  })

  it.each([
    ['2019-09', 'https://json-schema.org/draft/2019-09/schema'],
    ['2020-12', 'https://json-schema.org/draft/2020-12/schema'],
  ])('uses a %s sibling default and reports disagreement with its target', async (_name, $schema) => {
    const projection = await project({
      $schema,
      type: 'object',
      properties: { child: { $ref: '#/$defs/base', default: 'site' } },
      $defs: { base: { type: 'string', default: 'target' } },
    })

    const child = projection.nodes.get('/child' as never)!
    expect(child.annotations.default).toBeUndefined()
    expect(child.defaultConflict).toEqual(expect.arrayContaining(['/properties/child', '/$defs/base']))
  })

  it.each([
    ['2019-09', 'https://json-schema.org/draft/2019-09/schema'],
    ['2020-12', 'https://json-schema.org/draft/2020-12/schema'],
  ])('keeps a default beside a self-reference in %s', async (_name, $schema) => {
    const projection = await project({
      $schema,
      type: 'object',
      properties: { child: { $ref: '#', default: { name: 'site' } } },
    })

    expect(projection.nodes.get('/child' as never)?.annotations.default).toEqual({ name: 'site' })
  })

  it('reports decoded source positions for an encoded reference to a recursive definition', async () => {
    const projection = await project({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { child: { $ref: '#/definitions/Tree%20Node', default: {} } },
      definitions: {
        'Tree Node': {
          type: 'object',
          default: {},
          properties: { child: { $ref: '#/definitions/Tree%20Node' } },
        },
      },
    })

    expect(projection.nodes.get('/child' as never)?.defaultSources).toEqual([
      '/definitions/Tree Node',
      '/properties/child',
    ])
  })
})

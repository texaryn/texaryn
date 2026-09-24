import { describe, it, expect } from 'vitest'
import type { ProjectionBoundary, SchemaEvaluationPort, SchemaProjection } from '@texaryn/core'

type AdapterFactory = (schema: Record<string, unknown>) => Promise<SchemaEvaluationPort>

const DIALECTS = {
  'draft-07': 'http://json-schema.org/draft-07/schema#',
  '2019-09': 'https://json-schema.org/draft/2019-09/schema',
  '2020-12': 'https://json-schema.org/draft/2020-12/schema',
} as const
type Dialect = keyof typeof DIALECTS
const PROJECTED: readonly Dialect[] = ['draft-07', '2020-12']

const inDialect = (dialect: Dialect, schema: Record<string, unknown>) => ({
  $schema: DIALECTS[dialect],
  ...schema,
})

interface Fixture {
  id: string
  schema: () => Record<string, unknown>
  data: readonly unknown[]
  /** Reaches a schema through an `$id` resource rather than a `#` fragment. */
  nonLocal?: true
}

const S = { type: 'string' }
const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties })
const R = (name: string) => ({ $ref: `#/$defs/${name}` })
const tree = () => obj({ name: S, child: { $ref: '#' } })
const arr = () => obj({ name: S, children: { type: 'array', items: { $ref: '#' } } })
const treeData = [{}, { child: {} }, { child: { child: {} } }]
const pairSite = (title: boolean) => ({
  $ref: '#/definitions/node',
  ...(title ? { title: 'ignored in draft-07' } : {}),
})
const range = (length: number) => Array.from({ length }, (_, i) => i)
const kdistinct = (k: number) => {
  const refs = () => Object.fromEntries(range(k).map((j) => [`p${j}`, R(`d${j}`)]))
  return {
    ...obj(refs()),
    $defs: Object.fromEntries(range(k).map((i) => [`d${i}`, obj({ [`v${i}`]: S, ...refs() })])),
  }
}
const wide = (leaves: number) => () => ({
  ...obj({ a: R('A') }),
  $defs: {
    A: obj({ b: R('B') }),
    B: obj({ a: R('A'), ...Object.fromEntries(range(leaves).map((i) => [`s${i}`, S])) }),
  },
})

const fixtures: readonly Fixture[] = [
  { id: 'tree-no-id', schema: tree, data: treeData },
  { id: 'tree-with-id', schema: () => ({ $id: 'https://example.com/tree', ...tree() }), data: treeData },
  {
    id: 'defs-node',
    schema: () => ({
      ...obj({ name: S, child: { $ref: '#/$defs/node' } }),
      $defs: { node: obj({ name: S, child: { $ref: '#/$defs/node' } }) },
    }),
    data: treeData,
  },
  {
    id: 'definitions-node',
    schema: () => ({
      ...obj({ name: S, child: { $ref: '#/definitions/node' } }),
      definitions: { node: obj({ name: S, child: { $ref: '#/definitions/node' } }) },
    }),
    data: treeData,
  },
  {
    id: 'mutual-a-b',
    schema: () => ({
      ...obj({ a: R('a') }),
      $defs: { a: obj({ av: S, b: R('b') }), b: obj({ bv: S, a: R('a') }) },
    }),
    data: [{}, { a: {} }, { a: { b: {} } }],
  },
  {
    id: 'allOf-typed',
    schema: () => obj({ name: S, child: { type: 'object', allOf: [{ $ref: '#' }] } }),
    data: treeData,
  },
  {
    id: 'if-then',
    schema: () => obj({ name: S, child: { type: 'object', if: { type: 'object' }, then: { $ref: '#' } } }),
    data: treeData,
  },
  {
    id: 'oneOf-null',
    schema: () => obj({ name: S, child: { oneOf: [{ $ref: '#' }, { type: 'null' }] } }),
    data: treeData,
  },
  { id: 'array-items', schema: arr, data: [{}, { children: [{}] }, { children: [{ children: [{}] }] }] },
  {
    id: 'null-child',
    schema: tree,
    data: [{ child: null }, { child: { child: null } }, { child: { child: { child: null } } }],
  },
  {
    id: 'insert-null-row',
    schema: arr,
    data: [
      { children: [null] },
      { children: [{ children: [null] }] },
      { children: [{ children: [{ children: [null] }] }] },
    ],
  },
  {
    id: 'diamond',
    schema: () => ({
      ...obj({ a: R('A') }),
      $defs: { A: obj({ l: R('B'), r: R('C') }), B: obj({ d: R('D') }), C: obj({ d: R('D') }), D: obj({ leaf: S }) },
    }),
    data: [{}, { a: {} }, { a: { l: {} } }],
  },
  {
    id: 'two-cycles-shared-vertex',
    schema: () => ({
      ...obj({ a: R('A') }),
      $defs: { A: obj({ v: S, b: R('B'), c: R('C') }), B: obj({ a: R('A') }), C: obj({ a: R('A') }) },
    }),
    data: [{}, { a: {} }, { a: { b: {} } }],
  },
  {
    id: 'a-b-c-b',
    schema: () => ({
      ...obj({ a: R('A') }),
      $defs: { A: obj({ b: R('B') }), B: obj({ c: R('C') }), C: obj({ b: R('B') }) },
    }),
    data: [{}, { a: {} }, { a: { b: {} } }],
  },
  {
    id: 'two-independent-recursive',
    schema: () => ({
      ...obj({ left: R('L'), right: R('Q') }),
      $defs: { L: obj({ name: S, next: R('L') }), Q: obj({ name: S, next: R('Q') }) },
    }),
    data: [{}, { left: {} }, { left: { next: {} }, right: {} }],
  },
  {
    id: 'both-branches-recursive',
    schema: () =>
      obj({ name: S, child: { type: 'object', if: { required: ['x'] }, then: { $ref: '#' }, else: { $ref: '#' } } }),
    data: treeData,
  },
  {
    id: 'eq-inactive-then',
    schema: () => obj({ p: { type: 'object', if: { required: ['x'] }, then: { properties: { q: { type: 'object' } } } } }),
    data: [{}, { p: {} }, { p: { x: 1 } }],
  },
  {
    id: 'eq-id-resources',
    nonLocal: true,
    schema: () => ({
      ...obj({ start: { $ref: 'http://x.test/a/root.json' } }),
      $defs: {
        A: { $id: 'http://x.test/a/root.json', ...obj({ next: { $ref: 'next.json' } }) },
        An: { $id: 'http://x.test/a/next.json', ...obj({ next: { $ref: '../b/root.json' } }) },
        B: { $id: 'http://x.test/b/root.json', ...obj({ next: { $ref: 'next.json' } }) },
        Bn: { $id: 'http://x.test/b/next.json', ...obj({ leaf: S }) },
      },
    }),
    data: [{}, { start: {} }, { start: { next: {} } }],
  },
  {
    id: 'eq-two-oneOf-wrappers',
    schema: () => ({
      ...obj({ a: { oneOf: [{ $ref: '#/definitions/A' }, { type: 'null' }] } }),
      definitions: {
        A: obj({ b: { oneOf: [{ $ref: '#/definitions/B' }, { type: 'null' }] } }),
        B: obj({ leaf: S }),
      },
    }),
    data: [{}, { a: {} }, { a: { b: {} } }],
  },
  {
    id: 'ref-site-title',
    schema: () => ({
      ...obj({ child: { $ref: '#/$defs/node', title: 'Top' } }),
      $defs: { node: obj({ name: S, child: { $ref: '#/$defs/node', title: 'Sub' } }) },
    }),
    data: treeData,
  },
  {
    id: 'id-boundary-in-defs',
    nonLocal: true,
    schema: () => ({
      ...obj({ n: { $ref: 'https://example.com/node' } }),
      $defs: { node: { $id: 'https://example.com/node', ...obj({ v: S, next: { $ref: '#' } }) } },
    }),
    data: [{}, { n: {} }, { n: { next: {} } }],
  },
  {
    id: 'chain-alias-node',
    schema: () => ({
      ...obj({ child: R('alias') }),
      $defs: { alias: R('node'), node: obj({ name: S, child: R('alias') }) },
    }),
    data: treeData,
  },
  {
    id: 'chain-a-b-acyclic',
    schema: () => ({ ...obj({ p: R('a') }), $defs: { a: R('b'), b: obj({ leaf: S }) } }),
    data: [{}],
  },
  {
    id: 'pair-plain',
    schema: () => ({ ...obj({ child: pairSite(false) }), definitions: { node: obj({ name: S, child: pairSite(false) }) } }),
    data: treeData,
  },
  {
    id: 'pair-title',
    schema: () => ({ ...obj({ child: pairSite(true) }), definitions: { node: obj({ name: S, child: pairSite(true) }) } }),
    data: treeData,
  },
  {
    id: 'allOf-closure',
    schema: () => ({
      ...obj({ a: { type: 'object', allOf: [R('T')] } }),
      $defs: { T: obj({ v: { type: 'string', default: 'd' }, next: R('T') }) },
    }),
    data: [{}, { a: {} }, { a: { next: {} } }],
  },
  { id: 'kdistinct-6', schema: () => kdistinct(6), data: [{}] },
  { id: 'wide-511', schema: wide(511), data: [{}] },
  { id: 'wide-512', schema: wide(512), data: [{}] },
]

interface Expected {
  pointers: readonly string[]
  boundaries: Readonly<Record<string, readonly ProjectionBoundary[]>>
  expansion: readonly string[]
}

const treeLevels: readonly Expected[] = [
  {
    pointers: ['', '/child', '/child/name', '/name'],
    boundaries: { '/child': ['recursion'] },
    expansion: ['/child/name'],
  },
  {
    pointers: ['', '/child', '/child/child', '/child/child/name', '/child/name', '/name'],
    boundaries: { '/child/child': ['recursion'] },
    expansion: ['/child/child/name'],
  },
  {
    pointers: ['', '/child', '/child/child', '/child/child/child', '/child/child/child/name', '/child/child/name', '/child/name', '/name'],
    boundaries: { '/child/child/child': ['recursion'] },
    expansion: ['/child/child/child/name'],
  },
]

const rowLevels: readonly Expected[] = [
  ['', '/children', '/children/0', '/children/0/children', '/children/0/name', '/name'],
  [
    '', '/children', '/children/0', '/children/0/children', '/children/0/children/0',
    '/children/0/children/0/children', '/children/0/children/0/name', '/children/0/name', '/name',
  ],
  [
    '', '/children', '/children/0', '/children/0/children', '/children/0/children/0',
    '/children/0/children/0/children', '/children/0/children/0/children/0',
    '/children/0/children/0/children/0/children', '/children/0/children/0/children/0/name',
    '/children/0/children/0/name', '/children/0/name', '/name',
  ],
].map((pointers) => ({ pointers, boundaries: {}, expansion: [] }))

const k6: Expected = (() => {
  const six = range(6)
  const admitted = six.flatMap((i) => six.filter((j) => j !== i).map((j) => [i, j] as const)).slice(0, 16)
  const objects = admitted.map(([i, j]) => `/p${i}/p${j}`)
  const leaves = [...six.map((i) => `/p${i}/v${i}`), ...admitted.map(([i, j]) => `/p${i}/p${j}/v${j}`)]
  const both: readonly ProjectionBoundary[] = ['recursion', 'budget']
  const withheld = (i: number) => admitted.filter(([a]) => a === i).length < 5
  return {
    pointers: ['', ...six.map((i) => `/p${i}`), ...objects, ...leaves].sort(),
    boundaries: Object.fromEntries([
      ...six.map((i) => [`/p${i}`, withheld(i) ? both : ['recursion' as const]]),
      ...objects.map((pointer) => [pointer, both]),
    ]),
    expansion: [...objects, ...leaves].sort(),
  }
})()

const wideLeaves = range(511).map((i) => `/a/b/s${i}`)

const pairLevels = treeLevels.map((level) => ({ ...level, pointers: level.pointers.filter((p) => p !== '/name') }))
const titleLevels: readonly Expected[] = [
  {
    pointers: ['', '/child', '/child/child', '/child/child/name', '/child/name'],
    boundaries: { '/child/child': ['recursion'] },
    expansion: ['/child/child', '/child/child/name', '/child/name'],
  },
  ...pairLevels.slice(1),
]

const exact: Readonly<Record<string, readonly Expected[]>> = {
  'tree-no-id': treeLevels,
  'tree-with-id': treeLevels,
  'defs-node': treeLevels,
  'definitions-node': treeLevels,
  'null-child': treeLevels,
  'mutual-a-b': [
    {
      pointers: ['', '/a', '/a/av', '/a/b', '/a/b/bv'],
      boundaries: { '/a': ['recursion'] },
      expansion: ['/a/av', '/a/b', '/a/b/bv'],
    },
    {
      pointers: ['', '/a', '/a/av', '/a/b', '/a/b/a', '/a/b/a/av', '/a/b/bv'],
      boundaries: { '/a/b': ['recursion'] },
      expansion: ['/a/b/a', '/a/b/a/av', '/a/b/bv'],
    },
    {
      pointers: ['', '/a', '/a/av', '/a/b', '/a/b/a', '/a/b/a/av', '/a/b/a/b', '/a/b/a/b/bv', '/a/b/bv'],
      boundaries: { '/a/b/a': ['recursion'] },
      expansion: ['/a/b/a/av', '/a/b/a/b', '/a/b/a/b/bv'],
    },
  ],
  'array-items': [
    { pointers: ['', '/children', '/name'], boundaries: {}, expansion: [] },
    ...rowLevels.slice(0, 2),
  ],
  'insert-null-row': rowLevels,
  'allOf-closure': [
    {
      pointers: ['', '/a', '/a/next', '/a/next/v', '/a/v'],
      boundaries: { '/a/next': ['recursion'] },
      expansion: ['/a/next', '/a/next/v', '/a/v'],
    },
    {
      pointers: ['', '/a', '/a/next', '/a/next/v', '/a/v'],
      boundaries: { '/a/next': ['recursion'] },
      expansion: ['/a/next/v'],
    },
    {
      pointers: ['', '/a', '/a/next', '/a/next/next', '/a/next/next/v', '/a/next/v', '/a/v'],
      boundaries: { '/a/next/next': ['recursion'] },
      expansion: ['/a/next/next/v'],
    },
  ],
  'kdistinct-6': [k6],
  'wide-511': [
    {
      pointers: ['', '/a', '/a/b', ...wideLeaves].sort(),
      boundaries: { '/a': ['recursion'] },
      expansion: ['/a/b', ...wideLeaves].sort(),
    },
  ],
  'wide-512': [{ pointers: ['', '/a'], boundaries: { '/a': ['budget'] }, expansion: [] }],
  'pair-plain': pairLevels,
  'pair-title draft-07': pairLevels,
  'pair-title 2020-12': titleLevels,
  'ref-site-title draft-07': pairLevels,
  'ref-site-title 2020-12': titleLevels,
}

const expectedFor = (id: string, dialect: Dialect) => exact[`${id} ${dialect}`] ?? exact[id]

const summarize = (projection: SchemaProjection) => {
  const nodes = [...projection.nodes]
  return {
    pointers: nodes.map(([pointer]) => pointer).sort(),
    boundaries: Object.fromEntries(nodes.filter(([, n]) => n.boundaries).map(([p, n]) => [p, n.boundaries])),
    expansion: nodes.filter(([, n]) => n.recursiveExpansion).map(([pointer]) => pointer).sort(),
  }
}

const valueAt = (data: unknown, pointer: string): unknown => {
  let current = data
  for (const segment of pointer.split('/').slice(1)) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[segment.replace(/~1/g, '/').replace(/~0/g, '~')]
  }
  return current
}

const BOUNDARY_ORDER: readonly ProjectionBoundary[] = ['recursion', 'budget']

function violations(projection: SchemaProjection, data: unknown): string[] {
  const found: string[] = []
  for (const [pointer, node] of projection.nodes) {
    for (const child of node.children ?? []) {
      if (!projection.nodes.has(child.pointer)) found.push(`${pointer} lists ${child.pointer} without a node`)
    }
    if (node.boundaries !== undefined) {
      if (node.type !== 'object') found.push(`${pointer} is ${node.type} and carries boundaries`)
      const ordered = BOUNDARY_ORDER.filter((reason) => node.boundaries!.includes(reason))
      if (node.boundaries.length === 0 || JSON.stringify(ordered) !== JSON.stringify(node.boundaries)) {
        found.push(`${pointer} boundaries ${JSON.stringify(node.boundaries)}`)
      }
    }
    if (node.recursiveExpansion !== undefined && node.recursiveExpansion !== true) {
      found.push(`${pointer} recursiveExpansion ${String(node.recursiveExpansion)}`)
    }
    const value = valueAt(data, pointer)
    if (node.recursiveExpansion && value !== undefined && value !== null) {
      found.push(`${pointer} holds data and is a recursive expansion`)
    }
    if ('default' in node.annotations !== (node.defaultSources !== undefined)) {
      found.push(`${pointer} default and defaultSources disagree on presence`)
    }
  }
  return found
}

const cases = (list: readonly Fixture[]) =>
  PROJECTED.flatMap((dialect) =>
    list.flatMap((fixture) => fixture.data.map((data, depth) => ({ fixture, dialect, data, depth }))),
  )

const cycles: readonly [string, Record<string, unknown>, readonly (readonly string[])[]][] = [
  [
    'a pure $ref cycle',
    { properties: { p: R('a') }, $defs: { a: R('b'), b: R('a') } },
    [['#/$defs/a', '#/$defs/b']],
  ],
  ['root allOf', { allOf: [{ $ref: '#' }] }, [['#', '#/allOf/0']]],
  ['root anyOf', { anyOf: [{ $ref: '#' }] }, [['#', '#/anyOf/0']]],
  [
    'a conditional self-application',
    { ...obj({ flag: { type: 'boolean' } }), allOf: [{ if: obj({ flag: { const: true } }), then: { $ref: '#' } }] },
    [['#', '#/allOf/0', '#/allOf/0/then']],
  ],
  [
    'a conditional self-application under an $id',
    {
      $id: 'https://example.com/loop',
      ...obj({ flag: { type: 'boolean' } }),
      allOf: [{ if: obj({ flag: { const: true } }), then: { $ref: '#' } }],
    },
    [['#', '#/allOf/0', '#/allOf/0/then']],
  ],
  ['a typed root allOf', { ...obj({ name: S }), allOf: [{ $ref: '#' }] }, [['#', '#/allOf/0']]],
  ['root not', { not: { $ref: '#' } }, [['#', '#/not']]],
  ['root oneOf', { oneOf: [{ $ref: '#' }] }, [['#', '#/oneOf/0']]],
  ['root if', { if: { $ref: '#' } }, [['#', '#/if']]],
  ['root else', { if: { required: ['x'] }, else: { $ref: '#' } }, [['#', '#/else']]],
  ['if true applying then', { if: true, then: { $ref: '#' } }, [['#', '#/then']]],
  ['if false applying else', { if: false, else: { $ref: '#' } }, [['#', '#/else']]],
]

const constructing: readonly [string, Record<string, unknown>][] = [
  ['recursion through a property', obj({ next: { $ref: '#' } })],
  [
    'a conditional that recurses through a property',
    { type: 'object', if: { required: ['x'] }, then: { properties: { next: { $ref: '#' } } } },
  ],
  ['if false', { if: false, then: { $ref: '#' } }],
  ['if true', { if: true, else: { $ref: '#' } }],
  ['then without if', { then: { $ref: '#' } }],
  ['else without if', { else: { $ref: '#' } }],
]

const mapCycles: readonly (readonly [Dialect, string, Record<string, unknown>, readonly (readonly string[])[]])[] = [
  ['2019-09', 'dependentSchemas', { dependentSchemas: { a: { $ref: '#' } } }, [['#', '#/dependentSchemas/a']]],
  ['2020-12', 'dependentSchemas', { dependentSchemas: { a: { $ref: '#' } } }, [['#', '#/dependentSchemas/a']]],
  ...(['draft-07', '2019-09', '2020-12'] as const).map(
    (dialect) =>
      [dialect, 'dependencies', { dependencies: { a: { $ref: '#' } } }, [['#', '#/dependencies/a']]] as const,
  ),
]

const dialectConstructing: readonly (readonly [Dialect, string, Record<string, unknown>])[] = [
  ['draft-07', '$dynamicRef', { $dynamicRef: '#' }],
  ['2020-12', '$recursiveRef', { $recursiveRef: '#' }],
  ['draft-07', 'dependentSchemas', { dependentSchemas: { a: { $ref: '#' } } }],
]

const dialectCycles: readonly (readonly [Dialect, string, Record<string, unknown>, readonly (readonly string[])[]])[] = [
  ['2019-09', '$recursiveRef', { $recursiveRef: '#' }, [['#']]],
  ['2020-12', '$dynamicRef', { $dynamicRef: '#' }, [['#']]],
  [
    '2019-09',
    '$recursiveRef to a $recursiveAnchor',
    {
      $id: 'https://x.test/root',
      $recursiveAnchor: true,
      type: 'object',
      allOf: [{ $ref: 'inner#/$defs/s' }],
      $defs: { inner: { $id: 'https://x.test/inner', $recursiveAnchor: true, $defs: { s: { allOf: [{ $recursiveRef: '#' }] } } } },
    },
    [['#', '#/$defs/inner/$defs/s', '#/$defs/inner/$defs/s/allOf/0', '#/allOf/0']],
  ],
]

const expectCycle = async (created: Promise<unknown>, positions: readonly (readonly string[])[]) => {
  const error = await created.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toMatchObject({ name: 'SameLocationCycleError', positions })
  expect((error as Error).message).toContain(`Schema position "${positions[0]![0]}" applies itself`)
}

/**
 * ADR-007 as a port contract: a recursive schema expands once past the data,
 * and a schema that applies itself at one location is rejected at creation.
 */
export function recursiveRefSuite(
  name: string,
  createAdapter: AdapterFactory,
  options: { localReferencesOnly?: boolean } = {},
): void {
  const own = fixtures.filter((fixture) => !(options.localReferencesOnly && fixture.nonLocal))

  describe(`${name}: recursive projection`, () => {
    it.each(cases(own))('$fixture.id in $dialect at $data keeps the projection whole', async ({ fixture, dialect, data }) => {
      const port = await createAdapter(inDialect(dialect, fixture.schema()))
      expect(violations(port.project(structuredClone(data)), data)).toEqual([])
    })

    it.each(cases(own).filter(({ fixture, dialect }) => expectedFor(fixture.id, dialect)))(
      '$fixture.id in $dialect at $data projects once past the data',
      async ({ fixture, dialect, data, depth }) => {
        const port = await createAdapter(inDialect(dialect, fixture.schema()))
        expect(summarize(port.project(structuredClone(data)))).toEqual(expectedFor(fixture.id, dialect)![depth])
      },
    )
  })

  describe(`${name}: same-location cycles`, () => {
    describe.each(PROJECTED)('%s', (dialect) => {
      it.each(cycles)('rejects %s at creation', async (_label, schema, positions) => {
        await expectCycle(createAdapter(inDialect(dialect, schema)), positions)
      })

      it.each(constructing)('constructs %s', async (_label, schema) => {
        const port = await createAdapter(inDialect(dialect, schema))
        expect((await port.validate({})).valid).toBe(true)
      })
    })

    it.each(mapCycles)('rejects a %s self-reference through %s', async (dialect, _keyword, schema, positions) => {
      await expectCycle(createAdapter(inDialect(dialect, schema)), positions)
    })

    it.each(dialectConstructing)('%s constructs through %s, a keyword of another dialect', async (dialect, _keyword, schema) => {
      const port = await createAdapter(inDialect(dialect, schema))
      expect((await port.validate({ a: 1 })).valid).toBe(true)
    })

    it.each(dialectCycles)('%s rejects a self-reference through its own %s', async (dialect, _keyword, schema, positions) => {
      await expectCycle(createAdapter(inDialect(dialect, schema)), positions)
    })
  })
}

/**
 * Pre-existing `active` differences, by case, with the pointers that differ.
 * Follow-up: the design spec's out-of-scope item on `active` beneath wrapped
 * recursion (`allOf`, `if`/`then`/`else`, draft-07 `oneOf`), which main shares.
 */
const KNOWN_ACTIVE_DIFFERENCES: Readonly<Record<string, readonly string[]>> = {
  'allOf-typed draft-07 0': ['/child/name'],
  'allOf-typed draft-07 1': ['/child/child', '/child/child/name', '/child/name'],
  'allOf-typed draft-07 2': ['/child/child', '/child/child/child', '/child/child/child/name', '/child/child/name', '/child/name'],
  'if-then draft-07 1': ['/child/child', '/child/name'],
  'if-then draft-07 2': ['/child/child', '/child/child/child', '/child/child/name', '/child/name'],
  'if-then 2020-12 0': ['/child/name'],
  'if-then 2020-12 1': ['/child/child/name'],
  'if-then 2020-12 2': ['/child/child/child/name'],
  'oneOf-null draft-07 1': ['/child/name'],
  'oneOf-null draft-07 2': ['/child/child/name', '/child/name'],
  'both-branches-recursive draft-07 1': ['/child/child', '/child/name'],
  'both-branches-recursive draft-07 2': ['/child/child', '/child/child/child', '/child/child/name', '/child/name'],
  'both-branches-recursive 2020-12 0': ['/child/name'],
  'both-branches-recursive 2020-12 1': ['/child/child/name'],
  'both-branches-recursive 2020-12 2': ['/child/child/child/name'],
  'eq-two-oneOf-wrappers draft-07 2': ['/a/b/leaf'],
  'allOf-closure draft-07 0': ['/a/next', '/a/next/v', '/a/v'],
  'allOf-closure draft-07 1': ['/a/next', '/a/next/v', '/a/v'],
  'allOf-closure draft-07 2': ['/a/next', '/a/next/next', '/a/next/next/v', '/a/next/v', '/a/v'],
}

/** Adapter choice must not change what a recursive form shows. */
export function recursiveRefParity(createA: AdapterFactory, createB: AdapterFactory): void {
  describe('recursive projection parity between the adapters', () => {
    it.each(cases(fixtures))('$fixture.id in $dialect at $data', async ({ fixture, dialect, data, depth }) => {
      const schema = inDialect(dialect, fixture.schema())
      const [a, b] = await Promise.all([createA(structuredClone(schema)), createB(structuredClone(schema))])
      const [pa, pb] = [a.project(structuredClone(data)), b.project(structuredClone(data))]
      // hyperjump follows only `#`-local references, as on main.
      if (!fixture.nonLocal) expect(summarize(pb)).toEqual(summarize(pa))
      const differing = [...pa.nodes]
        .filter(([pointer, node]) => pb.nodes.has(pointer) && pb.nodes.get(pointer)!.active !== node.active)
        .map(([pointer]) => pointer)
        .sort()
      expect(differing).toEqual(KNOWN_ACTIVE_DIFFERENCES[`${fixture.id} ${dialect} ${depth}`] ?? [])
      const [va, vb] = await Promise.all([a.validate(structuredClone(data)), b.validate(structuredClone(data))])
      expect(vb.valid).toBe(va.valid)
    })
  })
}


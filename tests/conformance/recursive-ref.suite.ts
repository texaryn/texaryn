import { describe, it, expect } from 'vitest'
import type { JsonPointer, ProjectionBoundary, SchemaEvaluationPort, SchemaProjection } from '@texaryn/core'

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
const escaped = (name: string) => name.replace(/~/g, '~0').replace(/\//g, '~1')
const parens = (name: string) => encodeURIComponent(name).replace(/[()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
const kspelled = (name: (i: number) => string, spell: (name: string) => string) => () => {
  const refs = () => Object.fromEntries(range(6).map((j) => [`p${j}`, { $ref: `#/$defs/${spell(name(j))}` }]))
  return { ...obj(refs()), $defs: Object.fromEntries(range(6).map((i) => [name(i), obj({ [`v${i}`]: S, ...refs() })])) }
}
const khubs = () => {
  const refs = () => Object.fromEntries(range(6).map((j) => [`p${j}`, { $ref: `#/definitions/H/properties/d%20${j}` }]))
  return { ...obj(refs()), definitions: { H: obj(Object.fromEntries(range(6).map((i) => [`d ${i}`, obj({ [`v${i}`]: S, ...refs() })]))) } }
}
const namedTree = (name: string, ref: string) => () => ({
  ...obj({ name: S, child: { $ref: ref } }),
  $defs: { [name]: obj({ name: S, child: { $ref: ref } }) },
})
const propertyTree = (name: string, spelled: string) => () => obj({ [name]: obj({ name: S, child: { $ref: `#/properties/${spelled}` } }) })
const wide = (leaves: number) => () => ({
  ...obj({ a: R('A') }),
  $defs: {
    A: obj({ b: R('B') }),
    B: obj({ a: R('A'), ...Object.fromEntries(range(leaves).map((i) => [`s${i}`, S])) }),
  },
})

const deep = () => obj({ r: obj({ s: obj({ t: S }) }) })
const deadForms: readonly (readonly [string, Record<string, unknown>])[] = [
  ['dead-then-if-false', { if: false, then: { properties: { q: deep() } } }],
  ['dead-then-no-if', { then: { properties: { q: deep() } } }],
  ['dead-else-if-true', { if: true, else: { properties: { q: deep() } } }],
  ['dead-else-no-if', { else: { properties: { q: deep() } } }],
]
const liveForms: readonly (readonly [string, Record<string, unknown>])[] = [
  ['live-else-if-false', { if: false, then: { properties: { d: S } }, else: { properties: { q: deep() } } }],
  ['live-then-if-true', { if: true, then: { properties: { q: deep() } }, else: { properties: { d: S } } }],
]
const twenty = (prefix: string) => Object.fromEntries(range(20).map((i) => [`${prefix}${i}`, obj({ s: S })]))
const defaulted = (name: string, value: string) => obj({ [name]: { type: 'string', default: value } })
const nestedLive = (then: Record<string, unknown>) => () =>
  obj({ child: { ...obj({ child: { type: 'object', then: {} } }), if: { required: ['z'] }, then: { if: { required: ['w'] }, then: { properties: then } } } })
const redeclared = (own: Record<string, unknown>, other: Record<string, unknown>, condition: Record<string, unknown> = {}) => () =>
  obj({ a: { ...obj({ b: { type: 'object', ...own } }), if: condition, then: { properties: { b: other } } } })
const titledSite = (inDeadBranch: boolean) => () => ({
  ...obj({
    child: {
      ...obj({ child: { type: 'object', then: { properties: { x: inDeadBranch ? { ...R('M'), title: 'd' } : R('M') } } } }),
      if: { required: ['z'] },
      then: { properties: { x: inDeadBranch ? R('M') : { ...R('M'), title: 't' } } },
    },
  }),
  $defs: { M: obj({ m: R('M') }) },
})
const liveWhen = (keyword: 'then' | 'else', properties: Record<string, unknown>) => ({ if: { required: ['w'] }, [keyword]: { properties } })
const pairData = [{}, { a: { b: {} } }, { a: { b: { w: 1 } } }]

const chain = (step: (target: string) => Record<string, unknown>) => () => ({
  ...obj({ name: S, child: step('N1') }),
  $defs: {
    N1: obj({ name: S, child: step('N2') }),
    N2: obj({ name: S, child: step('N3') }),
    N3: obj({ name: S, child: step('N4') }),
    N4: obj({ name: S }),
  },
})

const fixtures: readonly Fixture[] = [
  { id: 'tree-no-id', schema: tree, data: treeData },
  { id: 'typeless-tree', schema: () => ({ properties: { name: S, child: { $ref: '#' } } }), data: treeData },
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
    id: 'defs-node-one-site-object',
    schema: () => {
      const site = R('node')
      return { ...obj({ name: S, child: site }), $defs: { node: obj({ name: S, child: site }) } }
    },
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
    id: 'definitions-spaced-name',
    schema: () => ({
      ...obj({ name: S, child: { $ref: '#/definitions/Tree%20Node' } }),
      definitions: { 'Tree Node': obj({ name: S, child: { $ref: '#/definitions/Tree%20Node' } }) },
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
  {
    id: 'chain-if-then-acyclic',
    schema: chain((target) => ({ type: 'object', if: { type: 'object' }, then: R(target) })),
    data: treeData,
  },
  {
    id: 'chain-if-then-else-acyclic',
    schema: chain((target) => ({ type: 'object', if: { required: ['x'] }, then: R(target), else: R(target) })),
    data: treeData,
  },
  { id: 'kdistinct-6', schema: () => kdistinct(6), data: [{}] },
  { id: 'kdistinct-6-encoded-names', schema: kspelled((i) => `d(${i})`, parens), data: [{}] },
  { id: 'kdistinct-6-slash-names', schema: kspelled((i) => `d/${i}`, escaped), data: [{}] },
  { id: 'kdistinct-6-tilde-names', schema: kspelled((i) => `d~${i}`, escaped), data: [{}] },
  { id: 'kdistinct-6-hub-properties', schema: khubs, data: [{}] },
  { id: 'defs-encoded-reference', schema: namedTree('Item (v2)', `#/$defs/${parens('Item (v2)')}`), data: treeData },
  { id: 'defs-slash-name', schema: namedTree('Tree/Node', '#/$defs/Tree~1Node'), data: treeData },
  { id: 'defs-tilde-name', schema: namedTree('Tree~Node', '#/$defs/Tree~0Node'), data: treeData },
  { id: 'property-encoded-reference', schema: propertyTree('a b', 'a%20b'), data: [{}, { 'a b': {} }, { 'a b': { child: {} } }] },
  { id: 'property-slash-reference', schema: propertyTree('a/b', 'a~1b'), data: [{}, { 'a/b': {} }, { 'a/b': { child: {} } }] },
  { id: 'wide-511', schema: wide(511), data: [{}] },
  { id: 'wide-512', schema: wide(512), data: [{}] },
  ...[...deadForms, ...liveForms].map(([id, form]) => ({ id, schema: () => obj({ p: { type: 'object', ...form } }), data: [{}, { p: {} }, { p: { q: {} } }] })),
  {
    id: 'live-if-under-then-beside-then-no-if',
    schema: nestedLive({ q: defaulted('s', 'x') }),
    data: [{}, { child: {} }, { child: { z: 1, w: 1 } }],
  },
  { id: 'live-if-under-then-20-objects', schema: nestedLive(twenty('o')), data: [{}, { child: {} }, { child: { z: 1, w: 1 } }] },
  {
    id: 'live-field-beside-dead-if',
    schema: () => ({
      ...obj({
        child: {
          ...obj({ q: defaulted('d', 'x'), child: { type: 'object', then: { if: { required: ['k'] } } } }),
          if: { required: ['z'] },
          then: { then: { properties: { q: R('R') } } },
        },
        t: { type: 'array', items: R('R') },
      }),
      $defs: { R: obj({ r: { type: 'array', items: R('R') } }) },
    }),
    data: [{}, { child: {} }, { child: { z: 1 } }],
  },
  {
    id: 'own-then-redeclared-if-false',
    schema: redeclared({ if: { required: ['z'] }, then: { properties: { t: S } } }, { if: false }),
    data: [{}, { a: { b: {} } }, { a: { b: { z: 1 } } }],
  },
  {
    id: 'own-else-redeclared-if-true',
    schema: redeclared({ if: { required: ['z'] }, else: { properties: { t: S } } }, { if: true }),
    data: [{}, { a: { b: {} } }, { a: { b: { z: 1 } } }],
  },
  { id: 'site-title-in-live-branch', schema: titledSite(false), data: [{}, { child: {} }, { child: { z: 1, x: {} } }] },
  { id: 'site-title-in-dead-branch', schema: titledSite(true), data: [{}, { child: {} }, { child: { z: 1, x: {} } }] },
  {
    id: 'else-no-if-beside-an-if-20-objects',
    schema: redeclared({ else: { properties: twenty('q') } }, { if: { required: ['z'] } }),
    data: [{}, { a: { b: {} } }],
  },
  {
    id: 'else-no-if-beside-an-if-then',
    schema: redeclared({ else: { properties: { q: defaulted('s', 'x') } } }, liveWhen('then', { t: S })),
    data: [{}, { a: { b: {} } }],
  },
  {
    id: 'dead-else-in-a-merged-branch',
    schema: () =>
      obj({
        b: {
          ...obj({ a: { type: 'object' } }),
          if: {},
          then: { properties: { a: { if: true, else: { properties: twenty('x') } } } },
          else: { properties: { a: { if: false, else: { properties: { y: S } } } } },
        },
      }),
    data: [{}, { b: {} }, { b: { a: {} } }],
  },
  {
    id: 'live-else-if-false-in-a-conditional-branch',
    schema: () =>
      obj({
        b: {
          ...obj({ a: { type: 'object' } }),
          if: { required: ['k'] },
          then: { properties: { a: { if: true, else: { properties: twenty('q') } } } },
          else: { properties: { a: { if: false, else: { properties: { y: S } } } } },
        },
      }),
    data: [{}, { b: { k: 1 } }, { b: { a: {} } }],
  },
  { id: 'dead-then-wider-than-a-live-then', schema: redeclared({ then: { properties: { t: S, u: S } } }, liveWhen('then', { t: S })), data: pairData },
  {
    id: 'dead-else-wider-than-a-live-else',
    schema: redeclared({ else: { properties: { t: S, u: S } } }, liveWhen('else', { t: S })),
    data: [{}, { a: { b: {} } }, { a: { b: { t: 'x' } } }],
  },
  { id: 'dead-then-narrower-than-a-live-then', schema: redeclared({ then: { properties: { t: S } } }, liveWhen('then', { t: S, u: S })), data: pairData },
  {
    id: 'dead-if-false-then-wider-than-a-live-then',
    schema: redeclared({ if: false, then: { properties: { t: S, u: S } } }, liveWhen('then', { t: S })),
    data: pairData,
  },
  {
    id: 'live-then-beside-a-dead-then',
    schema: redeclared(liveWhen('then', { t: { type: 'string', minLength: 2 } }), { then: { properties: { t: { type: 'string', minLength: 1 } } } }),
    data: [{}, { a: { b: {} } }, { a: { b: { w: 1, t: 'x' } } }],
  },
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
const underProperty = (segment: string): readonly Expected[] => {
  const move = (pointer: string) => pointer.replace(/^\/child/, `/${segment}`)
  return pairLevels.map((level) => ({
    pointers: level.pointers.map(move),
    boundaries: Object.fromEntries(Object.entries(level.boundaries).map(([pointer, reasons]) => [move(pointer), reasons])),
    expansion: level.expansion.map(move),
  }))
}
const titleLevels: readonly Expected[] = [
  {
    pointers: ['', '/child', '/child/child', '/child/child/name', '/child/name'],
    boundaries: { '/child/child': ['recursion'] },
    expansion: ['/child/child', '/child/child/name', '/child/name'],
  },
  ...pairLevels.slice(1),
]

const chainLevel: Expected = {
  pointers: [
    '', '/child', '/child/child', '/child/child/child', '/child/child/child/child', '/child/child/child/child/name',
    '/child/child/child/name', '/child/child/name', '/child/name', '/name',
  ],
  boundaries: {},
  expansion: [],
}

const deadLevel: Expected = { pointers: ['', '/p'], boundaries: {}, expansion: [] }
const liveLevel: Expected = { pointers: ['', '/p', '/p/q', '/p/q/r', '/p/q/r/s', '/p/q/r/s/t'], boundaries: {}, expansion: [] }

const exact: Readonly<Record<string, readonly Expected[]>> = {
  ...Object.fromEntries(deadForms.map(([id]) => [id, [deadLevel, deadLevel, deadLevel]])),
  ...Object.fromEntries(liveForms.map(([id]) => [id, [liveLevel, liveLevel, liveLevel]])),
  'tree-no-id': treeLevels,
  'typeless-tree': treeLevels,
  'tree-with-id': treeLevels,
  'defs-node': treeLevels,
  'defs-node-one-site-object': treeLevels,
  'definitions-node': treeLevels,
  'definitions-spaced-name': treeLevels,
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
  'kdistinct-6-encoded-names': [k6],
  'kdistinct-6-slash-names': [k6],
  'kdistinct-6-tilde-names': [k6],
  'kdistinct-6-hub-properties': [k6],
  'defs-encoded-reference': treeLevels,
  'defs-slash-name': treeLevels,
  'defs-tilde-name': treeLevels,
  'property-encoded-reference': underProperty('a b'),
  'property-slash-reference': underProperty('a~1b'),
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
  'chain-if-then-acyclic': [chainLevel, chainLevel, chainLevel],
  'chain-if-then-else-acyclic': [chainLevel, chainLevel, chainLevel],
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
    if (pointer !== '' && !projection.nodes.has(pointer.slice(0, pointer.lastIndexOf('/')) as JsonPointer)) {
      found.push(`${pointer} has no parent node`)
    }
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
    if (node.defaultSources !== undefined && !('default' in node.annotations)) {
      found.push(`${pointer} carries defaultSources without a default`)
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

const trivialConditionals: readonly [string, Record<string, unknown>][] = [
  ['if false', { if: false, then: { $ref: '#' } }],
  ['if true', { if: true, else: { $ref: '#' } }],
  ['then without if', { then: { $ref: '#' } }],
  ['else without if', { else: { $ref: '#' } }],
]

const constructing: readonly [string, Record<string, unknown>][] = [
  ['recursion through a property', obj({ next: { $ref: '#' } })],
  [
    'a conditional that recurses through a property',
    { type: 'object', if: { required: ['x'] }, then: { properties: { next: { $ref: '#' } } } },
  ],
  ...trivialConditionals,
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
  [
    '2020-12',
    '$dynamicRef to a $dynamicAnchor',
    {
      $id: 'https://x.test/root',
      $dynamicAnchor: 'n',
      type: 'object',
      allOf: [{ $ref: 'inner#/$defs/s' }],
      $defs: { inner: { $id: 'https://x.test/inner', $dynamicAnchor: 'n', $defs: { s: { allOf: [{ $dynamicRef: '#n' }] } } } },
    },
    [['#', '#/$defs/inner/$defs/s', '#/$defs/inner/$defs/s/allOf/0', '#/allOf/0']],
  ],
  [
    '2019-09',
    '$recursiveRef to a target without $recursiveAnchor',
    {
      $id: 'https://x.test/root',
      $recursiveAnchor: true,
      type: 'object',
      allOf: [{ $ref: 'inner#/$defs/s' }],
      $defs: { inner: { $id: 'https://x.test/inner', $defs: { s: { allOf: [{ $recursiveRef: '#' }] } } } },
    },
    [['#', '#/$defs/inner/$defs/s', '#/$defs/inner/$defs/s/allOf/0', '#/allOf/0']],
  ],
  [
    '2019-09',
    '$recursiveRef to a $recursiveAnchor on an allOf member',
    {
      $id: 'https://x.test/root',
      allOf: [{ $recursiveAnchor: true, allOf: [{ $ref: 'inner#/$defs/s' }] }],
      $defs: { inner: { $id: 'https://x.test/inner', $defs: { s: { allOf: [{ $recursiveRef: '#' }] } } } },
    },
    [['#/$defs/inner/$defs/s', '#/$defs/inner/$defs/s/allOf/0', '#/allOf/0', '#/allOf/0/allOf/0']],
  ],
  [
    '2019-09',
    '$recursiveRef to a $recursiveAnchor under $defs',
    {
      $id: 'https://x.test/root',
      allOf: [{ $ref: '#/$defs/a' }],
      $defs: {
        a: { $recursiveAnchor: true, allOf: [{ $ref: 'inner#/$defs/s' }] },
        inner: { $id: 'https://x.test/inner', $defs: { s: { allOf: [{ $recursiveRef: '#' }] } } },
      },
    },
    [['#/$defs/a', '#/$defs/a/allOf/0', '#/$defs/inner/$defs/s', '#/$defs/inner/$defs/s/allOf/0']],
  ],
]

const dialectAcyclic: readonly (readonly [Dialect, string, Record<string, unknown>])[] = [
  [
    '2019-09',
    '$recursiveRef with no $recursiveAnchor to reach',
    {
      $id: 'https://x.test/root',
      allOf: [{ allOf: [{ $ref: 'inner#/$defs/s' }] }],
      $defs: { inner: { $id: 'https://x.test/inner', $defs: { s: { allOf: [{ $recursiveRef: '#' }] } } } },
    },
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

      it.each(trivialConditionals)('projects the fields beside %s', async (_label, conditional) => {
        const projection = (await createAdapter(inDialect(dialect, { ...obj({ a: S }), ...conditional }))).project({})
        expect([...projection.nodes.keys()].sort()).toEqual(['', '/a'])
        expect(projection.diagnostics).toEqual([])
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

    it.each(dialectAcyclic)('%s constructs %s', async (dialect, _label, schema) => {
      const port = await createAdapter(inDialect(dialect, schema))
      expect((await port.validate({})).valid).toBe(true)
    })
  })
}

/**
 * Pre-existing `active` differences, by case, with the pointers that differ, which main
 * shares: beneath wrapped recursion (`allOf`, `if`/`then`/`else`, draft-07 `oneOf`), the design
 * spec's out-of-scope item, and on conditional declarations without recursion.
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
  'chain-if-then-acyclic draft-07 1': ['/child/child', '/child/name'],
  'chain-if-then-acyclic draft-07 2': ['/child/child', '/child/child/child', '/child/child/name', '/child/name'],
  'chain-if-then-acyclic 2020-12 0': [
    '/child/child', '/child/child/child', '/child/child/child/child', '/child/child/child/child/name',
    '/child/child/child/name', '/child/child/name', '/child/name',
  ],
  'chain-if-then-acyclic 2020-12 1': [
    '/child/child/child', '/child/child/child/child', '/child/child/child/child/name', '/child/child/child/name',
    '/child/child/name',
  ],
  'chain-if-then-acyclic 2020-12 2': ['/child/child/child/child', '/child/child/child/child/name', '/child/child/child/name'],
  'chain-if-then-else-acyclic draft-07 1': ['/child/child', '/child/name'],
  'chain-if-then-else-acyclic draft-07 2': ['/child/child', '/child/child/child', '/child/child/name', '/child/name'],
  'chain-if-then-else-acyclic 2020-12 0': [
    '/child/child', '/child/child/child', '/child/child/child/child', '/child/child/child/child/name',
    '/child/child/child/name', '/child/child/name', '/child/name',
  ],
  'chain-if-then-else-acyclic 2020-12 1': [
    '/child/child/child', '/child/child/child/child', '/child/child/child/child/name', '/child/child/child/name',
    '/child/child/name',
  ],
  'chain-if-then-else-acyclic 2020-12 2': ['/child/child/child/child', '/child/child/child/child/name', '/child/child/child/name'],
  ...Object.fromEntries(
    PROJECTED.flatMap((dialect) =>
      (
        [
          ['live-if-under-then-beside-then-no-if', 0, ['/child']],
          ['live-if-under-then-20-objects', 0, ['/child']],
          ['own-else-redeclared-if-true', 0, ['/a/b/t']],
          ['else-no-if-beside-an-if-then', 0, ['/a/b']],
          ['dead-then-wider-than-a-live-then', 0, ['/a/b']],
          ['dead-else-wider-than-a-live-else', 0, ['/a/b', '/a/b/t']],
          ['dead-then-narrower-than-a-live-then', 0, ['/a/b']],
          ['dead-if-false-then-wider-than-a-live-then', 0, ['/a/b']],
          ['live-else-if-false-in-a-conditional-branch', 0, ['/b/a/y']],
        ] as const
      ).map(([id, depth, pointers]) => [`${id} ${dialect} ${depth}`, pointers]),
    ),
  ),
}

/**
 * Pre-existing pointer differences, by case: `a` lists what only the first adapter projects, `b`
 * what only the second does. Main's schema-json projects no field of an inactive branch below a
 * location another declaration already declares, where hyperjump projects it inactive.
 */
const KNOWN_POINTER_DIFFERENCES: Readonly<Record<string, { a?: readonly string[]; b?: readonly string[] }>> = Object.fromEntries(
  PROJECTED.flatMap((dialect) =>
    (
      [
        ['dead-else-in-a-merged-branch', 0, { b: ['/b/a/y'] }],
        ['dead-else-in-a-merged-branch', 1, { b: ['/b/a/y'] }],
        ['dead-else-in-a-merged-branch', 2, { b: ['/b/a/y'] }],
        ['live-else-if-false-in-a-conditional-branch', 1, { b: ['/b/a/y'] }],
      ] as const
    ).map(([id, depth, pointers]) => [`${id} ${dialect} ${depth}`, pointers]),
  ),
)

const without = (summary: ReturnType<typeof summarize>, pointers: readonly string[]) => ({
  pointers: summary.pointers.filter((pointer) => !pointers.includes(pointer)),
  boundaries: Object.fromEntries(Object.entries(summary.boundaries).filter(([pointer]) => !pointers.includes(pointer))),
  expansion: summary.expansion.filter((pointer) => !pointers.includes(pointer)),
})

/** Adapter choice must not change what a recursive form shows. */
export function recursiveRefParity(createA: AdapterFactory, createB: AdapterFactory): void {
  describe('recursive projection parity between the adapters', () => {
    it.each(cases(fixtures))('$fixture.id in $dialect at $data', async ({ fixture, dialect, data, depth }) => {
      const schema = inDialect(dialect, fixture.schema())
      const [a, b] = await Promise.all([createA(structuredClone(schema)), createB(structuredClone(schema))])
      const [pa, pb] = [a.project(structuredClone(data)), b.project(structuredClone(data))]
      // hyperjump follows only `#`-local references, as on main.
      if (!fixture.nonLocal) {
        const [sa, sb] = [summarize(pa), summarize(pb)]
        const known = KNOWN_POINTER_DIFFERENCES[`${fixture.id} ${dialect} ${depth}`] ?? {}
        expect(sa.pointers.filter((pointer) => !sb.pointers.includes(pointer))).toEqual(known.a ?? [])
        expect(sb.pointers.filter((pointer) => !sa.pointers.includes(pointer))).toEqual(known.b ?? [])
        const differing = [...(known.a ?? []), ...(known.b ?? [])]
        expect(without(sb, differing)).toEqual(without(sa, differing))
      }
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


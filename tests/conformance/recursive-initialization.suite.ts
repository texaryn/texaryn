import { describe, it, expect } from 'vitest'
import {
  createFormRuntime,
  type DefaultRefusal,
  type FormRuntime,
  type FormRuntimeOptions,
  type NodeId,
  type SchemaEvaluationPort,
} from '@texaryn/core'

type AdapterFactory = (schema: Record<string, unknown>) => Promise<SchemaEvaluationPort>
type Refusal = { location: string; reason: DefaultRefusal['reason'] }

const DIALECTS = {
  'draft-07': 'http://json-schema.org/draft-07/schema#',
  '2020-12': 'https://json-schema.org/draft/2020-12/schema',
} as const

const S = (value?: string) => (value === undefined ? { type: 'string' } : { type: 'string', default: value })
const range = (length: number) => Array.from({ length }, (_, i) => i)
const node = (child: unknown) => ({ type: 'object', properties: { name: S('n'), child } })
const rows = { type: 'object', properties: { name: S('n'), children: { type: 'array', items: { $ref: '#' } } } }
const selfCreating = {
  type: 'object',
  properties: { name: S('n'), children: { type: 'array', items: { $ref: '#' }, default: [{}] } },
}
const bothReasons = {
  type: 'object',
  properties: { x: { $ref: '#/$defs/n' } },
  $defs: {
    n: {
      type: 'object',
      default: {},
      properties: { self: { $ref: '#/$defs/n' }, ...Object.fromEntries(range(140).map((i) => [`p${i}`, S('d')])) },
    },
  },
}
const siblings = {
  type: 'object',
  properties: { a: { $ref: '#/$defs/kids' }, b: { $ref: '#/$defs/kids' } },
  $defs: {
    kids: { type: 'array', items: { $ref: '#/$defs/node' }, default: [{}] },
    node: { type: 'object', properties: { name: S('n'), a: { $ref: '#/$defs/kids' }, b: { $ref: '#/$defs/kids' } } },
  },
}
const addresses = {
  type: 'object',
  properties: { l: { $ref: '#/$defs/addr' }, r: { $ref: '#/$defs/addr' } },
  $defs: { addr: { type: 'object', properties: { city: S('Paris') } } },
}
const rootBeside17 = {
  type: 'object',
  properties: { title: S('x'), ...Object.fromEntries(range(17).map((i) => [`r${i}`, { $ref: '#' }])) },
}
const allToAll17 = (() => {
  const refs = () => Object.fromEntries(range(17).map((j) => [`p${j}`, { $ref: `#/$defs/d${j}` }]))
  const $defs = Object.fromEntries(
    range(17).map((i) => [`d${i}`, { type: 'object', properties: { [`v${i}`]: S(`v${i}`), ...refs() } }]),
  )
  return { type: 'object', properties: { title: S('x'), ...refs() }, $defs }
})()
const allOfClosure = {
  type: 'object',
  properties: { a: { type: 'object', allOf: [{ $ref: '#/$defs/T' }] } },
  $defs: { T: { type: 'object', properties: { v: S('d'), next: { $ref: '#/$defs/T' } } } },
}
const conditionalSites = (order: readonly string[]) => ({
  type: 'object',
  properties: Object.fromEntries(order.map((key) => [key, { $ref: '#/$defs/node' }])),
  $defs: {
    node: {
      type: 'object',
      properties: { name: S(), child: { type: 'object' } },
      if: { type: 'object' },
      then: { properties: { child: { type: 'object', default: {}, allOf: [{ $ref: '#/$defs/node' }] } } },
    },
  },
})

const containerDefault = {
  type: 'object',
  properties: { title: S('t'), x: { $ref: '#/$defs/n' } },
  $defs: { n: { type: 'object', default: {}, properties: { name: S('n'), next: { $ref: '#/$defs/n' } } } },
}
const sharedWithoutRecursion = (name: string, member: string, definition: Record<string, unknown>) => ({
  type: 'object',
  properties: { person: { type: 'object', allOf: [{ $ref: `#/$defs/${name}` }], properties: { [member]: { $ref: `#/$defs/${name}` } } } },
  $defs: { [name]: definition },
})
const entity = sharedWithoutRecursion('Entity', 'employer', { type: 'object', default: {} })
const box = sharedWithoutRecursion('Box', 'inner', { type: 'object', default: { tag: 'd' }, properties: { tag: S('t') } })
const nonCyclicSource = {
  type: 'object',
  properties: { x: { $ref: '#/$defs/n' } },
  $defs: {
    n: { type: 'object', allOf: [{ $ref: '#/$defs/S' }], properties: { name: S('n'), next: { $ref: '#/$defs/n' } } },
    S: { type: 'object', default: {} },
  },
}

const spacedName = {
  type: 'object',
  properties: { child: { $ref: '#/definitions/Tree%20Node' } },
  definitions: { 'Tree Node': node({ $ref: '#/definitions/Tree%20Node' }) },
}
const defsNamed = (name: string, ref: string) => ({ type: 'object', properties: { child: { $ref: ref } }, $defs: { [name]: node({ $ref: ref }) } })
const hubTree = {
  type: 'object',
  properties: { child: { $ref: '#/definitions/H/properties/Tree%20Node' } },
  definitions: { H: { type: 'object', properties: { 'Tree Node': node({ $ref: '#/definitions/H/properties/Tree%20Node' }) } } },
}
const propertyTree = (name: string, spelled: string) => ({ type: 'object', properties: { [name]: node({ $ref: `#/properties/${spelled}` }) } })

const expansion = (location: string): Refusal => ({ location, reason: 'recursive-expansion' })
const repeat = (location: string): Refusal => ({ location, reason: 'recursive-default' })
const byLocation = (list: readonly Refusal[]) =>
  list
    .map(({ location, reason }) => ({ location, reason }))
    .sort((a, b) => a.location.localeCompare(b.location) || a.reason.localeCompare(b.reason))

const nodeIdFor = (runtime: FormRuntime, dataPointer: string): NodeId => {
  const found = Object.values(runtime.document.getSnapshot().nodes).find(
    (candidate) => (candidate as { dataPointer?: string }).dataPointer === dataPointer,
  )
  if (!found) throw new Error(`No node at ${dataPointer}`)
  return found.id as NodeId
}

/**
 * ADR-007 at the surface a caller uses: `schema-defaults` fills what the data
 * reaches and never materialises the recursion expanded past it.
 */
export function recursiveInitializationSuite(name: string, createAdapter: AdapterFactory): void {
  describe.each(Object.keys(DIALECTS) as (keyof typeof DIALECTS)[])(
    `${name}: schema-defaults over a recursive schema in %s`,
    (dialect) => {
      const run = async (schema: Record<string, unknown>, options: Omit<FormRuntimeOptions, 'initialization'>) => {
        const port = await createAdapter({ $schema: DIALECTS[dialect], ...structuredClone(schema) })
        return { port, runtime: createFormRuntime(port, { initialization: 'schema-defaults', ...options }) }
      }

      const expectOutcome = (
        { port, runtime }: Awaited<ReturnType<typeof run>>,
        expected: { data: unknown; refusals: readonly Refusal[] },
      ) => {
        const report = runtime.initialization.getSnapshot()
        expect(report).toMatchObject({ outcome: 'initialized', conflicts: [] })
        expect(runtime.data.getSnapshot()).toEqual(expected.data)
        expect(byLocation(report?.outcome === 'initialized' ? report.refusals : [])).toEqual(byLocation(expected.refusals))
        const nodes = [...port.project(runtime.data.getSnapshot()).nodes]
        expect(nodes.filter(([, n]) => n.defaultSources !== undefined && !('default' in n.annotations))).toEqual([])
      }

      const expectRun = (
        title: string,
        schema: Record<string, unknown>,
        options: Omit<FormRuntimeOptions, 'initialization'>,
        expected: { data: unknown; refusals: readonly Refusal[] },
      ) => {
        it(title, async () => expectOutcome(await run(schema, options), expected))
      }

      expectRun('E2 leaf default beneath an absent recursive object', node({ $ref: '#' }), {}, {
        data: { name: 'n' },
        refusals: [expansion('/child/name')],
      })
      expectRun('E3 leaf default beneath a present recursive object', node({ $ref: '#' }), { initialData: { child: {} } }, {
        data: { name: 'n', child: { name: 'n' } },
        refusals: [expansion('/child/child/name')],
      })
      expectRun('E4 a null recursive property', node({ $ref: '#' }), { initialData: { child: null } }, {
        data: { name: 'n', child: null },
        refusals: [expansion('/child/name')],
      })
      expectRun('E5 a nullable recursive object', node({ oneOf: [{ $ref: '#' }, { type: 'null' }] }), {}, {
        data: { name: 'n' },
        refusals: [],
      })
      expectRun('E6 a required recursive property', { ...node({ $ref: '#' }), required: ['child'] }, {}, {
        data: { name: 'n' },
        refusals: [expansion('/child/name')],
      })

      it('E7 fills a row inserted into recursive items', async () => {
        const created = await run(rows, { initialData: { name: 'r', children: [] } })
        expectOutcome(created, { data: { name: 'r', children: [] }, refusals: [] })
        created.runtime.dispatch({ type: 'InsertItem', containerId: nodeIdFor(created.runtime, '/children'), index: 0 })
        expectOutcome(created, { data: { name: 'r', children: [{ name: 'n' }] }, refusals: [] })
      })

      expectRun('E8 a self-creating array default', selfCreating, {}, {
        data: { name: 'n', children: [{ name: 'n' }] },
        refusals: [repeat('/children/0/children')],
      })
      const expectStableOverEdits = (
        title: string,
        schema: Record<string, unknown>,
        field: string,
        initial: string,
        expected: (value: string) => { data: unknown; refusals: readonly Refusal[] },
      ) => {
        it(title, async () => {
          const created = await run(schema, {})
          expectOutcome(created, expected(initial))
          for (const edit of range(4)) {
            created.runtime.dispatch({ type: 'SetValue', nodeId: nodeIdFor(created.runtime, field), value: `edit${edit}` })
            expectOutcome(created, expected(`edit${edit}`))
          }
        })
      }
      expectStableOverEdits('E8 keeps its construction depth over four edits of an unrelated field', selfCreating, '/name', 'n', (name) => ({
        data: { name, children: [{ name: 'n' }] },
        refusals: [repeat('/children/0/children')],
      }))
      expectStableOverEdits('a $defs container default keeps its construction depth over four edits of an unrelated field', containerDefault, '/title', 't', (title) => ({
        data: { title, x: { name: 'n' } },
        refusals: [repeat('/x/next'), expansion('/x/next/name')],
      }))
      const hyperjump = name === '@hyperjump/json-schema'
      expectRun('a definition shared without recursion fills both of its sites, as on main', entity, {}, {
        data: { person: { employer: {} } },
        refusals: [],
      })
      expectRun('a definition shared without recursion fills a present site, as on main', entity, { initialData: { person: {} } }, {
        data: { person: { employer: {} } },
        refusals: [],
      })
      expectRun(
        'a container default shared without recursion is written whole at both sites, as on main (json-schema-library merges no allOf default onto the object, pre-existing)',
        box,
        {},
        {
          data: hyperjump
            ? { person: { tag: 'd', inner: { tag: 'd' } } }
            : { person: { inner: { tag: 'd' }, ...(dialect === 'draft-07' ? {} : { tag: 't' }) } },
          refusals: [],
        },
      )
      expectRun(
        'a default repeated through a definition on no cycle stops at a recursive node (json-schema-library merges no allOf default onto the object, pre-existing)',
        nonCyclicSource,
        {},
        hyperjump
          ? { data: { x: { name: 'n' } }, refusals: [repeat('/x/next'), expansion('/x/next/name')] }
          : { data: {}, refusals: [expansion('/x/name')] },
      )
      expectRun('E10 a recursion boundary with its own defaults', bothReasons, {}, {
        data: { x: Object.fromEntries(range(140).map((i) => [`p${i}`, 'd'])) },
        refusals: [repeat('/x/self'), ...range(140).map((i) => expansion(`/x/self/p${i}`))],
      })
      expectRun('E11 sibling branches with one default source', siblings, {}, {
        data: { a: [{ name: 'n' }], b: [{ name: 'n' }] },
        refusals: [repeat('/a/0/a'), repeat('/a/0/b'), repeat('/b/0/a'), repeat('/b/0/b')],
      })
      expectRun('E12 sibling objects with one leaf default source', addresses, { initialData: { l: {}, r: {} } }, {
        data: { l: { city: 'Paris' }, r: { city: 'Paris' } },
        refusals: [],
      })
      expectRun('R1 a root default beside 17 recursive properties', rootBeside17, {}, {
        data: { title: 'x' },
        refusals: range(17).map((i) => expansion(`/r${i}/title`)),
      })
      expectRun('R2 a root default beside 17 all-to-all definitions', allToAll17, {}, {
        data: { title: 'x' },
        refusals: [
          ...range(17).map((j) => expansion(`/p${j}/v${j}`)),
          ...range(16).map((k) => expansion(`/p0/p${k + 1}/v${k + 1}`)),
        ],
      })
      expectRun('a leaf default beneath a recursion held as a property of a definition', hubTree, {}, {
        data: {},
        refusals: [expansion('/child/name')],
      })
      for (const [name, spelled] of [['a b', 'a%20b'], ['a/b', 'a~1b']]) {
        expectRun(`a leaf default beneath the property ${JSON.stringify(name)} referenced as #/properties/${spelled}`, propertyTree(name!, spelled!), {}, {
          data: {},
          refusals: [expansion(`/${name!.replace('/', '~1')}/name`)],
        })
      }
      for (const [name, ref] of [['Item (v2)', '#/$defs/Item%20%28v2%29'], ['Tree/Node', '#/$defs/Tree~1Node'], ['Tree~Node', '#/$defs/Tree~0Node']]) {
        expectRun(`a leaf default beneath a recursion under the $defs name ${JSON.stringify(name)} referenced as ${ref}`, defsNamed(name!, ref!), {}, {
          data: {},
          refusals: [expansion('/child/name')],
        })
      }
      if (dialect === 'draft-07') {
        expectRun(
          'a leaf default beneath a recursion under a percent-encoded definitions name (draft-07 only: hyperjump throws on a default beside definitions in 2020-12, as on main)',
          spacedName,
          {},
          { data: {}, refusals: [expansion('/child/name')] },
        )
      }
      if (dialect === '2020-12') {
        expectRun(
          'leaf defaults beneath an allOf-wrapped recursion (2020-12 only: draft-07 has the known allOf active difference, spec ruling 8)',
          allOfClosure,
          {},
          { data: {}, refusals: [expansion('/a/next/v'), expansion('/a/v')] },
        )
        for (const order of [['a', 'b'], ['b', 'a']]) {
          expectRun(
            `a conditional recursion shared by two sites, ${order[0]} declared first (2020-12 only: draft-07 schema-json writes the same data but reports no refusal where hyperjump refuses /a/child/child and /b/child/child, the if/then active difference, spec ruling 8)`,
            conditionalSites(order),
            { initialData: { a: {}, b: {} } },
            { data: { a: { child: {} }, b: { child: {} } }, refusals: [repeat('/a/child/child'), repeat('/b/child/child')] },
          )
        }
      }
    },
  )
}

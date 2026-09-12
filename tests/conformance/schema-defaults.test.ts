import { describe, it, expect } from 'vitest'
import { createFormRuntime, type JsonPointer, type NodeId } from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createHyperjumpAdapter } from '@texaryn/schema-json-hyperjump'

/**
 * ADR-003 at the surface a caller uses, over both adapters.
 *
 * `packages/core/src/runtime/__tests__/initialization.test.ts` drives a stub
 * port and asks which surface throws and what a discarded run leaves behind.
 * This file asks the other question: whether a real schema's defaults are found
 * at all, and whether the answer depends on which library reads the schema.
 */
describe.each([
  ['json-schema-library', createJsonSchemaAdapter],
  ['@hyperjump/json-schema', createHyperjumpAdapter],
])('initialization from schema defaults (%s)', (_name, createAdapter) => {
  const runtimeFor = async (
    schema: Record<string, unknown>,
    options: Parameters<typeof createFormRuntime>[1] = {},
  ) => {
    const port = await (createAdapter as typeof createJsonSchemaAdapter)(schema)
    return createFormRuntime(port, options)
  }

  const nodeIdFor = (
    runtime: Awaited<ReturnType<typeof runtimeFor>>,
    dataPointer: string,
  ): NodeId => {
    const nodes = runtime.document.getSnapshot().nodes
    const node = Object.values(nodes).find(
      (candidate) => (candidate as { dataPointer?: string }).dataPointer === dataPointer,
    )
    if (!node) throw new Error(`No node at ${dataPointer}`)
    return node.id as NodeId
  }

  /** Friction log entry 7: the payload an untouched step submits. */
  const frictionSchema = {
    type: 'object',
    properties: {
      replicas: { type: 'integer', default: 3 },
      confidence: { type: 'number', default: 50 },
      enabled: { type: 'boolean', default: true },
      consent: { type: 'boolean', default: false },
    },
  }

  it('submits nothing for a default without the policy', async () => {
    const runtime = await runtimeFor(frictionSchema)
    expect(runtime.data.getSnapshot()).toEqual({})
  })

  it('materialises the whole untouched step under the policy', async () => {
    const runtime = await runtimeFor(frictionSchema, { initialization: 'schema-defaults' })
    expect(runtime.data.getSnapshot()).toEqual({
      replicas: 3,
      confidence: 50,
      enabled: true,
      consent: false,
    })
  })

  it('leaves a value the caller supplied', async () => {
    const runtime = await runtimeFor(frictionSchema, {
      initialization: 'schema-defaults',
      initialData: { replicas: 1 },
    })
    expect(runtime.data.getSnapshot()).toMatchObject({ replicas: 1 })
  })

  /**
   * The value differs from nothing, because rule 6 makes what the pass wrote
   * the baseline: `initialData` is the materialised data and not what the
   * caller handed in. So a seeded control reads as untouched, which is what it
   * is.
   */
  it('shows a seeded field as one the user has not touched', async () => {
    const runtime = await runtimeFor(frictionSchema, { initialization: 'schema-defaults' })
    const state = runtime.getNodeState(nodeIdFor(runtime, '/replicas'))
    expect(state?.value.getSnapshot()).toBe(3)
    expect(state?.dirty.getSnapshot()).toBe(false)
    expect(state?.touched.getSnapshot()).toBe(false)
    expect(state?.visible.getSnapshot()).toBe(true)
  })

  /**
   * A row already in the data is an ordinary container, so its item defaults
   * fill. Creating the row is not this contract's: the pass refuses to invent a
   * level it cannot name, and an omitted `InsertItem` is #127.
   */
  it('fills an item default inside a row the data already holds', async () => {
    const runtime = await runtimeFor(
      {
        type: 'object',
        properties: {
          rows: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string', default: 'anon' } },
            },
          },
        },
      },
      { initialization: 'schema-defaults', initialData: { rows: [{}, { name: 'set' }] } },
    )
    expect(runtime.data.getSnapshot()).toEqual({ rows: [{ name: 'anon' }, { name: 'set' }] })
  })

  /**
   * #127. A row inserted with no value is a location nobody stated a value for,
   * so the pass reads it as absent and the item's declarations apply. The `null`
   * standing in for it in the data is what keeps the array free of holes while
   * that happens, so nothing but JSON ever reaches the port.
   */
  const rowsSchema = {
    type: 'object',
    properties: {
      rows: {
        type: 'array',
        items: { type: 'object', properties: { name: { type: 'string', default: 'anon' } } },
      },
    },
  }

  it('fills a row inserted with no value', async () => {
    const runtime = await runtimeFor(rowsSchema, {
      initialization: 'schema-defaults',
      initialData: { rows: [] },
    })
    runtime.dispatch({ type: 'InsertItem', containerId: nodeIdFor(runtime, '/rows'), index: 0 })

    expect(runtime.data.getSnapshot()).toEqual({ rows: [{ name: 'anon' }] })
    expect(runtime.initialization.getSnapshot()).toMatchObject({
      outcome: 'initialized',
      refusals: [],
    })
  })

  it('leaves a row inserted as an explicit null', async () => {
    const runtime = await runtimeFor(rowsSchema, {
      initialization: 'schema-defaults',
      initialData: { rows: [] },
    })
    runtime.dispatch({
      type: 'InsertItem',
      containerId: nodeIdFor(runtime, '/rows'),
      index: 0,
      value: null,
    })

    expect(runtime.data.getSnapshot()).toEqual({ rows: [null] })
  })

  it('inserts null with no policy configured', async () => {
    const runtime = await runtimeFor(rowsSchema, { initialData: { rows: [] } })
    runtime.dispatch({ type: 'InsertItem', containerId: nodeIdFor(runtime, '/rows'), index: 0 })

    expect(runtime.data.getSnapshot()).toEqual({ rows: [null] })
  })

  /**
   * An explicit `undefined` states no JSON value, so it means what omitting the
   * property means. The two are genuinely different in the language, and
   * `value?: unknown` admits both, so which one the handler keys on is a
   * decision rather than an accident: `'value' in cmd` would put `undefined`
   * into the array, which is not JSON and reaches the port on the next
   * projection.
   *
   * The no-policy row is what catches that, and it is the reason this is a pair
   * rather than one case. Under the policy an `undefined` element is itself read
   * as absent by the walk to `/rows/0/name`, so the row ends up filled and looks
   * right while a non-JSON instance was projected on the way. Only the row with
   * nothing to repair it shows what actually landed.
   */
  it.each([
    ['with the policy', { initialization: 'schema-defaults' as const }, { name: 'anon' }],
    ['with no policy', {}, null],
  ])('treats an explicit undefined as no value stated, %s', async (_label, options, expected) => {
    const runtime = await runtimeFor(rowsSchema, { ...options, initialData: { rows: [] } })
    runtime.dispatch({
      type: 'InsertItem',
      containerId: nodeIdFor(runtime, '/rows'),
      index: 0,
      value: undefined,
    })

    const rows = (runtime.data.getSnapshot() as { rows: unknown[] }).rows
    expect(rows).toEqual([expected])
    // Not `toEqual`, which cannot tell a hole or an `undefined` element from a
    // `null` one: `[undefined]` and `[null]` compare equal.
    expect(rows[0] === undefined).toBe(false)
  })

  it('fills a scalar row with the item default', async () => {
    const runtime = await runtimeFor(
      {
        type: 'object',
        properties: { tags: { type: 'array', items: { type: 'string', default: 'seed' } } },
      },
      { initialization: 'schema-defaults', initialData: { tags: [] } },
    )
    runtime.dispatch({ type: 'InsertItem', containerId: nodeIdFor(runtime, '/tags'), index: 0 })

    expect(runtime.data.getSnapshot()).toEqual({ tags: ['seed'] })
    expect(runtime.initialization.getSnapshot()).toMatchObject({ outcome: 'initialized' })
  })

  /**
   * The case that proves provisional status is ended by the write and not
   * recognised from the value: after this write the row holds `null`, which is
   * exactly what stood in for it. A value-based implementation reads it as still
   * unstated, writes again, and runs to the budget.
   *
   * The data cannot tell the two apart, since a discarded run also leaves
   * `[null]`. The outcome can. A `default` need not validate against its own
   * schema, which ADR-003 already decides, so this shape is legal.
   */
  it('converges on an item whose declared default is null', async () => {
    const runtime = await runtimeFor(
      {
        type: 'object',
        properties: { items: { type: 'array', items: { type: 'string', default: null } } },
      },
      { initialization: 'schema-defaults', initialData: { items: [] } },
    )
    runtime.dispatch({ type: 'InsertItem', containerId: nodeIdFor(runtime, '/items'), index: 0 })

    expect(runtime.data.getSnapshot()).toEqual({ items: [null] })
    expect(runtime.initialization.getSnapshot()).toMatchObject({ outcome: 'initialized' })
  })

  /**
   * An item-level container default is taken whole and recursed into, exactly as
   * at any other absent location: `team` comes from the container declaration
   * rather than the property one, and `region` fills on the next pass.
   */
  it('takes an item container default whole, then fills what it left absent', async () => {
    const runtime = await runtimeFor(
      {
        type: 'object',
        properties: {
          rows: {
            type: 'array',
            items: {
              type: 'object',
              default: { team: 'a' },
              properties: {
                team: { type: 'string', default: 'b' },
                region: { type: 'string', default: 'eu' },
              },
            },
          },
        },
      },
      { initialization: 'schema-defaults', initialData: { rows: [] } },
    )
    runtime.dispatch({ type: 'InsertItem', containerId: nodeIdFor(runtime, '/rows'), index: 0 })

    expect(runtime.data.getSnapshot()).toEqual({ rows: [{ team: 'a', region: 'eu' }] })
  })

  it('fills a row inserted before an existing one, at the right index', async () => {
    const runtime = await runtimeFor(rowsSchema, {
      initialization: 'schema-defaults',
      initialData: { rows: [{ name: 'first' }] },
    })
    runtime.dispatch({ type: 'InsertItem', containerId: nodeIdFor(runtime, '/rows'), index: 0 })

    expect(runtime.data.getSnapshot()).toEqual({ rows: [{ name: 'anon' }, { name: 'first' }] })
  })

  it('creates no row from an item default', async () => {
    const runtime = await runtimeFor(
      {
        type: 'object',
        properties: {
          rows: {
            type: 'array',
            items: { type: 'object', properties: { name: { type: 'string', default: 'anon' } } },
          },
        },
      },
      { initialization: 'schema-defaults' },
    )
    expect(runtime.data.getSnapshot()).toEqual({})
  })

  it('leaves a location whose applicable declarations disagree, and reports it', async () => {
    const runtime = await runtimeFor(
      {
        type: 'object',
        allOf: [
          { properties: { x: { type: 'string', default: 'a' } } },
          { properties: { x: { type: 'string', default: 'b' } } },
        ],
      },
      { initialization: 'schema-defaults' },
    )
    expect(runtime.data.getSnapshot()).toEqual({})

    const report = runtime.initialization.getSnapshot()
    if (report?.outcome !== 'initialized') throw new Error('expected an initialized report')
    expect(report.conflicts.map((conflict) => conflict.location)).toEqual(['/x'])
    expect([...report.conflicts[0]!.sources].sort()).toEqual([
      '/allOf/0/properties/x',
      '/allOf/1/properties/x',
    ])
  })

  /**
   * The pass reaches a location a default it just wrote revealed, within the one
   * moment. `flag` turns on the `then` branch, whose own default is not
   * reachable until `flag` is there, which is why construction is a fixpoint
   * rather than a single sweep.
   */
  it('reaches a location revealed by a default it just wrote', async () => {
    const runtime = await runtimeFor(
      {
        type: 'object',
        properties: { flag: { type: 'boolean', default: true } },
        if: { properties: { flag: { const: true } }, required: ['flag'] },
        then: { properties: { revealed: { type: 'string', default: 'seen' } } },
      },
      { initialization: 'schema-defaults' },
    )
    expect(runtime.data.getSnapshot()).toEqual({ flag: true, revealed: 'seen' })
  })

  /**
   * #142, at the level it was costing something: the submitted payload.
   *
   * Each of these filled a value before the fix, and the two adapters filled
   * different ones for the same schema and the same data, so which value an
   * application submitted depended on which library it happened to depend on.
   * They are left absent now, and the report names the positions that
   * disagreed.
   */
  it.each([
    [
      'a selected oneOf branch against the base',
      {
        type: 'object',
        properties: { kind: { type: 'string' }, x: { type: 'string', default: 'own' } },
        oneOf: [
          { properties: { kind: { const: 'a' }, x: { default: 'from-a' } } },
          { properties: { kind: { const: 'b' }, x: { default: 'from-b' } } },
        ],
      },
      { kind: 'b' },
      '/x',
    ],
    [
      'two matching anyOf branches',
      {
        type: 'object',
        properties: { x: { type: 'string' } },
        anyOf: [
          { properties: { flag: { type: 'boolean' }, x: { default: 'from-first' } } },
          { properties: { other: { type: 'string' }, x: { default: 'from-second' } } },
        ],
      },
      { flag: true, other: 'y' },
      '/x',
    ],
    [
      'a provisionally selected branch against the base',
      {
        type: 'object',
        properties: { kind: { type: 'string' }, nickname: { type: 'string', default: 'base' } },
        oneOf: [
          {
            properties: { kind: { const: 'person' }, nickname: { default: 'from-branch' } },
            required: ['name'],
          },
          { properties: { kind: { const: 'company' } }, required: ['org'] },
        ],
      },
      { kind: 'person' },
      '/nickname',
    ],
  ])('leaves a location absent where %s disagrees', async (_label, schema, data, location) => {
    const runtime = await runtimeFor(schema as Record<string, unknown>, {
      initialization: 'schema-defaults',
      initialData: data,
    })

    expect(runtime.data.getSnapshot()).toEqual(data)

    const report = runtime.initialization.getSnapshot()
    if (report?.outcome !== 'initialized') throw new Error('expected an initialized report')
    expect(report.conflicts.map((conflict) => conflict.location)).toEqual([location])
    expect(report.conflicts[0]!.sources.length).toBe(2)
  })

  /**
   * The row the contract matches the reference on, measured in
   * `spikes/backstage-adoption/src/defaults-reference.test.tsx`: RJSF fills a
   * branch default when the user activates the branch by clicking the
   * discriminator, and only fails to when the activation came from the
   * discriminator's own default. Refusing to fill here would leave a
   * user-activated branch's fields empty, which is the shape the Backstage
   * template the adoption exercise uses happens to be.
   */
  it('fills a branch the user activates', async () => {
    const runtime = await runtimeFor(
      {
        type: 'object',
        properties: { flag: { type: 'boolean' } },
        if: { properties: { flag: { const: true } }, required: ['flag'] },
        then: { properties: { revealed: { type: 'string', default: 'appeared' } } },
      },
      { initialization: 'schema-defaults' },
    )
    expect(runtime.data.getSnapshot()).toEqual({})

    runtime.dispatch({ type: 'SetValue', nodeId: nodeIdFor(runtime, '/flag'), value: true })
    expect(runtime.data.getSnapshot()).toEqual({ flag: true, revealed: 'appeared' })
  })

  /**
   * #150. An omitted `initialData` is a root nobody stated a value for, so a
   * root-level `default` applies to it.
   *
   * The `{}` substitution stays: `undefined` is not JSON and the hyperjump
   * adapter refuses it at the root, which #148 established one level down. The
   * absence travels beside the data instead, as the same provisional location
   * #127 introduced for a row inserted with no value, so the port receives `{}`
   * at every moment while the pass reads the root as absent.
   */
  const rootSchema = {
    type: 'object',
    default: { seeded: true },
    properties: { seeded: { type: 'boolean' }, other: { type: 'string', default: 'prop' } },
  }

  it('applies a root-level default where no initialData was supplied', async () => {
    const runtime = await runtimeFor(rootSchema, { initialization: 'schema-defaults' })
    expect(runtime.data.getSnapshot()).toEqual({ seeded: true, other: 'prop' })
  })

  // The distinction the issue is about, and the whole reason absence cannot be
  // represented by the substituted value: `{}` is a root the caller stated.
  it('leaves a root the caller supplied, even an empty one', async () => {
    const runtime = await runtimeFor(rootSchema, {
      initialization: 'schema-defaults',
      initialData: {},
    })
    expect(runtime.data.getSnapshot()).toEqual({ other: 'prop' })
  })

  it('applies a scalar root default', async () => {
    const runtime = await runtimeFor(
      { type: 'string', default: 'whole' },
      { initialization: 'schema-defaults' },
    )
    expect(runtime.data.getSnapshot()).toBe('whole')
  })

  it('leaves an omitted root alone where nothing declares one', async () => {
    const runtime = await runtimeFor(
      { type: 'object', properties: { a: { type: 'string' } } },
      { initialization: 'schema-defaults' },
    )
    expect(runtime.data.getSnapshot()).toEqual({})
  })

  it('does not apply a root default without the policy', async () => {
    const runtime = await runtimeFor(rootSchema)
    expect(runtime.data.getSnapshot()).toEqual({})
  })

  /**
   * The adapter reports the declaration, so the pass sees it. Pinned because
   * #150's body states that as the diagnosis, and a test that passed whether or
   * not the annotation was carried would leave the diagnosis unchecked.
   */
  it('carries the root declaration on the root node', async () => {
    const port = await (createAdapter as typeof createJsonSchemaAdapter)(rootSchema)
    expect(port.project({}).nodes.get('' as JsonPointer)?.annotations.default).toEqual({
      seeded: true,
    })
  })

  /**
   * A `Reset` with no data restores a baseline that exists, so the root is not
   * absent and the root default does not apply a second time. Whatever the user
   * cleared from the seeded root stays cleared, rather than the whole root being
   * re-materialised over their edit.
   */
  it('does not treat a reset target as an unstated root', async () => {
    const runtime = await runtimeFor(rootSchema, { initialization: 'schema-defaults' })
    runtime.dispatch({ type: 'SetValue', nodeId: nodeIdFor(runtime, '/other'), value: 'typed' })
    runtime.dispatch({ type: 'Reset' })

    expect(runtime.data.getSnapshot()).toEqual({ seeded: true, other: 'prop' })
    expect(runtime.initialization.getSnapshot()).toMatchObject({ passes: 1 })
  })
})

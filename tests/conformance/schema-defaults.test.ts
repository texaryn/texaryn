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
   * #127's symptom, now on a public store rather than only in a spike.
   * `handleInsertItem` writes `cmd.value ?? null`, so a row inserted with no
   * value holds `null`, and a scalar ancestor is one the pass refuses to write
   * through: filling would spread the `null` into keys. The refusal is the
   * honest answer while the command cannot say "no value"; when #127 makes the
   * three cases distinguishable this row changes to the row being filled.
   */
  it('refuses to fill inside a row inserted with no value', async () => {
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
      { initialization: 'schema-defaults', initialData: { rows: [] } },
    )
    const rowsId = nodeIdFor(runtime, '/rows')
    runtime.dispatch({ type: 'InsertItem', containerId: rowsId, index: 0 })

    expect(runtime.data.getSnapshot()).toEqual({ rows: [null] })

    const report = runtime.initialization.getSnapshot()
    if (report?.outcome !== 'initialized') throw new Error('expected an initialized report')
    expect(report.refusals).toEqual([{ location: '/rows/0/name', reason: 'non-container-ancestor' }])
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
   * The limitation the runtime keeps: an omitted `initialData` becomes `{}`
   * before anything projects it, so the root is present and a root-level
   * `default` never applies. Distinguishing the two would mean projecting
   * `undefined`, which is not JSON.
   */
  it('does not apply a root-level default', async () => {
    const schema = {
      type: 'object',
      default: { seeded: true },
      properties: { seeded: { type: 'boolean' } },
    }
    const port = await (createAdapter as typeof createJsonSchemaAdapter)(schema)

    // Which of the two possible readings this is. The adapter does report the
    // declaration, so the pass sees it and skips a root that is present; it is
    // not an annotation nobody carried. #150 says so, and would be a wrong
    // diagnosis if this line ever stopped holding.
    expect(port.project({}).nodes.get('' as JsonPointer)?.annotations.default).toEqual({
      seeded: true,
    })

    expect(createFormRuntime(port, { initialization: 'schema-defaults' }).data.getSnapshot()).toEqual(
      {},
    )
  })
})

import { describe, it, expect } from 'vitest'
import { createFormRuntime } from '../runtime.js'
import type { SchemaEvaluationPort, SchemaProjection, NodeProjection } from '../../schema/port.js'
import type { JsonPointer, NodeId } from '../../types.js'

/**
 * The two delivery surfaces ADR-003 names, and the moments the pass runs at.
 *
 * Driven by a stub port rather than an adapter, because what is under test is
 * the runtime's side: which surface throws, which reports, and what is left
 * behind when a run is discarded. Whether a real schema's defaults are found is
 * `tests/conformance/schema-defaults.test.ts`, over both adapters.
 */

function toPointer(value: string): JsonPointer {
  return value as JsonPointer
}

function field(partial: Partial<NodeProjection> = {}): NodeProjection {
  return {
    type: partial.type ?? 'string',
    constraints: {},
    active: partial.active ?? true,
    annotations: partial.annotations ?? {},
    ...partial,
  }
}

function makePort(project: (data: unknown) => SchemaProjection): SchemaEvaluationPort {
  return { project, validate: () => ({ valid: true, errors: [] }) }
}

/** One object with one property, which declares `default`. */
function onePropertyPort(key: string, value: unknown): SchemaEvaluationPort {
  return makePort(() => ({
    nodes: new Map<JsonPointer, NodeProjection>([
      [
        toPointer(''),
        field({
          type: 'object',
          children: [{ pointer: toPointer(`/${key}`), key, required: false }],
        }),
      ],
      [toPointer(`/${key}`), field({ annotations: { default: value } })],
    ]),
  }))
}

/** An object declaring nothing, so the pass finds no location to fill. */
function rootOnlyProjection(): SchemaProjection {
  return { nodes: new Map([[toPointer(''), field({ type: 'object' })]]) }
}

/**
 * A schema that never runs out of locations: each projection finds the deepest
 * `next` the data holds and declares a default one level further down. The pass
 * writes on every sweep and converges on nothing, which is the case the budget
 * exists for and which no finite schema demonstrates.
 */
function bottomlessProjection(data: unknown): SchemaProjection {
  let depth = 0
  let current: unknown = data
  while (
    typeof current === 'object' &&
    current !== null &&
    'next' in (current as Record<string, unknown>)
  ) {
    depth += 1
    current = (current as Record<string, unknown>).next
  }

  const nodes = new Map<JsonPointer, NodeProjection>([
    [toPointer(''), field({ type: 'object' })],
  ])
  for (let level = 1; level <= depth; level += 1) {
    nodes.set(toPointer('/next'.repeat(level)), field({ type: 'object' }))
  }
  nodes.set(
    toPointer('/next'.repeat(depth + 1)),
    field({ type: 'object', annotations: { default: {} } }),
  )
  return { nodes }
}

function nodeIdFor(
  runtime: ReturnType<typeof createFormRuntime>,
  dataPointer: string,
): NodeId {
  const doc = runtime.document.getSnapshot()
  const entry = Object.entries(doc.nodes).find(
    ([, node]) => (node as { dataPointer?: string }).dataPointer === dataPointer,
  )
  if (!entry) throw new Error(`No node at ${dataPointer}`)
  return entry[0] as NodeId
}

describe('the policy is opt-in', () => {
  it('materialises nothing by default', () => {
    const runtime = createFormRuntime(onePropertyPort('replicas', 3))
    expect(runtime.data.getSnapshot()).toEqual({})
  })

  it('reports nothing to report where no policy is configured', () => {
    const runtime = createFormRuntime(onePropertyPort('replicas', 3))
    expect(runtime.initialization.getSnapshot()).toBeUndefined()
  })

  it('materialises under the configured policy', () => {
    const runtime = createFormRuntime(onePropertyPort('replicas', 3), {
      initialization: 'schema-defaults',
    })
    expect(runtime.data.getSnapshot()).toEqual({ replicas: 3 })
  })

  it('reports the run that produced the baseline', () => {
    const runtime = createFormRuntime(onePropertyPort('replicas', 3), {
      initialization: 'schema-defaults',
    })
    const report = runtime.initialization.getSnapshot()
    expect(report?.outcome).toBe('initialized')
  })
})

describe('a budget the pass cannot converge within', () => {
  it('throws out of construction, which returns a value the caller can decline', () => {
    expect(() =>
      createFormRuntime(makePort(bottomlessProjection), { initialization: 'schema-defaults' }),
    ).toThrow(/did not converge/)
  })

  /**
   * `dispatch` returns void and is typically called from a click handler, so
   * throwing would take out the host's render. The reset is refused instead,
   * which is the transactional rule at the surface that cannot catch.
   */
  it('leaves a Reset undone and reports it', () => {
    let bottomless = false
    const port = makePort((data) =>
      bottomless
        ? bottomlessProjection(data)
        : {
            nodes: new Map([
              [
                toPointer(''),
                field({
                  type: 'object',
                  children: [{ pointer: toPointer('/kept'), key: 'kept', required: false }],
                }),
              ],
              [toPointer('/kept'), field({ type: 'integer' })],
            ]),
          },
    )
    const runtime = createFormRuntime(port, {
      initialization: 'schema-defaults',
      initialData: { kept: 1 },
    })

    // Edited first, so that the data differs from the baseline. A refused
    // `Reset` that silently landed on `initialData` would otherwise be
    // indistinguishable from one that never ran.
    const nodeId = nodeIdFor(runtime, '/kept')
    runtime.dispatch({ type: 'SetValue', nodeId, value: 9 })

    bottomless = true
    runtime.dispatch({ type: 'Reset', data: { replaced: 2 } })

    expect(runtime.data.getSnapshot()).toEqual({ kept: 9 })
    expect(runtime.getNodeState(nodeId)?.dirty.getSnapshot()).toBe(true)
    // The budget's size is not the contract; that the run stopped and said so
    // is. Asserting the constant would pin an internal number from outside.
    const report = runtime.initialization.getSnapshot()
    expect(report).toMatchObject({ outcome: 'budget-exhausted' })
    expect(report?.passes).toBeGreaterThan(1)
  })

  it('reports only the discarded outcome, not the previous run findings', () => {
    let bottomless = false
    const port = makePort((data) => (bottomless ? bottomlessProjection(data) : rootOnlyProjection()))
    const runtime = createFormRuntime(port, { initialization: 'schema-defaults' })
    expect(runtime.initialization.getSnapshot()).toMatchObject({ outcome: 'initialized' })

    bottomless = true
    runtime.dispatch({ type: 'Reset' })

    expect(runtime.initialization.getSnapshot()).not.toHaveProperty('conflicts')
  })
})

describe('Reset re-establishes the baseline under the policy', () => {
  const port = onePropertyPort('replicas', 3)

  it('fills a Reset that supplies no data', () => {
    const runtime = createFormRuntime(port, { initialization: 'schema-defaults' })
    const nodeId = nodeIdFor(runtime, '/replicas')
    runtime.dispatch({ type: 'SetValue', nodeId, value: 9 })
    expect(runtime.data.getSnapshot()).toEqual({ replicas: 9 })

    runtime.dispatch({ type: 'Reset' })
    expect(runtime.data.getSnapshot()).toEqual({ replicas: 3 })
  })

  /**
   * Rule 7. An earlier revision exempted this case, on the reasoning that a
   * caller supplying data states what the form holds; the same caller supplied
   * `initialData` at construction and asked for filling there.
   */
  it('fills a Reset that supplies data', () => {
    const runtime = createFormRuntime(port, { initialization: 'schema-defaults' })
    runtime.dispatch({ type: 'Reset', data: {} })
    expect(runtime.data.getSnapshot()).toEqual({ replicas: 3 })
  })

  it('reports the run that produced the new baseline', () => {
    const runtime = createFormRuntime(port, { initialization: 'schema-defaults' })
    runtime.dispatch({ type: 'Reset', data: { replicas: 7 } })
    expect(runtime.initialization.getSnapshot()).toEqual({
      outcome: 'initialized',
      conflicts: [],
      refusals: [],
      passes: 1,
    })
  })

  /**
   * Rule 6, which is otherwise invisible from outside: `state.initialData` is
   * what the pass wrote and not what the caller supplied, so a `Reset` with no
   * data starts from data that is already filled and converges without writing.
   * Were the baseline the supplied data, this would re-run the whole chain and
   * arrive at the same values by a longer road.
   */
  it('resets to the materialised baseline rather than recomputing it', () => {
    const revealing = makePort((data) => {
      const on = (data as { flag?: unknown } | null)?.flag === true
      const nodes = new Map<JsonPointer, NodeProjection>([
        [
          toPointer(''),
          field({
            type: 'object',
            children: on
              ? [
                  { pointer: toPointer('/flag'), key: 'flag', required: false },
                  { pointer: toPointer('/revealed'), key: 'revealed', required: false },
                ]
              : [{ pointer: toPointer('/flag'), key: 'flag', required: false }],
          }),
        ],
        [toPointer('/flag'), field({ type: 'boolean', annotations: { default: true } })],
      ])
      if (on) nodes.set(toPointer('/revealed'), field({ annotations: { default: 'seen' } }))
      return { nodes }
    })

    const runtime = createFormRuntime(revealing, { initialization: 'schema-defaults' })
    expect(runtime.data.getSnapshot()).toEqual({ flag: true, revealed: 'seen' })
    expect(runtime.initialization.getSnapshot()).toMatchObject({ passes: 3 })

    runtime.dispatch({ type: 'Reset' })
    expect(runtime.data.getSnapshot()).toEqual({ flag: true, revealed: 'seen' })
    expect(runtime.initialization.getSnapshot()).toMatchObject({ passes: 1 })
  })

  it('leaves a value the Reset supplied', () => {
    const runtime = createFormRuntime(port, { initialization: 'schema-defaults' })
    runtime.dispatch({ type: 'Reset', data: { replicas: 7 } })
    expect(runtime.data.getSnapshot()).toEqual({ replicas: 7 })
  })

  it('does not fill a Reset where no policy is configured', () => {
    const runtime = createFormRuntime(port)
    runtime.dispatch({ type: 'Reset', data: {} })
    expect(runtime.data.getSnapshot()).toEqual({})
  })
})

/**
 * A location is filled when it becomes reachable, and construction is only the
 * first moment that happens. Clicking a discriminator is another, which is the
 * row where the contract matches the reference: RJSF fills a branch default on
 * activation, and refusing to would leave a user-activated branch's fields
 * empty, which is the shape the Backstage template the adoption exercise uses
 * happens to be.
 */
describe('an edit that reveals a branch', () => {
  const revealingPort = makePort((data) => {
    const on = (data as { flag?: unknown } | null)?.flag === true
    const nodes = new Map<JsonPointer, NodeProjection>([
      [
        toPointer(''),
        field({
          type: 'object',
          children: on
            ? [
                { pointer: toPointer('/flag'), key: 'flag', required: false },
                { pointer: toPointer('/revealed'), key: 'revealed', required: false },
              ]
            : [{ pointer: toPointer('/flag'), key: 'flag', required: false }],
        }),
      ],
      [toPointer('/flag'), field({ type: 'boolean' })],
    ])
    if (on) nodes.set(toPointer('/revealed'), field({ annotations: { default: 'seen' } }))
    return { nodes }
  })

  it('fills what the edit made reachable', () => {
    const runtime = createFormRuntime(revealingPort, { initialization: 'schema-defaults' })
    expect(runtime.data.getSnapshot()).toEqual({})

    runtime.dispatch({ type: 'SetValue', nodeId: nodeIdFor(runtime, '/flag'), value: true })
    expect(runtime.data.getSnapshot()).toEqual({ flag: true, revealed: 'seen' })
  })

  /**
   * All four flags for a location seeded against a baseline that was already
   * fixed. `modified` is true because the value does differ from
   * `state.initialData`; the other three say the user never typed it. `NodeState`
   * exposes two of the four, so the rest are read off the runtime's own state
   * rather than by widening the public surface for a test.
   */
  it('shows the seeded location as changed but not edited', () => {
    const runtime = createFormRuntime(revealingPort, { initialization: 'schema-defaults' })
    runtime.dispatch({ type: 'SetValue', nodeId: nodeIdFor(runtime, '/flag'), value: true })

    const seeded = runtime.getNodeState(nodeIdFor(runtime, '/revealed'))
    expect(seeded?.value.getSnapshot()).toBe('seen')
    expect(seeded?.dirty.getSnapshot()).toBe(false)
    expect(seeded?.touched.getSnapshot()).toBe(false)

    const edited = runtime.getNodeState(nodeIdFor(runtime, '/flag'))
    expect(edited?.dirty.getSnapshot()).toBe(true)
  })

  /**
   * `modified` itself is computed and read by nothing on `NodeState`, but the
   * fact it reports is public: the seeded location is not in the baseline, so a
   * `Reset` with no data does not bring it back. Rule 6 covers construction and
   * `Reset`; this is the case between them.
   */
  it('does not make the seeded location part of the baseline', () => {
    const runtime = createFormRuntime(revealingPort, { initialization: 'schema-defaults' })
    runtime.dispatch({ type: 'SetValue', nodeId: nodeIdFor(runtime, '/flag'), value: true })
    expect(runtime.data.getSnapshot()).toEqual({ flag: true, revealed: 'seen' })

    runtime.dispatch({ type: 'Reset' })
    expect(runtime.data.getSnapshot()).toEqual({})
  })

  /**
   * An edit establishes no baseline, so an exhausted budget discards the
   * seeding and keeps the keystroke. Refusing the edit would make the user pay
   * for a schema they cannot see.
   */
  it('keeps the edit when the seeding does not converge', () => {
    let bottomless = false
    const port = makePort((data) =>
      bottomless
        ? bottomlessProjection(data)
        : {
            nodes: new Map([
              [
                toPointer(''),
                field({
                  type: 'object',
                  children: [{ pointer: toPointer('/typed'), key: 'typed', required: false }],
                }),
              ],
              [toPointer('/typed'), field({})],
            ]),
          },
    )
    const runtime = createFormRuntime(port, { initialization: 'schema-defaults' })
    const nodeId = nodeIdFor(runtime, '/typed')

    bottomless = true
    runtime.dispatch({ type: 'SetValue', nodeId, value: 'kept' })

    expect(runtime.data.getSnapshot()).toEqual({ typed: 'kept' })
    expect(runtime.initialization.getSnapshot()).toMatchObject({ outcome: 'budget-exhausted' })
  })
})

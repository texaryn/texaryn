import { describe, it, expect } from 'vitest'
import { createFormRuntime } from '../runtime.js'
import type { SchemaEvaluationPort, SchemaProjection, NodeProjection } from '../../schema/port.js'
import type { JsonPointer, NodeId } from '../../types.js'

/**
 * Whether a location that has been filled can become absent again.
 *
 * ADR-003 fills only absent locations, so a filled location cannot be filled
 * twice exactly while nothing removes a key. The contract states that as a
 * consequence rather than a promise, because it is not this mechanism's to
 * guarantee, and says the invariant belongs here once the mechanism exists:
 * `spikes/backstage-adoption/src/absence-reference.test.ts` measures it against
 * published packages, which the workspace CI does not run.
 *
 * If the first test starts failing, that consequence is gone and rule 5 has to
 * take one of the two answers it names: carry an explicit set of materialised
 * locations, keyed on stable item identity rather than a JSON pointer, because
 * removing a row renumbers the pointers after it, or accept that a deleted
 * property becomes eligible again.
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

describe('a filled location never becomes absent', () => {
  it('keeps the key of a cleared field, holding undefined', () => {
    const port = makePort(() => ({
      nodes: new Map([
        [
          toPointer(''),
          field({
            type: 'object',
            children: [{ pointer: toPointer('/a'), key: 'a', required: false }],
          }),
        ],
        [toPointer('/a'), field({ annotations: { default: 'seed' } })],
      ]),
    }))
    const runtime = createFormRuntime(port, { initialization: 'schema-defaults' })
    expect(runtime.data.getSnapshot()).toEqual({ a: 'seed' })

    runtime.dispatch({ type: 'SetValue', nodeId: nodeIdFor(runtime, '/a'), value: undefined })

    const data = runtime.data.getSnapshot() as Record<string, unknown>
    expect(Object.keys(data)).toEqual(['a'])
    expect(data.a).toBeUndefined()
  })

  /**
   * The data of a branch that has stopped applying stays, so a location filled
   * while one branch applied is still present when another does. Tracked as
   * #126, which is about what a submission contains rather than about defaults:
   * pruning on deactivation would end the consequence above, filtering at
   * submission time would leave it intact.
   */
  it('keeps the data of a branch that has stopped applying', () => {
    const port = makePort((data) => {
      const kind = (data as { kind?: unknown } | null)?.kind
      const nodes = new Map<JsonPointer, NodeProjection>([
        [
          toPointer(''),
          field({
            type: 'object',
            children: [
              { pointer: toPointer('/kind'), key: 'kind', required: false },
              ...(kind === 'a'
                ? [{ pointer: toPointer('/onlyForA'), key: 'onlyForA', required: false }]
                : []),
            ],
          }),
        ],
        [toPointer('/kind'), field({})],
      ])
      if (kind === 'a') {
        nodes.set(toPointer('/onlyForA'), field({ annotations: { default: 'filled' } }))
      }
      return { nodes }
    })

    const runtime = createFormRuntime(port, {
      initialization: 'schema-defaults',
      initialData: { kind: 'a' },
    })
    expect(runtime.data.getSnapshot()).toEqual({ kind: 'a', onlyForA: 'filled' })

    runtime.dispatch({ type: 'SetValue', nodeId: nodeIdFor(runtime, '/kind'), value: 'b' })
    expect(runtime.data.getSnapshot()).toEqual({ kind: 'b', onlyForA: 'filled' })
  })
})

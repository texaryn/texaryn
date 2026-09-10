import { describe, it, expect } from 'vitest'
import { createFormRuntime } from '../runtime.js'
import type { SchemaEvaluationPort, SchemaProjection, NodeProjection } from '../../schema/port.js'
import type { JsonPointer, NodeId } from '../../types.js'

const at = (s: string) => s as JsonPointer

/** One object root with one string child at `/a`. */
function objectWithChild(): SchemaEvaluationPort {
  const nodes = new Map<JsonPointer, NodeProjection>()
  nodes.set(at(''), {
    type: 'object',
    constraints: {},
    active: true,
    annotations: {},
    children: [{ pointer: at('/a'), key: 'a', required: false }],
  })
  nodes.set(at('/a'), {
    type: 'string',
    constraints: {},
    active: true,
    annotations: {},
  })
  return {
    project: (): SchemaProjection => ({ nodes }),
    validate: () => ({ valid: true, errors: [] }),
  }
}

/** A schema whose whole instance is a string, so the root node is the field. */
function scalarRoot(): SchemaEvaluationPort {
  const nodes = new Map<JsonPointer, NodeProjection>()
  nodes.set(at(''), { type: 'string', constraints: {}, active: true, annotations: {} })
  return {
    project: (): SchemaProjection => ({ nodes }),
    validate: () => ({ valid: true, errors: [] }),
  }
}

function nodeIdFor(runtime: ReturnType<typeof createFormRuntime>, pointer: string): NodeId {
  const doc = runtime.document.getSnapshot()
  const found = Object.keys(doc.nodes).find((id) => doc.nodes[id]?.dataPointer === pointer)
  if (found === undefined) throw new Error(`no node for pointer ${pointer}`)
  return found as NodeId
}

/**
 * What the runtime does with a root the caller supplied that is not an object.
 *
 * This is #124's table, both columns. Two defects met in it. `?? {}` treated
 * `null` as "not supplied" while `false`, `0` and `''` survived, so a caller
 * could not say "the instance is `null`" and which falsy values lived was
 * arbitrary. And a non-object root that did survive was destroyed by the first
 * write to a child, because the write spread it: a string became character keys
 * and a number was replaced outright.
 *
 * The two interacted, which is why the obvious fix was wrong on its own.
 * Letting `null` through without addressing the write would have moved `null`
 * from the coherent column into the corrupted one.
 */
describe('a non-object initialData root', () => {
  it.each([
    ['omitted', undefined, {}],
    ['null', null, null],
    ['an empty object', {}, {}],
    ['false', false, false],
    ['zero', 0, 0],
    ['the empty string', '', ''],
    ['a string', 'plain', 'plain'],
    ['a number', 7, 7],
  ])('keeps %s as supplied at construction', (_label, initialData, expected) => {
    const runtime = createFormRuntime(objectWithChild(), { initialData })
    expect(runtime.data.getSnapshot()).toEqual(expected)
  })

  /**
   * `null` joins the two that already created an object, rather than the five
   * that now refuse. `getAtPointer` reads through `null` and absent
   * identically, so writing has to agree with reading, and
   * `{ type: ['object', 'null'] }` starting at `null` is the case that makes it
   * more than symmetry for its own sake.
   */
  it.each([
    ['omitted', undefined],
    ['null', null],
    ['an empty object', {}],
  ])('creates the object on the first write when the root is %s', (_label, initialData) => {
    const runtime = createFormRuntime(objectWithChild(), { initialData })
    runtime.dispatch({ type: 'SetValue', nodeId: nodeIdFor(runtime, '/a'), value: 'x' })
    expect(runtime.data.getSnapshot()).toEqual({ a: 'x' })
  })

  it.each([
    ['false', false],
    ['zero', 0],
    ['the empty string', ''],
    ['a string', 'plain'],
    ['a number', 7],
  ])('refuses the first write when the root is %s', (_label, initialData) => {
    const runtime = createFormRuntime(objectWithChild(), { initialData })
    const nodeId = nodeIdFor(runtime, '/a')
    expect(() => runtime.dispatch({ type: 'SetValue', nodeId, value: 'x' })).toThrow(
      /cannot hold a property/,
    )
  })

  /**
   * The string row is the one that failed silently and so the one worth stating
   * separately: it produced an instance no schema described rather than an
   * obviously wrong one.
   */
  it('no longer spreads a string root into character keys', () => {
    const runtime = createFormRuntime(objectWithChild(), { initialData: 'plain' })
    const nodeId = nodeIdFor(runtime, '/a')
    try {
      runtime.dispatch({ type: 'SetValue', nodeId, value: 'x' })
    } catch {
      // The refusal is asserted above; here the point is what the data is not.
    }
    expect(runtime.data.getSnapshot()).toBe('plain')
  })

  /**
   * A scalar root is not itself the problem, which is why the fix is about the
   * write rather than about rejecting the root. A schema whose whole instance
   * is a string projects one node at the root pointer, and writing there
   * replaces the document instead of walking into it.
   */
  it('writes a scalar root when the schema says the root is the field', () => {
    const runtime = createFormRuntime(scalarRoot(), { initialData: 'x' })
    runtime.dispatch({ type: 'SetValue', nodeId: nodeIdFor(runtime, ''), value: 'y' })
    expect(runtime.data.getSnapshot()).toBe('y')
  })
})

/**
 * The same conflation one level down. `Reset` took `cmd.data ?? state.initialData`,
 * so resetting to `null` reset to the initial data instead. `data?: unknown`
 * distinguishes omitted from `null`, so the two cases can be told apart.
 */
describe('Reset with an explicit null', () => {
  it('resets to null rather than to the initial data', () => {
    const runtime = createFormRuntime(objectWithChild(), { initialData: { a: 'first' } })
    runtime.dispatch({ type: 'Reset', data: null })
    expect(runtime.data.getSnapshot()).toBeNull()
  })

  /**
   * An explicit `undefined` is not a third case. `data?: unknown` makes it
   * indistinguishable from omitted under TypeScript's optional-property
   * semantics, and `initialData` treats it the same way, so the two stay
   * consistent. `null` is the case that had to become expressible.
   */
  it('treats an explicit undefined as no data, as initialData does', () => {
    const runtime = createFormRuntime(objectWithChild(), { initialData: { a: 'first' } })
    runtime.dispatch({ type: 'SetValue', nodeId: nodeIdFor(runtime, '/a'), value: 'second' })
    runtime.dispatch({ type: 'Reset', data: undefined })
    expect(runtime.data.getSnapshot()).toEqual({ a: 'first' })
  })

  it('still resets to the initial data when no data is given', () => {
    const runtime = createFormRuntime(objectWithChild(), { initialData: { a: 'first' } })
    runtime.dispatch({ type: 'SetValue', nodeId: nodeIdFor(runtime, '/a'), value: 'second' })
    runtime.dispatch({ type: 'Reset' })
    expect(runtime.data.getSnapshot()).toEqual({ a: 'first' })
  })
})

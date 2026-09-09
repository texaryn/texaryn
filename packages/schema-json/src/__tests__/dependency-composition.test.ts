import { describe, it, expect } from 'vitest'
import { createJsonSchemaAdapter } from '../index.js'
import { compileSchema } from 'json-schema-library'
import type { JsonPointer } from '@texaryn/core'

/**
 * A `oneOf` inside a dependent schema, which is the conditional idiom
 * [Backstage issue #30090](https://github.com/backstage/backstage/issues/30090)
 * recommends when `allOf`/`if`/`then` misbehaves.
 *
 * Projecting one used to throw a `TypeError` out of `json-schema-library`,
 * exactly while the value satisfied none of the branches. That is not an edge
 * case reachable by unusual input: the revealed branch requires a field which
 * by definition has no value at the moment it is revealed, so the first
 * keystroke that sets the discriminator took the render down.
 *
 * A projection cannot throw because a form's data is temporarily invalid.
 * Being unable to tell which branch applies is a state this file already has
 * semantics for, and these hold the adapter to them.
 */
async function project(schema: unknown, data: unknown) {
  const adapter = await createJsonSchemaAdapter(schema, { defaultDialect: 'draft-07' })
  return adapter.project(data)
}

/**
 * `project` is synchronous on the adapter, and that matters for the assertion:
 * wrapping the async helper above in `expect(() => …).not.toThrow()` tests
 * nothing, because a rejected promise is not a thrown error. The adapter is
 * built first so the throw being asserted is the real one.
 */
async function projector(schema: unknown) {
  const adapter = await createJsonSchemaAdapter(schema, { defaultDialect: 'draft-07' })
  return (data: unknown) => adapter.project(data)
}

async function verdict(schema: unknown, data: unknown) {
  const adapter = await createJsonSchemaAdapter(schema, { defaultDialect: 'draft-07' })
  return (await adapter.validate(data)).valid
}

/** The shape from the Backstage issue: a discriminator revealing a required field. */
const discriminated = {
  type: 'object',
  properties: { includeName: { title: 'Include Name?', type: 'boolean' } },
  dependencies: {
    includeName: {
      oneOf: [
        { properties: { includeName: { const: false } } },
        {
          properties: {
            includeName: { const: true },
            lastName: { title: 'Last Name', type: 'string' },
          },
          required: ['lastName'],
        },
      ],
    },
  },
}

describe('a oneOf inside a dependent schema', () => {
  it('does not throw while the value satisfies no branch', async () => {
    // `includeName: true` fails the first branch on `const`, and the second on
    // its own `required`, so no branch applies. This is the state the form is
    // in from the moment the box is ticked until the revealed field is filled.
    expect(await verdict(discriminated, { includeName: true })).toBe(false)

    const projectWith = await projector(discriminated)
    expect(() => projectWith({ includeName: true })).not.toThrow()
    expect([...projectWith({ includeName: true }).nodes.keys()]).toContain('')
  })

  it('still projects every candidate while no branch applies', async () => {
    const projection = await project(discriminated, { includeName: true })
    const pointers = [...projection.nodes.keys()]

    expect(pointers).toContain('/includeName')
    // The field the revealed branch declares has to be reachable, or the step
    // reports it as required and offers no way to supply it: the same defect
    // the nested-applicator work fixed, arrived at by a different route.
    expect(pointers).toContain('/lastName')
  })

  it('resolves normally once a branch applies', async () => {
    const filled = await project(discriminated, { includeName: true, lastName: 'Lovelace' })
    expect(await verdict(discriminated, { includeName: true, lastName: 'Lovelace' })).toBe(true)
    expect(filled.nodes.get('/lastName' as JsonPointer)?.active).toBe(true)

    const off = await project(discriminated, { includeName: false })
    expect(await verdict(discriminated, { includeName: false })).toBe(true)
    expect(off.nodes.get('/lastName' as JsonPointer)?.active).toBe(false)
  })

  it('reports the same verdict whether or not a branch applies', async () => {
    // Validation is untouched by any of this: the adapter's inability to pick a
    // branch must not change what the schema says about the data.
    expect(await verdict(discriminated, { includeName: true })).toBe(false)
    expect(await verdict(discriminated, { includeName: true, lastName: 'x' })).toBe(true)
    expect(await verdict(discriminated, {})).toBe(true)
  })
})

describe('the neighbouring compositions, which never threw', () => {
  const withBranch = (branch: Record<string, unknown>) => ({
    type: 'object',
    properties: { flag: { type: 'boolean' } },
    dependencies: { flag: branch },
  })

  it.each([
    ['anyOf', { anyOf: [{ required: ['extra'] }] }],
    ['a plain subschema', { required: ['extra'] }],
    ['allOf', { allOf: [{ required: ['extra'] }] }],
  ])('%s inside a dependent schema', async (_label, branch) => {
    const schema = withBranch(branch)
    expect(await verdict(schema, { flag: true })).toBe(false)
    const projectWith = await projector(schema)
    expect(() => projectWith({ flag: true })).not.toThrow()
  })

  it('a top-level oneOf that no value satisfies', async () => {
    const schema = {
      type: 'object',
      properties: { flag: { type: 'boolean' } },
      oneOf: [
        { properties: { flag: { const: false } } },
        { properties: { flag: { const: true } }, required: ['extra'] },
      ],
    }
    expect(await verdict(schema, { flag: true })).toBe(false)
    const projectWith = await projector(schema)
    expect(() => projectWith({ flag: true })).not.toThrow()
  })
})

describe('several dependent schemas', () => {
  /**
   * The reduction merges each dependent schema in turn, so one that cannot be
   * resolved must not cost the ones that can.
   */
  const twoDependencies = {
    type: 'object',
    properties: { a: { type: 'boolean' }, b: { type: 'boolean' } },
    dependencies: {
      a: {
        oneOf: [
          { properties: { a: { const: false } } },
          {
            // Declares the field as well as requiring it. A bare `required`
            // entry with no matching `properties` schema describes nothing to
            // render, so it contributes no candidate, which is a separate
            // question from this one.
            properties: { a: { const: true }, fromA: { type: 'string' } },
            required: ['fromA'],
          },
        ],
      },
      b: { properties: { fromB: { type: 'string' } } },
    },
  }

  it('keeps the resolvable dependency when another cannot resolve', async () => {
    const projection = await project(twoDependencies, { a: true, b: true })
    const pointers = [...projection.nodes.keys()]
    expect(pointers).toContain('/fromB')
    expect(pointers).toContain('/fromA')
  })
})

/**
 * The upstream defect reached through an applicator rather than declared on the
 * node being reduced.
 *
 * Testing this rather than assuming it is what drove two redesigns. A first
 * guard asked whether the node carried a failing dependent schema of its own,
 * and a schema declaring none still propagated the throw from a dependency
 * nested inside its `allOf`. Widening that search then created a worse bug of
 * its own, and the attribution is now by experiment, which needs to know
 * nothing about where the dependency sits.
 */
describe('the same defect nested inside an applicator', () => {
  const dependency = {
    type: 'object',
    properties: { flag: { type: 'boolean' } },
    dependencies: {
      flag: {
        oneOf: [
          { properties: { flag: { const: false } } },
          {
            properties: { flag: { const: true }, extra: { type: 'string' } },
            required: ['extra'],
          },
        ],
      },
    },
  }

  it('survives a typed object whose allOf carries it', async () => {
    const schema = { type: 'object', allOf: [dependency] }
    const projectWith = await projector(schema)
    expect(() => projectWith({ flag: true })).not.toThrow()
    expect([...projectWith({ flag: true }).nodes.keys()]).toEqual(['', '/flag', '/extra'])
  })

  it('survives a typeless oneOf carrying it', async () => {
    const projectWith = await projector({ oneOf: [dependency] })
    expect(() => projectWith({ flag: true })).not.toThrow()
  })

  it('survives it two applicators down', async () => {
    const schema = { type: 'object', allOf: [{ allOf: [dependency] }] }
    const projectWith = await projector(schema)
    expect(() => projectWith({ flag: true })).not.toThrow()
  })
})

/**
 * A failure the dependency keywords do not account for must still reach the
 * caller.
 *
 * Attribution is by experiment: the reduction is retried with those keywords
 * removed, and only a failure that goes away with them is absorbed. Anything
 * that survives the removal is re-thrown, so the next upstream fault stays
 * visible instead of becoming a quietly inactive branch.
 */
describe('failures the dependency keywords do not explain', () => {
  it('leaves an ordinary schema entirely alone', async () => {
    const adapter = await createJsonSchemaAdapter(
      { type: 'object', properties: { a: { type: 'string' } } },
      { defaultDialect: 'draft-07' },
    )
    const projection = adapter.project({ a: 'x' })

    // No dependency keywords anywhere, so nothing is stripped and nothing is
    // retried: the reduction is the one upstream would have done unaided.
    expect([...projection.nodes.keys()]).toEqual(['', '/a'])
  })
})

/**
 * A dependency the data does not trigger, alongside one it does.
 *
 * Which dependencies upstream chooses to process is upstream's business, and
 * attribution by experiment never has to guess at it: the reduction either
 * stops failing without the dependency keywords or it does not. An earlier
 * guard did try to reproduce that rule and got it wrong, because upstream
 * grows its `required` list as it walks, so a dependency whose trigger is
 * absent can still run.
 */
describe('an untriggered dependency beside a failing one', () => {
  const mixed = {
    type: 'object',
    properties: { other: { type: 'boolean' }, flag: { type: 'boolean' } },
    dependencies: {
      // Declared first and never triggered by the data below, so upstream
      // reaches the failing dependency only after passing over this one.
      other: { properties: { fromOther: { type: 'string' } } },
      flag: {
        oneOf: [
          { properties: { flag: { const: false } } },
          {
            properties: { flag: { const: true }, extra: { type: 'string' } },
            required: ['extra'],
          },
        ],
      },
    },
  }

  it('is skipped, and the failing dependency still explains the throw', async () => {
    const projectWith = await projector(mixed)
    expect(() => projectWith({ flag: true })).not.toThrow()

    const pointers = [...projectWith({ flag: true }).nodes.keys()]
    expect(pointers).toContain('/extra')
    // The untriggered dependency's own field is still a static candidate, since
    // candidate discovery does not depend on the data.
    expect(pointers).toContain('/fromOther')
  })
})

/**
 * A dependency whose own dependency carries the same defect.
 *
 * Nesting made the earlier prediction-based guards harder and harder to keep
 * correct, and it costs the experimental one nothing: stripping the dependency
 * keywords strips them at every depth, so a defect one level down goes with
 * them exactly as one at the top does.
 */
describe('a dependency nesting the same defect', () => {
  const nested = {
    type: 'object',
    properties: { outer: { type: 'boolean' }, inner: { type: 'boolean' } },
    dependencies: {
      outer: {
        properties: { inner: { type: 'boolean' } },
        dependencies: {
          inner: {
            oneOf: [
              { properties: { inner: { const: false } } },
              {
                properties: { inner: { const: true }, deep: { type: 'string' } },
                required: ['deep'],
              },
            ],
          },
        },
      },
    },
  }

  it('does not throw, and still reaches the nested candidate', async () => {
    const projectWith = await projector(nested)
    expect(() => projectWith({ outer: true, inner: true })).not.toThrow()

    const pointers = [...projectWith({ outer: true, inner: true }).nodes.keys()]
    expect(pointers).toContain('/inner')
    expect(pointers).toContain('/deep')
  })
})

/**
 * The workaround's own retirement test, exercising json-schema-library rather
 * than Texaryn.
 *
 * When a release fixes the `dependencies` reducer, this goes red and says to
 * delete the guard. It deliberately asserts only that a throw happens, not its
 * class or message: neither is a contract, and pinning either would make this
 * fail for the wrong reason.
 */
describe('the upstream defect the guard exists for', () => {
  it('json-schema-library still throws while reducing a dependent oneOf', () => {
    const node = compileSchema(discriminated as never, { draft: 'draft-07' })

    expect(
      () => node.reduceNode({ includeName: true }),
      'json-schema-library no longer throws here: remove reduceAgainst and withoutDependencies',
    ).toThrow()
  })

  it('and reduces the dependent schema alone without throwing', () => {
    // The state upstream mishandles: the nested reduction reports failure the
    // documented way, and the parent dereferences the missing node anyway.
    const node = compileSchema(discriminated as never, { draft: 'draft-07' })
    const dependent = (
      node as unknown as {
        dependentSchemas?: Record<string, { reduceNode: (d: unknown) => { node?: unknown } }>
      }
    ).dependentSchemas?.includeName

    expect(dependent).toBeDefined()
    expect(() => dependent!.reduceNode({ includeName: true })).not.toThrow()
    expect(dependent!.reduceNode({ includeName: true }).node).toBeUndefined()
  })
})

/**
 * What the crash guard does **not** solve, recorded as it stands.
 *
 * Preventing the exception leaves a form that is still unusable: the value
 * identifies a branch to a reader, the branch is invalid only because its own
 * required field is absent, and `oneOf` selects on full validity, so no branch
 * is selected and the field needed to become valid projects inactive. So the
 * step reports `/extra` as missing and hides it, which is the same shape of
 * defect the nested-applicator work fixed, arrived at from another direction.
 *
 * Left for its own change rather than folded in here, because deciding it
 * means deciding how a partially satisfied branch is selected, and that
 * governs every `oneOf` rather than this one crash. Tracked as issue #120,
 * which sets out what has to be decided. Whichever way it goes, these
 * assertions change, which is how the decision becomes visible.
 */
describe('the branch is identifiable but incomplete', () => {
  it('hides the field that would make the data valid', async () => {
    const projection = await project(discriminated, { includeName: true })

    expect(await verdict(discriminated, { includeName: true })).toBe(false)
    expect(projection.nodes.get('/lastName' as JsonPointer)?.active).toBe(false)
    expect(
      (projection.nodes.get('' as JsonPointer)?.children ?? []).filter((child) => child.required),
    ).toEqual([])
  })

  it('shows it once the value is supplied, which the form cannot do', async () => {
    // The exit from that state exists and is unreachable through the form: the
    // field has to be filled for it to appear.
    const projection = await project(discriminated, { includeName: true, lastName: 'x' })
    expect(projection.nodes.get('/lastName' as JsonPointer)?.active).toBe(true)
  })
})

/**
 * The two cases that showed prediction was the wrong shape, kept because they
 * are the reason the guard works by experiment.
 *
 * Both were written before the redesign and both failed against the guard that
 * tried to predict which schemas the evaluator would visit.
 */
describe('why the failure is attributed by experiment', () => {
  /**
   * A branch the evaluator never reduces must not affect the branch it does.
   *
   * The outer `oneOf` has exactly one valid branch, the first, so upstream
   * reduces that alone and never touches the broken dependency in the second.
   * A guard that walked the schema statically found that dependency anyway and
   * skipped the whole reduction, so `/visible` went inactive even though its
   * branch was the selected one and the data was valid.
   */
  it('leaves the selected branch active when an unselected one is broken', async () => {
    const schema = {
      type: 'object',
      properties: { kind: { type: 'string' }, flag: { type: 'boolean' } },
      oneOf: [
        { properties: { kind: { const: 'a' }, visible: { type: 'string' } } },
        {
          properties: { kind: { const: 'b' } },
          dependencies: {
            flag: {
              oneOf: [
                { properties: { flag: { const: false } } },
                {
                  properties: { flag: { const: true }, hidden: { type: 'string' } },
                  required: ['hidden'],
                },
              ],
            },
          },
        },
      ],
    }
    const data = { kind: 'a', flag: true }

    expect(await verdict(schema, data)).toBe(true)
    const projection = await project(schema, data)
    expect(projection.nodes.get('/visible' as JsonPointer)?.active).toBe(true)
    // The unselected branch's field is still a candidate, and inactive.
    expect(projection.nodes.get('/hidden' as JsonPointer)?.active).toBe(false)
  })

  /**
   * A dependency upstream processes although its trigger is absent.
   *
   * draft-07's array form of `dependencies` normalises to `dependentRequired`,
   * and upstream grows the `required` list as it walks: `a` being present adds
   * `b` to it, so dependency `b` runs even though `b` itself is absent from
   * the data. A guard that decided which dependencies were applicable by
   * reading the schema's own `required` missed that, and the crash it exists
   * for still happened.
   */
  it('survives a dependency triggered through dependentRequired', async () => {
    const schema = {
      type: 'object',
      properties: { a: { type: 'boolean' } },
      dependencies: {
        a: ['b'],
        b: {
          oneOf: [
            { properties: { a: { const: false } } },
            {
              properties: { a: { const: true }, extra: { type: 'string' } },
              required: ['extra'],
            },
          ],
        },
      },
    }

    const projectWith = await projector(schema)
    expect(() => projectWith({ a: true })).not.toThrow()
    expect([...projectWith({ a: true }).nodes.keys()]).toContain('/extra')
  })
})

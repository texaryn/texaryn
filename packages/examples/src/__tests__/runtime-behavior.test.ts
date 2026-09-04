// Proof that each runtime capability actually changed runtime behaviour.
//
// The schema-layer proofs assert against a projection. These have to drive
// the runtime instead: dispatch commands, then read the resulting document
// and data. A capability that only survives `project()` has not been shown to
// work in a form someone can actually use.
import { describe, it, expect } from 'vitest'
import { createFormRuntime } from '@texaryn/core'
import type {
  ContainerNode,
  FieldNode,
  FormRuntime,
  UIDocument,
  UINode,
} from '@texaryn/core'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { getExample } from '../registry.js'
import type { TexarynExample } from '../types.js'

function example(id: string): TexarynExample {
  const found = getExample(id)
  if (!found) throw new Error(`example ${id} is not registered`)
  return found
}

async function start(ex: TexarynExample): Promise<FormRuntime> {
  const port = await createJsonSchemaAdapter(ex.schema, { defaultDialect: ex.dialect })
  return createFormRuntime(port, { initialData: ex.initialData, hints: ex.hints })
}

// Data pointer is the stable way to find a node: it is what the example's
// own hints are keyed by, so the test and the fixture agree by construction.
function at(document: UIDocument, dataPointer: string): UINode {
  const found = Object.values(document.nodes).find(
    (node) => node.dataPointer === dataPointer,
  )
  if (!found) throw new Error(`no node at ${dataPointer}`)
  return found
}

function field(document: UIDocument, dataPointer: string): FieldNode {
  return at(document, dataPointer) as FieldNode
}

function container(document: UIDocument, dataPointer: string): ContainerNode {
  return at(document, dataPointer) as ContainerNode
}

describe('UI hints reach the compiled document', () => {
  it('puts the widget hint on the node so a renderer can act on it', async () => {
    const runtime = await start(example('ui-hint-widget'))
    expect(field(runtime.document.getSnapshot(), '/body').widget).toBe('textarea')
    runtime.destroy()
  })

  it('puts placeholder and help text on the node', async () => {
    const runtime = await start(example('ui-hint-placeholder-help'))
    const document = runtime.document.getSnapshot()

    expect(field(document, '/handle').placeholder).toBe('ada')
    expect(field(document, '/website').placeholder).toBe('https://example.com')
    expect(field(document, '/website').helpText).toBe('Include the scheme.')
    runtime.destroy()
  })

  it('opts an array into reordering only when the hint says so', async () => {
    const withHint = await start(example('ui-hint-array'))
    expect(container(withHint.document.getSnapshot(), '/tracks').arrayMeta?.canReorder).toBe(true)
    withHint.destroy()

    const withoutHint = await start(example('runtime-array-interactions'))
    expect(container(withoutHint.document.getSnapshot(), '/items').arrayMeta?.canReorder).toBe(
      false,
    )
    withoutHint.destroy()
  })

  it('records the item key hint on the array', async () => {
    const runtime = await start(example('ui-hint-array'))
    expect(container(runtime.document.getSnapshot(), '/tracks').arrayMeta?.itemKey).toBe('/id')
    runtime.destroy()
  })
})

describe('array commands change the document and the data', () => {
  it('adds a row', async () => {
    const runtime = await start(example('runtime-array-interactions'))
    const items = container(runtime.document.getSnapshot(), '/items')

    runtime.dispatch({ type: 'InsertItem', containerId: items.id, index: 2, value: 'eggs' })

    expect((runtime.data.getSnapshot() as { items: string[] }).items).toEqual([
      'milk',
      'bread',
      'eggs',
    ])
    runtime.destroy()
  })

  it('removes a row', async () => {
    const runtime = await start(example('runtime-array-interactions'))
    const items = container(runtime.document.getSnapshot(), '/items')

    runtime.dispatch({ type: 'RemoveItem', containerId: items.id, index: 0 })

    expect((runtime.data.getSnapshot() as { items: string[] }).items).toEqual(['bread'])
    runtime.destroy()
  })

  it('exposes one item id per row', async () => {
    const runtime = await start(example('runtime-array-interactions'))
    const before = container(runtime.document.getSnapshot(), '/items')
    expect(before.arrayMeta?.itemIds).toHaveLength(2)

    runtime.dispatch({ type: 'RemoveItem', containerId: before.id, index: 0 })

    const after = container(runtime.document.getSnapshot(), '/items')
    expect(after.arrayMeta?.itemIds).toHaveLength(1)
    runtime.destroy()
  })

  // Pins the current behaviour, which is not yet the intended one. The command
  // handler reconciles identity into `state.identities`, but the compiler
  // rebuilds `arrayMeta.itemIds` from a fresh context on every compile, so the
  // document hands a renderer positional ids: removing the first row moves the
  // survivor from item_1 to item_0. That is why the capability is marked
  // partial. This test fails, deliberately and usefully, the moment the
  // document starts carrying the reconciled ids.
  it('currently renumbers item ids positionally rather than preserving them', async () => {
    const runtime = await start(example('runtime-array-interactions'))
    const before = container(runtime.document.getSnapshot(), '/items')
    const survivor = before.arrayMeta?.itemIds[1]

    runtime.dispatch({ type: 'RemoveItem', containerId: before.id, index: 0 })

    const after = container(runtime.document.getSnapshot(), '/items')
    expect(after.arrayMeta?.itemIds[0]).not.toBe(survivor)
    expect(after.arrayMeta?.itemIds[0]).toBe(before.arrayMeta?.itemIds[0])
    runtime.destroy()
  })
})

describe('binding preserves value types', () => {
  it('keeps numeric fields numeric through a set', async () => {
    const runtime = await start(example('runtime-numeric-coercion'))
    const count = field(runtime.document.getSnapshot(), '/count')

    runtime.dispatch({ type: 'SetValue', nodeId: count.id, value: 7 })

    const data = runtime.data.getSnapshot() as { count: unknown }
    expect(typeof data.count).toBe('number')
    expect(data.count).toBe(7)
    runtime.destroy()
  })

  it('keeps a numeric enum numeric and still schema valid', async () => {
    const ex = example('runtime-enum-preservation')
    const runtime = await start(ex)
    const level = field(runtime.document.getSnapshot(), '/level')

    // A select hands back "3"; storing that string would silently break the
    // schema, which is what this capability exists to prevent.
    expect(level.enumValues?.map((option) => option.value)).toEqual([1, 2, 3])

    runtime.dispatch({ type: 'SetValue', nodeId: level.id, value: 3 })

    const data = runtime.data.getSnapshot() as { level: unknown }
    expect(typeof data.level).toBe('number')

    const port = await createJsonSchemaAdapter(ex.schema, {})
    expect((await port.validate(data)).errors).toEqual([])
    runtime.destroy()
  })
})

describe('submission validates before it proceeds', () => {
  it('does not report an invalid form as submitted', async () => {
    const runtime = await start(example('runtime-submission'))

    runtime.dispatch({ type: 'Submit' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(
      runtime.submission.getSnapshot().status,
      'an invalid form should never reach submitted',
    ).not.toBe('submitted')
    runtime.destroy()
  })

  it('leaves validating for a valid form', async () => {
    const ex = example('runtime-submission')
    const port = await createJsonSchemaAdapter(ex.schema, {})
    const runtime = createFormRuntime(port, { initialData: { email: 'ada@example.com' } })

    runtime.dispatch({ type: 'Submit' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(runtime.submission.getSnapshot().status).not.toBe('validating')
    runtime.destroy()
  })
})

describe('validation triggers decide when errors appear', () => {
  // showErrors is the signal a renderer acts on: it is the difference between
  // "this field is invalid" and "now is the moment to say so".
  it('keeps a submit-triggered field from showing errors while it is edited', async () => {
    const runtime = await start(example('runtime-validation-triggers'))
    const onSubmit = field(runtime.document.getSnapshot(), '/onSubmit')

    runtime.dispatch({ type: 'SetValue', nodeId: onSubmit.id, value: 'x' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(
      runtime.getNodeState(onSubmit.id)?.showErrors.getSnapshot(),
      'submit-triggered fields stay quiet while typing',
    ).toBe(false)
    runtime.destroy()
  })

  it('carries a distinct trigger for each field', async () => {
    const ex = example('runtime-validation-triggers')
    expect(ex.hints?.['/onChange']).toEqual({ validationTrigger: 'change' })
    expect(ex.hints?.['/onBlur']).toEqual({ validationTrigger: 'blur' })
    expect(ex.hints?.['/onSubmit']).toEqual({ validationTrigger: 'submit' })

    const runtime = await start(ex)
    const document = runtime.document.getSnapshot()
    expect(field(document, '/onChange')).toBeDefined()
    expect(field(document, '/onBlur')).toBeDefined()
    expect(field(document, '/onSubmit')).toBeDefined()
    runtime.destroy()
  })
})

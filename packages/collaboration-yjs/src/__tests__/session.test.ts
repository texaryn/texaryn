import { afterEach, describe, expect, it, vi } from 'vitest'
import * as Y from 'yjs'
import { createJsonSchemaAdapter } from '@texaryn/schema-json'
import { createFormRuntime } from '@texaryn/core'
import type { FormRuntime, NodeId, SchemaEvaluationPort } from '@texaryn/core'
import { createYjsFormSession } from '../index.js'

const cleanups: Array<() => void> = []

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
})

async function createRuntime(schema: Record<string, unknown>, initialData: unknown): Promise<FormRuntime> {
  const adapter = await createJsonSchemaAdapter(schema)
  const runtime = createFormRuntime(adapter, { initialData, initialization: 'none' })
  cleanups.push(() => runtime.destroy())
  return runtime
}

function fieldId(runtime: FormRuntime, pointer: string): NodeId {
  const node = Object.values(runtime.document.getSnapshot().nodes).find(
    (candidate) => candidate.type === 'field' && candidate.dataPointer === pointer,
  )
  if (!node) throw new Error(`No field is active at ${pointer}.`)
  return node.id
}

function makeDoc(): Y.Doc {
  const doc = new Y.Doc()
  cleanups.push(() => doc.destroy())
  return doc
}

function sync(source: Y.Doc, target: Y.Doc): void {
  Y.applyUpdate(target, Y.encodeStateAsUpdate(source), { kind: 'test-sync' })
}

const profileSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    city: { type: 'string' },
  },
}

describe('Yjs scalar form sessions', () => {
  it('merges edits to separate pointers between two documents', async () => {
    const initial = { name: 'Ada', city: 'London' }
    const leftRuntime = await createRuntime(profileSchema, initial)
    const rightRuntime = await createRuntime(profileSchema, initial)
    const leftDoc = makeDoc()
    const rightDoc = makeDoc()
    const left = createYjsFormSession(leftRuntime, { doc: leftDoc, schemaVersion: 'profile:1' })
    const right = createYjsFormSession(rightRuntime, { doc: rightDoc, schemaVersion: 'profile:1' })
    cleanups.push(() => left.close(), () => right.close())

    expect(left.status.getSnapshot().status).toBe('ready')
    expect(right.status.getSnapshot().status).toBe('ready')
    sync(leftDoc, rightDoc)
    sync(rightDoc, leftDoc)

    leftRuntime.dispatch({ type: 'SetValue', nodeId: fieldId(leftRuntime, '/name'), value: 'Grace' })
    rightRuntime.dispatch({ type: 'SetValue', nodeId: fieldId(rightRuntime, '/city'), value: 'New York' })
    sync(leftDoc, rightDoc)
    sync(rightDoc, leftDoc)

    expect(leftRuntime.data.getSnapshot()).toEqual({ name: 'Grace', city: 'New York' })
    expect(rightRuntime.data.getSnapshot()).toEqual({ name: 'Grace', city: 'New York' })
  })

  it('converges concurrent writes to the same pointer', async () => {
    const initial = { name: 'Ada', city: 'London' }
    const leftRuntime = await createRuntime(profileSchema, initial)
    const rightRuntime = await createRuntime(profileSchema, initial)
    const leftDoc = makeDoc()
    const rightDoc = makeDoc()
    const left = createYjsFormSession(leftRuntime, { doc: leftDoc, schemaVersion: 'profile:1' })
    const right = createYjsFormSession(rightRuntime, { doc: rightDoc, schemaVersion: 'profile:1' })
    cleanups.push(() => left.close(), () => right.close())
    sync(leftDoc, rightDoc)
    sync(rightDoc, leftDoc)

    leftRuntime.dispatch({ type: 'SetValue', nodeId: fieldId(leftRuntime, '/name'), value: 'Grace' })
    rightRuntime.dispatch({ type: 'SetValue', nodeId: fieldId(rightRuntime, '/name'), value: 'Katherine' })
    sync(leftDoc, rightDoc)
    sync(rightDoc, leftDoc)

    expect(leftRuntime.data.getSnapshot()).toEqual(rightRuntime.data.getSnapshot())
    expect(['Grace', 'Katherine']).toContain((leftRuntime.data.getSnapshot() as { name: string }).name)
  })

  it('shares schema-invalid scalar values for normal validation to handle', async () => {
    const initial = { name: 'Ada', city: 'London' }
    const leftRuntime = await createRuntime(profileSchema, initial)
    const rightRuntime = await createRuntime(profileSchema, initial)
    const leftDoc = makeDoc()
    const rightDoc = makeDoc()
    const left = createYjsFormSession(leftRuntime, { doc: leftDoc, schemaVersion: 'profile:1' })
    const right = createYjsFormSession(rightRuntime, { doc: rightDoc, schemaVersion: 'profile:1' })
    cleanups.push(() => left.close(), () => right.close())
    sync(leftDoc, rightDoc)
    sync(rightDoc, leftDoc)

    leftRuntime.dispatch({ type: 'SetValue', nodeId: fieldId(leftRuntime, '/name'), value: 42 })
    sync(leftDoc, rightDoc)

    expect(leftRuntime.data.getSnapshot()).toEqual({ name: 42, city: 'London' })
    expect(rightRuntime.data.getSnapshot()).toEqual({ name: 42, city: 'London' })
  })

  it('observes a committed edit when a store subscriber throws', async () => {
    const runtime = await createRuntime(profileSchema, { name: 'Ada', city: 'London' })
    const doc = makeDoc()
    const session = createYjsFormSession(runtime, { doc, schemaVersion: 'profile:1' })
    cleanups.push(() => session.close())
    const unsubscribe = runtime.data.subscribe(() => { throw new Error('subscriber failed') })
    cleanups.push(unsubscribe)

    expect(() => runtime.dispatch({
      type: 'SetValue',
      nodeId: fieldId(runtime, '/name'),
      value: 'Grace',
    })).toThrow('subscriber failed')

    expect(doc.getMap('texaryn-form-v1').get('value:/name')).toBe('Grace')
    expect(runtime.data.getSnapshot()).toEqual({ name: 'Grace', city: 'London' })
    expect(session.status.getSnapshot().status).toBe('ready')
  })

  it('observes a committed edit when resetting pending validation notifies a throwing subscriber', async () => {
    const adapter = await createJsonSchemaAdapter(profileSchema)
    const port: SchemaEvaluationPort = {
      project: (data, options) => adapter.project(data, options),
      validate: () => new Promise(() => undefined),
    }
    const runtime = createFormRuntime(port, {
      initialData: { name: 'Ada', city: 'London' },
    })
    cleanups.push(() => runtime.destroy())
    const doc = makeDoc()
    const session = createYjsFormSession(runtime, { doc, schemaVersion: 'profile:1' })
    cleanups.push(() => session.close())
    runtime.dispatch({ type: 'Submit' })
    const validationStatus = runtime.getNodeState(fieldId(runtime, '/name'))!.validationStatus
    expect(validationStatus.getSnapshot()).toBe('pending')
    const unsubscribe = validationStatus.subscribe(() => {
      if (validationStatus.getSnapshot() === 'idle') throw new Error('pending reset subscriber failed')
    })
    cleanups.push(unsubscribe)

    expect(() => runtime.dispatch({
      type: 'SetValue',
      nodeId: fieldId(runtime, '/name'),
      value: 'Grace',
    })).toThrow('pending reset subscriber failed')

    expect(runtime.data.getSnapshot()).toEqual({ name: 'Grace', city: 'London' })
    expect(doc.getMap('texaryn-form-v1').get('value:/name')).toBe('Grace')
  })

  it('retains an override while its conditional field is hidden', async () => {
    const schema = {
      type: 'object',
      properties: { mode: { type: 'string', enum: ['a', 'b'] } },
      if: { properties: { mode: { const: 'b' } }, required: ['mode'] },
      then: { properties: { b: { type: 'string', default: 'branch default' } } },
      else: { properties: { a: { type: 'string' } } },
    }
    const initial = { mode: 'a', a: 'A', b: 'B' }
    const leftRuntime = await createRuntime(schema, initial)
    const rightRuntime = await createRuntime(schema, initial)
    const leftDoc = makeDoc()
    const rightDoc = makeDoc()
    const left = createYjsFormSession(leftRuntime, { doc: leftDoc, schemaVersion: 'branch:1' })
    const right = createYjsFormSession(rightRuntime, { doc: rightDoc, schemaVersion: 'branch:1' })
    cleanups.push(() => left.close(), () => right.close())
    sync(leftDoc, rightDoc)
    sync(rightDoc, leftDoc)

    leftRuntime.dispatch({ type: 'SetValue', nodeId: fieldId(leftRuntime, '/mode'), value: 'b' })
    leftRuntime.dispatch({ type: 'SetValue', nodeId: fieldId(leftRuntime, '/b'), value: 'shared branch value' })
    leftRuntime.dispatch({ type: 'SetValue', nodeId: fieldId(leftRuntime, '/mode'), value: 'a' })
    sync(leftDoc, rightDoc)
    sync(rightDoc, leftDoc)

    expect(rightRuntime.data.getSnapshot()).toEqual({ mode: 'a', a: 'A', b: 'shared branch value' })
    const inactiveField = Object.values(rightRuntime.document.getSnapshot().nodes).find(
      (node) => node.type === 'field' && node.dataPointer === '/b',
    )
    expect(inactiveField?.visible).toBe(false)

    rightRuntime.dispatch({ type: 'SetValue', nodeId: fieldId(rightRuntime, '/mode'), value: 'b' })
    expect(rightRuntime.data.getSnapshot()).toEqual({ mode: 'b', a: 'A', b: 'shared branch value' })
    expect(rightRuntime.initializationPolicy).toBe('none')
  })

  it('keeps local interaction history while applying a remote snapshot', async () => {
    const initial = { name: 'Ada', city: 'London' }
    const leftRuntime = await createRuntime(profileSchema, initial)
    const rightRuntime = await createRuntime(profileSchema, initial)
    const leftDoc = makeDoc()
    const rightDoc = makeDoc()
    const left = createYjsFormSession(leftRuntime, { doc: leftDoc, schemaVersion: 'profile:1' })
    const right = createYjsFormSession(rightRuntime, { doc: rightDoc, schemaVersion: 'profile:1' })
    cleanups.push(() => left.close(), () => right.close())
    sync(leftDoc, rightDoc)
    sync(rightDoc, leftDoc)

    const nameId = fieldId(rightRuntime, '/name')
    const cityId = fieldId(rightRuntime, '/city')
    rightRuntime.dispatch({ type: 'SetTouched', nodeId: nameId })
    rightRuntime.dispatch({ type: 'SetValue', nodeId: cityId, value: 'Paris' })
    sync(rightDoc, leftDoc)
    sync(leftDoc, rightDoc)
    leftRuntime.dispatch({ type: 'SetValue', nodeId: fieldId(leftRuntime, '/name'), value: 'Grace' })
    sync(leftDoc, rightDoc)

    expect(rightRuntime.data.getSnapshot()).toEqual({ name: 'Grace', city: 'Paris' })
    expect(rightRuntime.getNodeState(nameId)?.touched.getSnapshot()).toBe(true)
    expect(rightRuntime.getNodeState(cityId)?.dirty.getSnapshot()).toBe(true)
  })

  it('does not apply branch defaults after the shared baseline is established', async () => {
    const schema = {
      type: 'object',
      properties: { mode: { type: 'string', enum: ['a', 'b'] } },
      if: { properties: { mode: { const: 'b' } }, required: ['mode'] },
      then: { properties: { b: { type: 'string', default: 'branch default' } } },
      else: { properties: { a: { type: 'string' } } },
    }
    const initial = { mode: 'a', a: 'A' }
    const runtime = await createRuntime(schema, initial)
    const doc = makeDoc()
    const session = createYjsFormSession(runtime, { doc, schemaVersion: 'branch:1' })
    cleanups.push(() => session.close())

    runtime.dispatch({ type: 'SetValue', nodeId: fieldId(runtime, '/mode'), value: 'b' })

    expect(runtime.data.getSnapshot()).toEqual({ mode: 'b', a: 'A' })
    expect(session.status.getSnapshot().status).toBe('ready')
    expect(doc.getMap('texaryn-form-v1').has('value:/b')).toBe(false)
  })

  it('requires schema defaults to be disabled', async () => {
    const adapter = await createJsonSchemaAdapter(profileSchema)
    const runtime = createFormRuntime(adapter, {
      initialData: { name: 'Ada', city: 'London' },
      initialization: 'schema-defaults',
    })
    cleanups.push(() => runtime.destroy())
    const doc = makeDoc()

    const session = createYjsFormSession(runtime, { doc, schemaVersion: 'profile:1' })
    cleanups.push(() => session.close())

    expect(session.status.getSnapshot().status).toBe('failed')
    expect(doc.getMap('texaryn-form-v1').size).toBe(0)
  })

  it('rejects edits that exceed the combined materialized snapshot limit', async () => {
    const initial = { name: 'n'.repeat(600_000), city: 'c'.repeat(300_000) }
    const runtime = await createRuntime(profileSchema, initial)
    const doc = makeDoc()
    const onCommandRejected = vi.fn()
    const session = createYjsFormSession(runtime, {
      doc,
      schemaVersion: 'profile:1',
      onCommandRejected,
    })
    cleanups.push(() => session.close())

    runtime.dispatch({
      type: 'SetValue',
      nodeId: fieldId(runtime, '/city'),
      value: 'x'.repeat(600_000),
    })

    expect(runtime.data.getSnapshot()).toEqual(initial)
    expect(doc.getMap('texaryn-form-v1').has('value:/city')).toBe(false)
    expect(onCommandRejected).toHaveBeenCalledOnce()
    expect(session.status.getSnapshot().status).toBe('ready')
  })

  it('does not retain caller mutations to an applied remote snapshot', async () => {
    const initial = { name: 'Ada', city: 'London' }
    const runtime = await createRuntime(profileSchema, initial)
    const doc = makeDoc()
    const session = createYjsFormSession(runtime, { doc, schemaVersion: 'profile:1' })
    cleanups.push(() => session.close())
    const incoming = { name: 'Grace', city: 'Paris' }

    runtime.applyRemoteSnapshot(incoming)
    incoming.name = 'changed after apply'
    incoming.city = 'also changed'

    expect(runtime.data.getSnapshot()).toEqual({ name: 'Grace', city: 'Paris' })
    expect(doc.getMap('texaryn-form-v1').get('value:/name')).toBe('Grace')
    expect(doc.getMap('texaryn-form-v1').get('value:/city')).toBe('Paris')
  })

  it('reports remote notification errors without detaching the session', async () => {
    const initial = { name: 'Ada', city: 'London' }
    const leftRuntime = await createRuntime(profileSchema, initial)
    const rightRuntime = await createRuntime(profileSchema, initial)
    const leftDoc = makeDoc()
    const rightDoc = makeDoc()
    const left = createYjsFormSession(leftRuntime, { doc: leftDoc, schemaVersion: 'profile:1' })
    const onNotificationError = vi.fn()
    const right = createYjsFormSession(rightRuntime, {
      doc: rightDoc,
      schemaVersion: 'profile:1',
      onNotificationError,
    })
    cleanups.push(() => left.close(), () => right.close())
    sync(leftDoc, rightDoc)
    sync(rightDoc, leftDoc)
    const unsubscribe = rightRuntime.data.subscribe(() => { throw new Error('remote data subscriber failed') })
    cleanups.push(unsubscribe)

    leftRuntime.dispatch({ type: 'SetValue', nodeId: fieldId(leftRuntime, '/name'), value: 'Grace' })
    sync(leftDoc, rightDoc)

    expect(rightRuntime.data.getSnapshot()).toEqual({ name: 'Grace', city: 'London' })
    expect(right.status.getSnapshot()).toMatchObject({ status: 'ready', lastNotificationError: expect.any(Error) })
    expect(onNotificationError).toHaveBeenCalledOnce()
  })

  it('rejects structural commands and locks array controls while attached', async () => {
    const runtime = await createRuntime({
      type: 'object',
      properties: {
        name: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
    }, { name: 'Ada', tags: ['math'] })
    const doc = makeDoc()
    const onCommandRejected = vi.fn()
    const session = createYjsFormSession(runtime, {
      doc,
      schemaVersion: 'profile:1',
      onCommandRejected,
    })
    cleanups.push(() => session.close())
    const arrayNode = Object.values(runtime.document.getSnapshot().nodes).find(
      (node) => node.type === 'container' && node.containerType === 'array',
    )
    if (!arrayNode || arrayNode.type !== 'container') throw new Error('Missing array container.')

    expect(arrayNode.arrayMeta?.canAdd).toBe(false)
    expect(arrayNode.arrayMeta?.canRemove).toBe(false)
    expect(arrayNode.arrayMeta?.canReorder).toBe(false)
    runtime.dispatch({ type: 'InsertItem', containerId: arrayNode.id, index: 1, value: 'logic' })
    runtime.dispatch({ type: 'Reset' })

    expect(runtime.data.getSnapshot()).toEqual({ name: 'Ada', tags: ['math'] })
    expect(onCommandRejected).toHaveBeenCalledTimes(2)
    expect(session.status.getSnapshot().status).toBe('ready')
  })

  it('stops when a remote override does not name a baseline scalar', async () => {
    const initial = { name: 'Ada', city: 'London' }
    const runtime = await createRuntime(profileSchema, initial)
    const doc = makeDoc()
    const session = createYjsFormSession(runtime, { doc, schemaVersion: 'profile:1' })
    cleanups.push(() => session.close())

    doc.getMap('texaryn-form-v1').set('value:/missing', 'unexpected')

    expect(session.status.getSnapshot().status).toBe('failed')
    expect(runtime.data.getSnapshot()).toEqual(initial)
    expect(doc.getMap('texaryn-form-v1').has('manifest')).toBe(true)
  })

  it('stops on a schema version mismatch without changing runtime data', async () => {
    const initial = { name: 'Ada', city: 'London' }
    const firstRuntime = await createRuntime(profileSchema, initial)
    const secondRuntime = await createRuntime(profileSchema, initial)
    const doc = makeDoc()
    const first = createYjsFormSession(firstRuntime, { doc, schemaVersion: 'profile:1' })
    cleanups.push(() => first.close())
    const second = createYjsFormSession(secondRuntime, { doc, schemaVersion: 'profile:2' })
    cleanups.push(() => second.close())

    expect(first.status.getSnapshot().status).toBe('ready')
    expect(second.status.getSnapshot().status).toBe('failed')
    expect(secondRuntime.data.getSnapshot()).toEqual(initial)
  })
})

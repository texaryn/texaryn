import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFormRuntime } from '../runtime.js'
import type { SchemaEvaluationPort, SchemaProjection, NodeProjection, ChildProjection } from '../../schema/port.js'
import type { JsonPointer, NodeId, ValidationResult, MaybePromise } from '../../types.js'

function toPointer(s: string): JsonPointer { return s as JsonPointer }

function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void } {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function makeProjection(
  entries: Array<[string, Partial<NodeProjection> & { children?: ChildProjection[] }]>,
): SchemaProjection {
  const nodes = new Map<JsonPointer, NodeProjection>()
  for (const [pointer, partial] of entries) {
    nodes.set(toPointer(pointer), {
      type: partial.type ?? 'string',
      constraints: partial.constraints ?? {},
      active: partial.active ?? true,
      annotations: partial.annotations ?? {},
      children: partial.children,
      enumValues: partial.enumValues,
      format: partial.format,
    })
  }
  return { nodes }
}

function makePort(
  projectionFn: (data: unknown) => SchemaProjection,
  validateFn?: (data: unknown) => MaybePromise<ValidationResult>,
): SchemaEvaluationPort {
  return {
    project: projectionFn,
    validate: validateFn ?? (() => ({ valid: true, errors: [] })),
  }
}

function makeAsyncPort(deferred: { promise: Promise<ValidationResult> }): SchemaEvaluationPort {
  return makePort(() => simpleProjection, () => deferred.promise)
}

const simpleProjection = makeProjection([
  ['', {
    type: 'object',
    children: [
      { pointer: toPointer('/name'), key: 'name', required: true },
      { pointer: toPointer('/age'), key: 'age', required: false },
    ],
  }],
  ['/name', { type: 'string', annotations: { title: 'Name' } }],
  ['/age', { type: 'integer', annotations: { title: 'Age' } }],
])

function findFieldNode(runtime: ReturnType<typeof createFormRuntime>, dataPointer: string): NodeId {
  const doc = runtime.document.getSnapshot()
  const entry = Object.entries(doc.nodes).find(
    ([, n]) => n.dataPointer === dataPointer,
  )
  if (!entry) throw new Error(`No node with dataPointer ${dataPointer}`)
  return entry[0] as NodeId
}

// Unlike simpleProjection, this reprojects on every call so that array item
// pointers ('/tags/0', '/tags/1', ...) exist for however many items are
// currently in the data, letting the compiler emit a real child node per item.
function makeArrayPort(
  validateFn?: (data: unknown) => MaybePromise<ValidationResult>,
): SchemaEvaluationPort {
  return makePort((data) => {
    const tags = ((data as Record<string, unknown> | undefined)?.tags as unknown[] | undefined) ?? []
    const entries: Array<[string, Partial<NodeProjection> & { children?: ChildProjection[] }]> = [
      ['', {
        type: 'object',
        children: [{ pointer: toPointer('/tags'), key: 'tags', required: false }],
      }],
      ['/tags', { type: 'array' }],
    ]
    for (let i = 0; i < tags.length; i++) {
      entries.push([`/tags/${i}`, { type: 'string' }])
    }
    return makeProjection(entries)
  }, validateFn)
}

async function flushMicrotasks(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve()
  }
}

function findArrayContainerId(runtime: ReturnType<typeof createFormRuntime>): NodeId {
  const doc = runtime.document.getSnapshot()
  const entry = Object.values(doc.nodes).find(
    (n) => n.type === 'container' && n.containerType === 'array',
  )
  if (!entry) throw new Error('No array container node found')
  return entry.id
}

describe('FormRuntime', () => {
  it('creates initial document from projection', () => {
    const port = makePort(() => simpleProjection)
    const runtime = createFormRuntime(port, { initialData: { name: 'Alice', age: 30 } })
    const doc = runtime.document.getSnapshot()
    expect(doc.version).toBe(1)
    expect(doc.rootId).toBeDefined()
    expect(Object.keys(doc.nodes).length).toBe(3)
    runtime.destroy()
  })

  it('initializes node stores with data values', () => {
    const port = makePort(() => simpleProjection)
    const runtime = createFormRuntime(port, { initialData: { name: 'Alice', age: 30 } })
    const nameId = findFieldNode(runtime, '/name')
    const state = runtime.getNodeState(nameId)!
    expect(state.value.getSnapshot()).toBe('Alice')
    expect(state.dirty.getSnapshot()).toBe(false)
    expect(state.touched.getSnapshot()).toBe(false)
    expect(state.visible.getSnapshot()).toBe(true)
    expect(state.disabled.getSnapshot()).toBe(false)
    expect(state.validationStatus.getSnapshot()).toBe('idle')
    expect(state.errors.getSnapshot()).toEqual([])
    runtime.destroy()
  })

  it('dispatch SetValue updates value and data stores', () => {
    const port = makePort(() => simpleProjection)
    const runtime = createFormRuntime(port, { initialData: { name: '', age: 0 } })
    const nameId = findFieldNode(runtime, '/name')
    runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Bob' })
    expect(runtime.getNodeState(nameId)!.value.getSnapshot()).toBe('Bob')
    expect((runtime.data.getSnapshot() as Record<string, unknown>).name).toBe('Bob')
    runtime.destroy()
  })

  it('dispatch SetValue marks dirty', () => {
    const port = makePort(() => simpleProjection)
    const runtime = createFormRuntime(port, { initialData: { name: '' } })
    const nameId = findFieldNode(runtime, '/name')
    runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Bob' })
    expect(runtime.getNodeState(nameId)!.dirty.getSnapshot()).toBe(true)
    runtime.destroy()
  })

  it('dispatch SetTouched marks touched', () => {
    const port = makePort(() => simpleProjection)
    const runtime = createFormRuntime(port, { initialData: { name: '' } })
    const nameId = findFieldNode(runtime, '/name')
    runtime.dispatch({ type: 'SetTouched', nodeId: nameId })
    expect(runtime.getNodeState(nameId)!.touched.getSnapshot()).toBe(true)
    runtime.destroy()
  })

  it('dispatch SetValue triggers recompile and updates visible stores', () => {
    let callCount = 0
    const port = makePort((data) => {
      callCount++
      const toggled = (data as Record<string, unknown>).toggle === true
      return makeProjection([
        ['', {
          type: 'object',
          children: [
            { pointer: toPointer('/toggle'), key: 'toggle', required: false },
            { pointer: toPointer('/extra'), key: 'extra', required: false },
          ],
        }],
        ['/toggle', { type: 'boolean' }],
        ['/extra', { type: 'string', active: toggled }],
      ])
    })
    const runtime = createFormRuntime(port, { initialData: { toggle: false } })
    const extraId = findFieldNode(runtime, '/extra')
    expect(runtime.getNodeState(extraId)!.visible.getSnapshot()).toBe(false)

    const toggleId = findFieldNode(runtime, '/toggle')
    runtime.dispatch({ type: 'SetValue', nodeId: toggleId, value: true })
    expect(runtime.getNodeState(extraId)!.visible.getSnapshot()).toBe(true)
    expect(callCount).toBeGreaterThanOrEqual(2)
    runtime.destroy()
  })

  it('dispatch Submit triggers validation and updates error stores on failure', async () => {
    const port = makePort(
      () => simpleProjection,
      () => ({
        valid: false,
        errors: [{
          instancePointer: '/name',
          keyword: 'minLength',
          message: 'Must not be empty',
          params: {},
        }],
      }),
    )
    const runtime = createFormRuntime(port, { initialData: { name: '' } })
    runtime.dispatch({ type: 'Submit' })
    await vi.waitFor(() => {
      const nameId = findFieldNode(runtime, '/name')
      expect(runtime.getNodeState(nameId)!.errors.getSnapshot().length).toBeGreaterThan(0)
    })
    const nameId = findFieldNode(runtime, '/name')
    expect(runtime.getNodeState(nameId)!.validationStatus.getSnapshot()).toBe('invalid')
    expect(runtime.submission.getSnapshot().status).toBe('idle')
    runtime.destroy()
  })

  it('dispatch Submit calls onSubmit when valid', async () => {
    let submitted = false
    const port = makePort(
      () => simpleProjection,
      () => ({ valid: true, errors: [] }),
    )
    const runtime = createFormRuntime(port, {
      initialData: { name: 'Alice' },
      onSubmit: async () => { submitted = true },
    })
    runtime.dispatch({ type: 'Submit' })
    await vi.waitFor(() => {
      expect(runtime.submission.getSnapshot().status).toBe('submitted')
    })
    expect(submitted).toBe(true)
    runtime.destroy()
  })

  it('dispatch Reset restores initial state', () => {
    const port = makePort(() => simpleProjection)
    const runtime = createFormRuntime(port, { initialData: { name: 'Alice', age: 30 } })
    const nameId = findFieldNode(runtime, '/name')
    runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Bob' })
    expect(runtime.getNodeState(nameId)!.value.getSnapshot()).toBe('Bob')
    runtime.dispatch({ type: 'Reset' })
    expect(runtime.getNodeState(nameId)!.value.getSnapshot()).toBe('Alice')
    expect(runtime.getNodeState(nameId)!.dirty.getSnapshot()).toBe(false)
    runtime.destroy()
  })

  it('store subscribers fire on dispatch', () => {
    const port = makePort(() => simpleProjection)
    const runtime = createFormRuntime(port, { initialData: { name: '' } })
    const nameId = findFieldNode(runtime, '/name')
    let notified = false
    runtime.getNodeState(nameId)!.value.subscribe(() => { notified = true })
    runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Bob' })
    expect(notified).toBe(true)
    runtime.destroy()
  })

  it('returns undefined for unknown nodeId', () => {
    const port = makePort(() => simpleProjection)
    const runtime = createFormRuntime(port, { initialData: {} })
    expect(runtime.getNodeState('nonexistent' as NodeId)).toBeUndefined()
    runtime.destroy()
  })

  it('resyncs node values after InsertItem shifts array positions', () => {
    const port = makeArrayPort()
    const runtime = createFormRuntime(port, { initialData: { tags: ['a', 'b'] } })
    const arrayId = findArrayContainerId(runtime)

    const item1IdBefore = findFieldNode(runtime, '/tags/1')
    expect(runtime.getNodeState(item1IdBefore)!.value.getSnapshot()).toBe('b')

    runtime.dispatch({ type: 'InsertItem', containerId: arrayId, index: 0, value: 'z' })

    // Same node id: traversal order assigns ids by position, so index 1
    // keeps the id it always had, but it now points at the item that used
    // to sit at index 0 ('a'), not the value it held before the insert.
    const item1IdAfter = findFieldNode(runtime, '/tags/1')
    expect(item1IdAfter).toBe(item1IdBefore)
    expect(runtime.getNodeState(item1IdAfter)!.value.getSnapshot()).toBe('a')

    const item0Id = findFieldNode(runtime, '/tags/0')
    expect(runtime.getNodeState(item0Id)!.value.getSnapshot()).toBe('z')
    const item2Id = findFieldNode(runtime, '/tags/2')
    expect(runtime.getNodeState(item2Id)!.value.getSnapshot()).toBe('b')

    runtime.destroy()
  })

  it('drops stale node stores after RemoveItem shrinks the array', () => {
    const port = makeArrayPort()
    const runtime = createFormRuntime(port, { initialData: { tags: ['a', 'b', 'c'] } })
    const arrayId = findArrayContainerId(runtime)

    const item2Id = findFieldNode(runtime, '/tags/2')
    expect(runtime.getNodeState(item2Id)).toBeDefined()

    runtime.dispatch({ type: 'RemoveItem', containerId: arrayId, index: 0 })

    // Only two items remain, so the trailing id that used to back index 2
    // no longer appears in the document and its store should be collected.
    expect(runtime.getNodeState(item2Id)).toBeUndefined()

    const item1Id = findFieldNode(runtime, '/tags/1')
    expect(runtime.getNodeState(item1Id)!.value.getSnapshot()).toBe('c')

    runtime.destroy()
  })
})

describe('FormRuntime validation scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('blur trigger validates on SetTouched when hint is blur', () => {
    const validateFn = vi.fn(() => ({
      valid: false,
      errors: [{ instancePointer: '/name', keyword: 'minLength', params: {} }],
    }))
    const port = makePort(() => simpleProjection, validateFn)
    const runtime = createFormRuntime(port, {
      initialData: { name: '' },
      hints: { '/name': { validationTrigger: 'blur' } },
    })
    const nameId = findFieldNode(runtime, '/name')

    runtime.dispatch({ type: 'SetTouched', nodeId: nameId })

    expect(validateFn).toHaveBeenCalledTimes(1)
    expect(runtime.getNodeState(nameId)!.validationStatus.getSnapshot()).toBe('invalid')
    expect(runtime.getNodeState(nameId)!.errors.getSnapshot().length).toBe(1)
    runtime.destroy()
  })

  it('blur trigger does not validate on SetValue', () => {
    const validateFn = vi.fn(() => ({ valid: true, errors: [] }))
    const port = makePort(() => simpleProjection, validateFn)
    const runtime = createFormRuntime(port, {
      initialData: { name: '' },
      hints: { '/name': { validationTrigger: 'blur' } },
    })
    const nameId = findFieldNode(runtime, '/name')

    runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Bob' })

    expect(validateFn).not.toHaveBeenCalled()
    runtime.destroy()
  })

  it('change trigger debounces multiple SetValue into one validation', () => {
    const validateFn = vi.fn(() => ({ valid: true, errors: [] }))
    const port = makePort(() => simpleProjection, validateFn)
    const runtime = createFormRuntime(port, {
      initialData: { name: '' },
      hints: { '/name': { validationTrigger: 'change' } },
    })
    const nameId = findFieldNode(runtime, '/name')

    runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'B' })
    runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Bo' })
    runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Bob' })
    expect(validateFn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    expect(validateFn).toHaveBeenCalledTimes(1)
    runtime.destroy()
  })

  it('change trigger validates on InsertItem', () => {
    const validateFn = vi.fn(() => ({ valid: true, errors: [] }))
    const port = makeArrayPort(validateFn)
    const runtime = createFormRuntime(port, {
      initialData: { tags: ['a'] },
      hints: { '/tags': { validationTrigger: 'change' } },
    })
    const arrayId = findArrayContainerId(runtime)

    runtime.dispatch({ type: 'InsertItem', containerId: arrayId, index: 0, value: 'z' })
    expect(validateFn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    expect(validateFn).toHaveBeenCalledTimes(1)
    runtime.destroy()
  })

  it('default debounce is 300ms', () => {
    const validateFn = vi.fn(() => ({ valid: true, errors: [] }))
    const port = makePort(() => simpleProjection, validateFn)
    const runtime = createFormRuntime(port, {
      initialData: { name: '' },
      hints: { '/name': { validationTrigger: 'change' } },
    })
    const nameId = findFieldNode(runtime, '/name')

    runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Bob' })
    vi.advanceTimersByTime(299)
    expect(validateFn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(validateFn).toHaveBeenCalledTimes(1)
    runtime.destroy()
  })

  it('custom validationDebounceMs is respected', () => {
    const validateFn = vi.fn(() => ({ valid: true, errors: [] }))
    const port = makePort(() => simpleProjection, validateFn)
    const runtime = createFormRuntime(port, {
      initialData: { name: '' },
      hints: { '/name': { validationTrigger: 'change' } },
      validationDebounceMs: 50,
    })
    const nameId = findFieldNode(runtime, '/name')

    runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Bob' })
    vi.advanceTimersByTime(49)
    expect(validateFn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(validateFn).toHaveBeenCalledTimes(1)
    runtime.destroy()
  })

  it('no hint means no automatic blur/change validation', () => {
    const validateFn = vi.fn(() => ({ valid: true, errors: [] }))
    const port = makePort(() => simpleProjection, validateFn)
    const runtime = createFormRuntime(port, { initialData: { name: '' } })
    const nameId = findFieldNode(runtime, '/name')

    runtime.dispatch({ type: 'SetTouched', nodeId: nameId })
    runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Bob' })
    vi.advanceTimersByTime(1000)

    expect(validateFn).not.toHaveBeenCalled()
    runtime.destroy()
  })

  it('submit always validates regardless of hints', () => {
    const validateFn = vi.fn(() => ({ valid: true, errors: [] }))
    const port = makePort(() => simpleProjection, validateFn)
    const runtime = createFormRuntime(port, { initialData: { name: 'Alice' } })

    runtime.dispatch({ type: 'Submit' })

    expect(validateFn).toHaveBeenCalledTimes(1)
    runtime.destroy()
  })

  it('sync validation never publishes pending status', () => {
    const port = makePort(() => simpleProjection, () => ({ valid: true, errors: [] }))
    const runtime = createFormRuntime(port, {
      initialData: { name: '' },
      hints: { '/name': { validationTrigger: 'blur' } },
    })
    const nameId = findFieldNode(runtime, '/name')
    const seenStatuses: string[] = []
    runtime.getNodeState(nameId)!.validationStatus.subscribe(() => {
      seenStatuses.push(runtime.getNodeState(nameId)!.validationStatus.getSnapshot())
    })

    runtime.dispatch({ type: 'SetTouched', nodeId: nameId })

    expect(seenStatuses).not.toContain('pending')
    runtime.destroy()
  })

  it('async validation publishes pending then result', async () => {
    const def = deferred<ValidationResult>()
    const port = makeAsyncPort(def)
    const runtime = createFormRuntime(port, {
      initialData: { name: '' },
      hints: { '/name': { validationTrigger: 'blur' } },
    })
    const nameId = findFieldNode(runtime, '/name')

    runtime.dispatch({ type: 'SetTouched', nodeId: nameId })
    expect(runtime.getNodeState(nameId)!.validationStatus.getSnapshot()).toBe('pending')

    def.resolve({ valid: true, errors: [] })
    await def.promise
    await flushMicrotasks()

    expect(runtime.getNodeState(nameId)!.validationStatus.getSnapshot()).toBe('valid')
    runtime.destroy()
  })

  it('stale async result is dropped after data mutation', async () => {
    const def = deferred<ValidationResult>()
    const port = makeAsyncPort(def)
    const runtime = createFormRuntime(port, {
      initialData: { name: '' },
      hints: { '/name': { validationTrigger: 'blur' } },
    })
    const nameId = findFieldNode(runtime, '/name')

    runtime.dispatch({ type: 'SetTouched', nodeId: nameId })
    expect(runtime.getNodeState(nameId)!.validationStatus.getSnapshot()).toBe('pending')

    runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Bob' })

    def.resolve({
      valid: false,
      errors: [{ instancePointer: '/name', keyword: 'required', params: {} }],
    })
    await def.promise
    await flushMicrotasks()

    expect(runtime.getNodeState(nameId)!.errors.getSnapshot()).toEqual([])
    expect(runtime.getNodeState(nameId)!.validationStatus.getSnapshot()).toBe('idle')
    runtime.destroy()
  })

  it('Reset invalidates queued and in-flight validation', () => {
    const validateFn = vi.fn(() => ({ valid: true, errors: [] }))
    const port = makePort(() => simpleProjection, validateFn)
    const runtime = createFormRuntime(port, {
      initialData: { name: '' },
      hints: { '/name': { validationTrigger: 'change' } },
    })
    const nameId = findFieldNode(runtime, '/name')

    runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Bob' })
    runtime.dispatch({ type: 'Reset' })
    vi.advanceTimersByTime(1000)

    expect(validateFn).not.toHaveBeenCalled()
    runtime.destroy()
  })

  it("unrelated field edit does not cancel another field's queued change validation", () => {
    const validateFn = vi.fn(() => ({ valid: true, errors: [] }))
    const port = makePort(() => simpleProjection, validateFn)
    const runtime = createFormRuntime(port, {
      initialData: { name: '', age: 0 },
      hints: {
        '/name': { validationTrigger: 'change' },
        '/age': { validationTrigger: 'blur' },
      },
    })
    const nameId = findFieldNode(runtime, '/name')
    const ageId = findFieldNode(runtime, '/age')

    runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Bob' })
    vi.advanceTimersByTime(100)
    runtime.dispatch({ type: 'SetValue', nodeId: ageId, value: 30 })
    vi.advanceTimersByTime(200)

    expect(validateFn).toHaveBeenCalledTimes(1)
    runtime.destroy()
  })

  it('Reset cancels queued change validation', () => {
    const validateFn = vi.fn(() => ({ valid: true, errors: [] }))
    const port = makePort(() => simpleProjection, validateFn)
    const runtime = createFormRuntime(port, {
      initialData: { name: '' },
      hints: { '/name': { validationTrigger: 'change' } },
    })
    const nameId = findFieldNode(runtime, '/name')

    runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Bob' })
    vi.advanceTimersByTime(100)
    runtime.dispatch({ type: 'Reset' })
    vi.advanceTimersByTime(200)

    expect(validateFn).not.toHaveBeenCalled()
    runtime.destroy()
  })

  it('destroy cancels timers and prevents callbacks', () => {
    const validateFn = vi.fn(() => ({ valid: true, errors: [] }))
    const port = makePort(() => simpleProjection, validateFn)
    const runtime = createFormRuntime(port, {
      initialData: { name: '' },
      hints: { '/name': { validationTrigger: 'change' } },
    })
    const nameId = findFieldNode(runtime, '/name')

    runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Bob' })
    runtime.destroy()
    vi.advanceTimersByTime(1000)

    expect(validateFn).not.toHaveBeenCalled()
  })

  it('background blur/change result cannot advance submission to submitting', async () => {
    const submitDeferred = deferred<ValidationResult>()
    const blurDeferred = deferred<ValidationResult>()
    const queue = [submitDeferred.promise, blurDeferred.promise]
    const validateFn = vi.fn(() => queue.shift()!)
    const port = makePort(() => simpleProjection, validateFn)
    const runtime = createFormRuntime(port, {
      initialData: { name: 'Alice' },
      hints: { '/name': { validationTrigger: 'blur' } },
    })
    const nameId = findFieldNode(runtime, '/name')

    runtime.dispatch({ type: 'Submit' })
    expect(runtime.submission.getSnapshot().status).toBe('validating')

    runtime.dispatch({ type: 'SetTouched', nodeId: nameId })

    blurDeferred.resolve({ valid: true, errors: [] })
    await blurDeferred.promise
    await flushMicrotasks()

    expect(runtime.submission.getSnapshot().status).toBe('validating')

    submitDeferred.resolve({ valid: true, errors: [] })
    await submitDeferred.promise
    await flushMicrotasks()

    expect(runtime.submission.getSnapshot().status).toBe('submitted')
    runtime.destroy()
  })

  it('editing while async submit validation is running returns submission to idle', async () => {
    const def = deferred<ValidationResult>()
    const port = makeAsyncPort(def)
    const runtime = createFormRuntime(port, { initialData: { name: 'Alice' } })
    const nameId = findFieldNode(runtime, '/name')

    runtime.dispatch({ type: 'Submit' })
    expect(runtime.submission.getSnapshot().status).toBe('validating')

    runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Bob' })
    expect(runtime.submission.getSnapshot().status).toBe('idle')

    def.resolve({ valid: true, errors: [] })
    await flushMicrotasks()

    expect(runtime.submission.getSnapshot().status).toBe('idle')
    runtime.destroy()
  })

  it('rejected async validation does not leave nodes stuck in pending', async () => {
    const def = deferred<ValidationResult>()
    const port = makeAsyncPort(def)
    const runtime = createFormRuntime(port, {
      initialData: { name: '' },
      hints: { '/name': { validationTrigger: 'blur' } },
    })
    const nameId = findFieldNode(runtime, '/name')

    runtime.dispatch({ type: 'SetTouched', nodeId: nameId })
    expect(runtime.getNodeState(nameId)!.validationStatus.getSnapshot()).toBe('pending')

    def.reject(new Error('boom'))
    await def.promise.catch(() => {})
    await flushMicrotasks()

    expect(runtime.getNodeState(nameId)!.validationStatus.getSnapshot()).toBe('idle')
    runtime.destroy()
  })

  it('rejected async submit validation returns submission to idle with error', async () => {
    const def = deferred<ValidationResult>()
    const port = makeAsyncPort(def)
    const runtime = createFormRuntime(port, { initialData: { name: 'Alice' } })
    const nameId = findFieldNode(runtime, '/name')

    runtime.dispatch({ type: 'Submit' })
    expect(runtime.submission.getSnapshot().status).toBe('validating')
    expect(runtime.getNodeState(nameId)!.validationStatus.getSnapshot()).toBe('pending')

    const error = new Error('validation service down')
    def.reject(error)
    await def.promise.catch(() => {})
    await flushMicrotasks()

    const submission = runtime.submission.getSnapshot()
    expect(submission.status).toBe('idle')
    expect(submission.error).toBe(error)
    expect(runtime.getNodeState(nameId)!.validationStatus.getSnapshot()).toBe('idle')
    runtime.destroy()
  })

  it('submit and blur validations settle independently at the same epoch', async () => {
    const submitDeferred = deferred<ValidationResult>()
    const blurDeferred = deferred<ValidationResult>()
    const queue = [submitDeferred.promise, blurDeferred.promise]
    const validateFn = vi.fn(() => queue.shift()!)
    const port = makePort(() => simpleProjection, validateFn)
    const runtime = createFormRuntime(port, {
      initialData: { name: 'Alice' },
      hints: { '/name': { validationTrigger: 'blur' } },
    })
    const nameId = findFieldNode(runtime, '/name')

    // Submit and SetTouched are both dispatched without any intervening data
    // mutation, so scheduler.invalidate() never runs and both validations
    // share the same epoch. Only the `trigger === 'submit'` guard in
    // onValidationResult keeps the blur result from advancing submission.
    runtime.dispatch({ type: 'Submit' })
    expect(runtime.submission.getSnapshot().status).toBe('validating')

    runtime.dispatch({ type: 'SetTouched', nodeId: nameId })
    expect(validateFn).toHaveBeenCalledTimes(2)

    blurDeferred.resolve({ valid: true, errors: [] })
    await blurDeferred.promise
    await flushMicrotasks()

    expect(runtime.getNodeState(nameId)!.validationStatus.getSnapshot()).toBe('valid')
    expect(runtime.submission.getSnapshot().status).toBe('validating')

    submitDeferred.resolve({ valid: true, errors: [] })
    await submitDeferred.promise
    await flushMicrotasks()

    expect(runtime.submission.getSnapshot().status).toBe('submitted')
    runtime.destroy()
  })

  it('dispatch after destroy is a no-op', () => {
    const validateFn = vi.fn(() => ({ valid: true, errors: [] }))
    const port = makePort(() => simpleProjection, validateFn)
    const runtime = createFormRuntime(port, { initialData: { name: 'Alice' } })

    runtime.destroy()
    runtime.dispatch({ type: 'Submit' })

    expect(validateFn).not.toHaveBeenCalled()
    expect(runtime.submission.getSnapshot().status).toBe('idle')
  })
})

describe('submission lifecycle', () => {
  it('onSubmit receives captured snapshot, not live data', async () => {
    let receivedData: unknown
    const submitDef = deferred<void>()
    const port = makePort(
      () => simpleProjection,
      () => ({ valid: true, errors: [] }),
    )
    const runtime = createFormRuntime(port, {
      initialData: { name: 'Alice' },
      onSubmit: async (data) => {
        receivedData = data
        await submitDef.promise
      },
    })
    const nameId = findFieldNode(runtime, '/name')

    runtime.dispatch({ type: 'Submit' })
    expect(runtime.submission.getSnapshot().status).toBe('submitting')

    runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Bob' })
    expect(runtime.data.getSnapshot()).toEqual({ name: 'Bob' })
    expect(receivedData).toEqual({ name: 'Alice' })

    submitDef.resolve()
    await vi.waitFor(() => {
      expect(runtime.submission.getSnapshot().status).toBe('submitted')
    })
    runtime.destroy()
  })

  it('duplicate Submit while validating is ignored', async () => {
    const def = deferred<ValidationResult>()
    const validateFn = vi.fn(() => def.promise)
    const port = makePort(() => simpleProjection, validateFn)
    const runtime = createFormRuntime(port, {
      initialData: { name: 'Alice' },
      onSubmit: async () => {},
    })

    runtime.dispatch({ type: 'Submit' })
    expect(runtime.submission.getSnapshot().status).toBe('validating')
    expect(validateFn).toHaveBeenCalledTimes(1)

    runtime.dispatch({ type: 'Submit' })
    expect(validateFn).toHaveBeenCalledTimes(1)

    def.resolve({ valid: true, errors: [] })
    await flushMicrotasks()
    await vi.waitFor(() => {
      expect(runtime.submission.getSnapshot().status).toBe('submitted')
    })
    runtime.destroy()
  })

  it('duplicate Submit while submitting is ignored', async () => {
    const submitDef = deferred<void>()
    const validateFn = vi.fn(() => ({ valid: true, errors: [] }))
    const port = makePort(() => simpleProjection, validateFn)
    const runtime = createFormRuntime(port, {
      initialData: { name: 'Alice' },
      onSubmit: () => submitDef.promise,
    })

    runtime.dispatch({ type: 'Submit' })
    expect(runtime.submission.getSnapshot().status).toBe('submitting')

    validateFn.mockClear()
    runtime.dispatch({ type: 'Submit' })
    expect(validateFn).not.toHaveBeenCalled()
    expect(runtime.submission.getSnapshot().status).toBe('submitting')

    submitDef.resolve()
    await vi.waitFor(() => {
      expect(runtime.submission.getSnapshot().status).toBe('submitted')
    })
    runtime.destroy()
  })

  it('Submit from submitted starts fresh validation cycle', async () => {
    const validateFn = vi.fn(async () => ({ valid: true, errors: [] }))
    const port = makePort(() => simpleProjection, validateFn)
    const runtime = createFormRuntime(port, {
      initialData: { name: 'Alice' },
      onSubmit: async () => {},
    })

    runtime.dispatch({ type: 'Submit' })
    await vi.waitFor(() => {
      expect(runtime.submission.getSnapshot().status).toBe('submitted')
    })

    validateFn.mockClear()
    runtime.dispatch({ type: 'Submit' })
    expect(runtime.submission.getSnapshot().status).toBe('validating')
    expect(validateFn).toHaveBeenCalledTimes(1)

    await vi.waitFor(() => {
      expect(runtime.submission.getSnapshot().status).toBe('submitted')
    })
    runtime.destroy()
  })

  it('onSubmit rejection returns to idle with error', async () => {
    const submitError = new Error('server down')
    const port = makePort(
      () => simpleProjection,
      () => ({ valid: true, errors: [] }),
    )
    const runtime = createFormRuntime(port, {
      initialData: { name: 'Alice' },
      onSubmit: async () => { throw submitError },
    })

    runtime.dispatch({ type: 'Submit' })
    await vi.waitFor(() => {
      const sub = runtime.submission.getSnapshot()
      expect(sub.status).toBe('idle')
      expect(sub.error).toBe(submitError)
    })
    runtime.destroy()
  })

  it('fresh Submit after failure clears old error', async () => {
    const submitError = new Error('server down')
    let callCount = 0
    const port = makePort(
      () => simpleProjection,
      () => ({ valid: true, errors: [] }),
    )
    const runtime = createFormRuntime(port, {
      initialData: { name: 'Alice' },
      onSubmit: async () => {
        callCount++
        if (callCount === 1) throw submitError
      },
    })

    runtime.dispatch({ type: 'Submit' })
    await vi.waitFor(() => {
      expect(runtime.submission.getSnapshot().error).toBe(submitError)
    })

    runtime.dispatch({ type: 'Submit' })
    expect(runtime.submission.getSnapshot().error).toBeUndefined()

    await vi.waitFor(() => {
      expect(runtime.submission.getSnapshot().status).toBe('submitted')
    })
    runtime.destroy()
  })

  it('Reset during submitting returns to idle and ignores late resolve', async () => {
    const submitDef = deferred<void>()
    const port = makePort(
      () => simpleProjection,
      () => ({ valid: true, errors: [] }),
    )
    const runtime = createFormRuntime(port, {
      initialData: { name: 'Alice' },
      onSubmit: () => submitDef.promise,
    })

    runtime.dispatch({ type: 'Submit' })
    expect(runtime.submission.getSnapshot().status).toBe('submitting')

    runtime.dispatch({ type: 'Reset' })
    expect(runtime.submission.getSnapshot().status).toBe('idle')

    submitDef.resolve()
    await flushMicrotasks()

    expect(runtime.submission.getSnapshot().status).toBe('idle')
    runtime.destroy()
  })

  it('Reset during submitting ignores late rejection', async () => {
    const submitDef = deferred<void>()
    const port = makePort(
      () => simpleProjection,
      () => ({ valid: true, errors: [] }),
    )
    const runtime = createFormRuntime(port, {
      initialData: { name: 'Alice' },
      onSubmit: () => submitDef.promise,
    })

    runtime.dispatch({ type: 'Submit' })
    expect(runtime.submission.getSnapshot().status).toBe('submitting')

    runtime.dispatch({ type: 'Reset' })
    expect(runtime.submission.getSnapshot().status).toBe('idle')

    submitDef.reject(new Error('too late'))
    await submitDef.promise.catch(() => {})
    await flushMicrotasks()

    const sub = runtime.submission.getSnapshot()
    expect(sub.status).toBe('idle')
    expect(sub.error).toBeUndefined()
    runtime.destroy()
  })

  it('destroy during submitting prevents late completion', async () => {
    const submitDef = deferred<void>()
    const port = makePort(
      () => simpleProjection,
      () => ({ valid: true, errors: [] }),
    )
    const runtime = createFormRuntime(port, {
      initialData: { name: 'Alice' },
      onSubmit: () => submitDef.promise,
    })

    runtime.dispatch({ type: 'Submit' })
    expect(runtime.submission.getSnapshot().status).toBe('submitting')

    runtime.destroy()

    submitDef.resolve()
    await flushMicrotasks()

    expect(runtime.submission.getSnapshot().status).toBe('submitting')
  })

  it('blur and change validation suppressed during submitting', async () => {
    const submitDef = deferred<void>()
    const validateFn = vi.fn(() => ({ valid: true, errors: [] }))
    const port = makePort(() => simpleProjection, validateFn)
    const runtime = createFormRuntime(port, {
      initialData: { name: 'Alice' },
      hints: { '/name': { validationTrigger: 'blur' } },
      onSubmit: () => submitDef.promise,
    })
    const nameId = findFieldNode(runtime, '/name')

    runtime.dispatch({ type: 'Submit' })
    expect(runtime.submission.getSnapshot().status).toBe('submitting')
    validateFn.mockClear()

    runtime.dispatch({ type: 'SetTouched', nodeId: nameId })
    expect(validateFn).not.toHaveBeenCalled()

    submitDef.resolve()
    await vi.waitFor(() => {
      expect(runtime.submission.getSnapshot().status).toBe('submitted')
    })
    runtime.destroy()
  })

  it('accepted Submit cancels queued change timers', () => {
    vi.useFakeTimers()
    const validateFn = vi.fn(() => ({ valid: true, errors: [] }))
    const port = makePort(() => simpleProjection, validateFn)
    const runtime = createFormRuntime(port, {
      initialData: { name: 'Alice' },
      hints: { '/name': { validationTrigger: 'change' } },
      validationDebounceMs: 300,
    })
    const nameId = findFieldNode(runtime, '/name')

    runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Bob' })
    expect(validateFn).not.toHaveBeenCalled()

    runtime.dispatch({ type: 'Submit' })
    expect(validateFn).toHaveBeenCalledTimes(1)

    validateFn.mockClear()
    vi.advanceTimersByTime(300)
    expect(validateFn).not.toHaveBeenCalled()

    runtime.destroy()
    vi.useRealTimers()
  })

  it('validation rejection during submit clears attempt', async () => {
    const def = deferred<ValidationResult>()
    const port = makeAsyncPort(def)
    let onSubmitCalled = false
    const runtime = createFormRuntime(port, {
      initialData: { name: 'Alice' },
      onSubmit: async () => { onSubmitCalled = true },
    })

    runtime.dispatch({ type: 'Submit' })
    expect(runtime.submission.getSnapshot().status).toBe('validating')

    const error = new Error('validation service down')
    def.reject(error)
    await def.promise.catch(() => {})
    await flushMicrotasks()

    expect(runtime.submission.getSnapshot().status).toBe('idle')
    expect(runtime.submission.getSnapshot().error).toBe(error)
    expect(onSubmitCalled).toBe(false)
    runtime.destroy()
  })

  it('full Submit-validate-onSubmit-edit-blur-resolve chain', async () => {
    let receivedData: unknown
    const submitDef = deferred<void>()
    const validateFn = vi.fn(() => ({ valid: true, errors: [] }))
    const port = makePort(() => simpleProjection, validateFn)
    const runtime = createFormRuntime(port, {
      initialData: { name: 'Alice' },
      hints: { '/name': { validationTrigger: 'blur' } },
      onSubmit: async (data) => {
        receivedData = data
        await submitDef.promise
      },
    })
    const nameId = findFieldNode(runtime, '/name')

    runtime.dispatch({ type: 'Submit' })
    expect(runtime.submission.getSnapshot().status).toBe('submitting')

    validateFn.mockClear()

    runtime.dispatch({ type: 'SetValue', nodeId: nameId, value: 'Bob' })
    runtime.dispatch({ type: 'SetTouched', nodeId: nameId })
    expect(validateFn).not.toHaveBeenCalled()
    expect(runtime.data.getSnapshot()).toEqual({ name: 'Bob' })

    submitDef.resolve()
    await vi.waitFor(() => {
      expect(runtime.submission.getSnapshot().status).toBe('submitted')
    })
    expect(receivedData).toEqual({ name: 'Alice' })
    runtime.destroy()
  })
})

describe('showErrors display policy', () => {
  it('showErrors is false when untouched and idle', () => {
    const port = makePort(() => simpleProjection)
    const runtime = createFormRuntime(port)
    const nodeId = findFieldNode(runtime, '/name')
    const nodeState = runtime.getNodeState(nodeId)!
    expect(nodeState.showErrors.getSnapshot()).toBe(false)
    runtime.destroy()
  })

  it('showErrors is false when touched but not invalid', () => {
    const port = makePort(() => simpleProjection)
    const runtime = createFormRuntime(port)
    const nodeId = findFieldNode(runtime, '/name')
    runtime.dispatch({ type: 'SetTouched', nodeId })
    const nodeState = runtime.getNodeState(nodeId)!
    expect(nodeState.showErrors.getSnapshot()).toBe(false)
    runtime.destroy()
  })

  it('showErrors is false when invalid but neither touched nor submitted', () => {
    const port = makePort(
      () => simpleProjection,
      () => ({ valid: false, errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }] }),
    )
    const runtime = createFormRuntime(port, {
      hints: { '/name': { validationTrigger: 'change' } },
    })
    const nodeId = findFieldNode(runtime, '/name')
    vi.useFakeTimers()
    runtime.dispatch({ type: 'SetValue', nodeId, value: '' })
    vi.advanceTimersByTime(300)
    const nodeState = runtime.getNodeState(nodeId)!
    expect(nodeState.touched.getSnapshot()).toBe(false)
    expect(nodeState.validationStatus.getSnapshot()).toBe('invalid')
    expect(nodeState.showErrors.getSnapshot()).toBe(false)
    vi.useRealTimers()
    runtime.destroy()
  })

  it('a failed Submit shows errors on fields nobody touched', () => {
    const port = makePort(
      () => simpleProjection,
      () => ({ valid: false, errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }] }),
    )
    const runtime = createFormRuntime(port)
    runtime.dispatch({ type: 'Submit' })
    const nodeId = findFieldNode(runtime, '/name')
    const nodeState = runtime.getNodeState(nodeId)!
    expect(nodeState.touched.getSnapshot()).toBe(false)
    expect(nodeState.validationStatus.getSnapshot()).toBe('invalid')
    expect(nodeState.showErrors.getSnapshot()).toBe(true)
    expect(runtime.submission.getSnapshot()).toEqual({ status: 'idle', attempts: 1 })
    runtime.destroy()
  })

  it('a failed Submit with an async validator shows errors once the result lands', async () => {
    const def = deferred<ValidationResult>()
    const runtime = createFormRuntime(makeAsyncPort(def))
    const nodeId = findFieldNode(runtime, '/name')
    runtime.dispatch({ type: 'Submit' })
    expect(runtime.getNodeState(nodeId)!.showErrors.getSnapshot()).toBe(false)

    def.resolve({ valid: false, errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }] })
    await def.promise
    await flushMicrotasks()
    expect(runtime.getNodeState(nodeId)!.showErrors.getSnapshot()).toBe(true)
    expect(runtime.submission.getSnapshot()).toEqual({ status: 'idle', attempts: 1 })
    runtime.destroy()
  })

  it('Reset closes the submit gate again', () => {
    const port = makePort(
      () => simpleProjection,
      () => ({ valid: false, errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }] }),
    )
    const runtime = createFormRuntime(port, {
      hints: { '/name': { validationTrigger: 'change' } },
    })
    runtime.dispatch({ type: 'Submit' })
    expect(runtime.getNodeState(findFieldNode(runtime, '/name'))!.showErrors.getSnapshot()).toBe(true)

    runtime.dispatch({ type: 'Reset' })
    expect(runtime.submission.getSnapshot()).toEqual({ status: 'idle', attempts: 0 })
    const nodeId = findFieldNode(runtime, '/name')
    vi.useFakeTimers()
    runtime.dispatch({ type: 'SetValue', nodeId, value: '' })
    vi.advanceTimersByTime(300)
    expect(runtime.getNodeState(nodeId)!.validationStatus.getSnapshot()).toBe('invalid')
    expect(runtime.getNodeState(nodeId)!.showErrors.getSnapshot()).toBe(false)
    vi.useRealTimers()
    runtime.destroy()
  })

  it('attempts counts every accepted Submit and survives the lifecycle', async () => {
    let fail = true
    const port = makePort(
      () => simpleProjection,
      () => (fail ? { valid: false, errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }] } : { valid: true, errors: [] }),
    )
    const runtime = createFormRuntime(port, { onSubmit: () => Promise.resolve() })
    expect(runtime.submission.getSnapshot().attempts).toBe(0)
    runtime.dispatch({ type: 'Submit' })
    runtime.dispatch({ type: 'Submit' })
    expect(runtime.submission.getSnapshot()).toEqual({ status: 'idle', attempts: 2 })

    fail = false
    runtime.dispatch({ type: 'Submit' })
    expect(runtime.submission.getSnapshot()).toEqual({ status: 'submitting', attempts: 3 })
    await flushMicrotasks()
    expect(runtime.submission.getSnapshot()).toEqual({ status: 'submitted', attempts: 3 })
    runtime.destroy()
  })

  it('showErrors is true when both touched and invalid', () => {
    const port = makePort(
      () => simpleProjection,
      () => ({ valid: false, errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }] }),
    )
    const runtime = createFormRuntime(port, {
      hints: { '/name': { validationTrigger: 'blur' } },
    })
    const nodeId = findFieldNode(runtime, '/name')
    runtime.dispatch({ type: 'SetTouched', nodeId })
    const nodeState = runtime.getNodeState(nodeId)!
    expect(nodeState.showErrors.getSnapshot()).toBe(true)
    runtime.destroy()
  })

  it('showErrors transitions to false when errors clear', () => {
    let shouldFail = true
    const port = makePort(
      () => simpleProjection,
      () => shouldFail
        ? { valid: false, errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }] }
        : { valid: true, errors: [] },
    )
    const runtime = createFormRuntime(port, {
      hints: { '/name': { validationTrigger: 'change' } },
    })
    const nodeId = findFieldNode(runtime, '/name')
    // 'change' triggers are debounced (see validation-scheduler.ts), so fake
    // timers are needed to advance past the debounce window deterministically.
    vi.useFakeTimers()
    // Touch the field first, then trigger change validation
    runtime.dispatch({ type: 'SetTouched', nodeId })
    runtime.dispatch({ type: 'SetValue', nodeId, value: '' })
    vi.advanceTimersByTime(300)
    expect(runtime.getNodeState(nodeId)!.showErrors.getSnapshot()).toBe(true)

    shouldFail = false
    runtime.dispatch({ type: 'SetValue', nodeId, value: 'Alice' })
    vi.advanceTimersByTime(300)
    expect(runtime.getNodeState(nodeId)!.showErrors.getSnapshot()).toBe(false)
    vi.useRealTimers()
    runtime.destroy()
  })
})

describe('visibleErrors aggregate', () => {
  it('visibleErrors is empty when no errors are visible', () => {
    const port = makePort(() => simpleProjection)
    const runtime = createFormRuntime(port)
    expect(runtime.visibleErrors.getSnapshot()).toEqual([])
    runtime.destroy()
  })

  it('visibleErrors includes node when touched and invalid', () => {
    const port = makePort(
      () => simpleProjection,
      () => ({ valid: false, errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }] }),
    )
    const runtime = createFormRuntime(port, {
      hints: { '/name': { validationTrigger: 'blur' } },
    })
    const nodeId = findFieldNode(runtime, '/name')
    runtime.dispatch({ type: 'SetTouched', nodeId })
    const visible = runtime.visibleErrors.getSnapshot()
    expect(visible).toHaveLength(1)
    expect(visible[0].nodeId).toBe(nodeId)
    expect(visible[0].fieldTitle).toBe('Name')
    expect(visible[0].pointer).toBe('/name')
    expect(visible[0].errors).toHaveLength(1)
    expect(visible[0].errors[0].keyword).toBe('required')
    runtime.destroy()
  })

  it('visibleErrors includes untouched invalid nodes after a failed Submit', () => {
    const port = makePort(
      () => simpleProjection,
      () => ({ valid: false, errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }] }),
    )
    const runtime = createFormRuntime(port)
    runtime.dispatch({ type: 'Submit' })
    const visible = runtime.visibleErrors.getSnapshot()
    expect(visible).toHaveLength(1)
    expect(visible[0].pointer).toBe('/name')
    expect(visible[0].fieldTitle).toBe('Name')
    runtime.destroy()
  })

  it('visibleErrors excludes invalid nodes that are neither touched nor submitted', () => {
    const port = makePort(
      () => simpleProjection,
      () => ({ valid: false, errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }] }),
    )
    const runtime = createFormRuntime(port, {
      hints: { '/name': { validationTrigger: 'change' } },
    })
    const nodeId = findFieldNode(runtime, '/name')
    vi.useFakeTimers()
    runtime.dispatch({ type: 'SetValue', nodeId, value: '' })
    vi.advanceTimersByTime(300)
    expect(runtime.getNodeState(nodeId)!.validationStatus.getSnapshot()).toBe('invalid')
    expect(runtime.visibleErrors.getSnapshot()).toEqual([])
    vi.useRealTimers()
    runtime.destroy()
  })

  it('visibleErrors clears when errors resolve', () => {
    let shouldFail = true
    const port = makePort(
      () => simpleProjection,
      () => shouldFail
        ? { valid: false, errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }] }
        : { valid: true, errors: [] },
    )
    const runtime = createFormRuntime(port, {
      hints: { '/name': { validationTrigger: 'change' } },
    })
    const nodeId = findFieldNode(runtime, '/name')
    // 'change' triggers are debounced (see validation-scheduler.ts), so fake
    // timers are needed to advance past the debounce window deterministically.
    vi.useFakeTimers()
    runtime.dispatch({ type: 'SetTouched', nodeId })
    runtime.dispatch({ type: 'SetValue', nodeId, value: '' })
    vi.advanceTimersByTime(300)
    expect(runtime.visibleErrors.getSnapshot()).toHaveLength(1)

    shouldFail = false
    runtime.dispatch({ type: 'SetValue', nodeId, value: 'Alice' })
    vi.advanceTimersByTime(300)
    expect(runtime.visibleErrors.getSnapshot()).toEqual([])
    vi.useRealTimers()
    runtime.destroy()
  })

  it('visibleErrors is reactive (subscribe fires on change)', () => {
    const port = makePort(
      () => simpleProjection,
      () => ({ valid: false, errors: [{ instancePointer: '/name', keyword: 'required', message: 'Required', params: {} }] }),
    )
    const runtime = createFormRuntime(port, {
      hints: { '/name': { validationTrigger: 'blur' } },
    })
    const listener = vi.fn()
    runtime.visibleErrors.subscribe(listener)
    const nodeId = findFieldNode(runtime, '/name')
    runtime.dispatch({ type: 'SetTouched', nodeId })
    expect(listener).toHaveBeenCalled()
    runtime.destroy()
  })
})

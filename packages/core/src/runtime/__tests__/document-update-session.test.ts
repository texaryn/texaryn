import { describe, expect, it, vi } from 'vitest'
import { createDocumentRuntime } from '../document-runtime.js'
import { createDocumentUpdateSession } from '../document-update-session.js'
import { batch } from '../../state/signal.js'
import type { UIDocumentV2 } from '../../ir/types.js'
import type { JsonPointer, NodeId } from '../../types.js'

const id = (value: string) => value as NodeId
const pointer = (value: string) => value as JsonPointer

function document(content = 'People'): UIDocumentV2 {
  return {
    version: 2,
    rootId: id('root'),
    nodes: {
      root: {
        id: id('root'),
        type: 'container',
        parentId: null,
        annotations: { title: 'Directory' },
        containerType: 'group',
        children: [id('title'), id('items')],
      },
      title: {
        id: id('title'),
        type: 'text',
        parentId: id('root'),
        annotations: {},
        content,
        textRole: 'heading',
      },
      items: {
        id: id('items'),
        type: 'list',
        parentId: id('root'),
        annotations: {},
        collectionId: 'people',
        dataPointer: pointer('/items'),
        valuePointer: pointer('/label'),
      },
    },
  }
}

function data(items: unknown = [{ label: 'Ada' }]) {
  return { items }
}

function minimalDocument(): UIDocumentV2 {
  return {
    version: 2,
    rootId: id('root'),
    nodes: {
      root: {
        id: id('root'),
        type: 'container',
        parentId: null,
        annotations: { title: 'Empty' },
        containerType: 'group',
        children: [],
      },
    },
  }
}

function makeSession(runtime = createDocumentRuntime(document(), { initialData: data() }), options = {}) {
  return {
    runtime,
    session: createDocumentUpdateSession(runtime, {
      onNotificationError: vi.fn(),
      ...options,
    }),
  }
}

describe('DocumentUpdateSession', () => {
  it('rejects malformed messages and invalid revisions without creating a session state', () => {
    const { session } = makeSession()
    expect(() => session.apply(null)).toThrow(/message must be an object/)
    expect(() => session.apply({ protocol: 2, kind: 'snapshot', revision: 1, document: document(), data: data() }))
      .toThrow(/protocol must be 1/)
    expect(() => session.apply({ protocol: 1, kind: 'snapshot', revision: -1, document: document(), data: data() }))
      .toThrow(/nonnegative safe integer/)
    expect(() => session.apply({ protocol: 1, kind: 'snapshot', revision: 1.5, document: document(), data: data() }))
      .toThrow(/nonnegative safe integer/)
    expect(() => session.apply({ protocol: 1, kind: 'unknown', revision: 1 })).toThrow(/kind must be snapshot or update/)
    expect(() => session.apply({ protocol: 1, kind: 'snapshot', revision: 1, document: document() }))
      .toThrow(/message.data is required/)
    expect(() => session.apply({
      protocol: 1,
      kind: 'snapshot',
      revision: 1,
      document: document(),
      data: data(),
      extra: true,
    })).toThrow(/message.extra is not supported/)
    expect(() => session.apply({ protocol: 1, kind: 'update', revision: 1, data: data() }))
      .toThrow(/first document message must be a snapshot/)
    expect(session.getRevision()).toBeUndefined()
  })

  it.each([
    [null, /patch\[0\] must be an object/],
    [{ op: 'copy', path: '/nodes/title/content', value: 'x' }, /op is not supported/],
    [{ op: 'add', path: '/nodes/title/content' }, /patch\[0\]\.value is required/],
    [{ op: 'remove', path: '/nodes/title/content', value: true }, /patch\[0\]\.value is not supported/],
    [{ op: 'replace', path: 1, value: 'x' }, /path must be a string/],
    [{ op: 'replace', path: '/nodes/title/content/~2', value: 'x' }, /valid JSON Pointer/],
    [{ op: 'replace', path: '/document/version', value: 3 }, /descendant of \/nodes/],
    [{ op: 'replace', path: '/nodes/title/absent', value: 'x' }, /target does not exist/],
    [{ op: 'replace', path: '/nodes/items/id/x/value', value: 'x' }, /missing intermediate parent/],
    [{ op: 'replace', path: '/nodes/root/children/01', value: 'list' }, /canonical array index/],
    [{ op: 'replace', path: '/nodes/root/children/99', value: 'list' }, /outside the array bounds/],
  ])('rejects malformed patch %j without advancing the revision', (patch, error) => {
    const { session } = makeSession()
    session.apply({ protocol: 1, kind: 'snapshot', revision: 0, document: document(), data: data() })
    expect(() => session.apply({ protocol: 1, kind: 'update', revision: 1, patch: [patch] })).toThrow(error)
    expect(session.getRevision()).toBe(0)
  })

  it('validates session limits and clock ordering, then rejects use after destruction', () => {
    const runtime = createDocumentRuntime(document(), { initialData: data() })
    expect(() => createDocumentUpdateSession(runtime, {
      onNotificationError: vi.fn(),
      maxMessagesPerSecond: 0,
    })).toThrow(/maxMessagesPerSecond must be an integer/)
    expect(() => createDocumentUpdateSession(runtime, {
      onNotificationError: null as unknown as (error: unknown) => void,
    })).toThrow(/onNotificationError must be a function/)

    let now = 0
    const session = createDocumentUpdateSession(runtime, { onNotificationError: vi.fn(), now: () => now })
    session.apply({ protocol: 1, kind: 'snapshot', revision: 0, document: document(), data: data() })
    now = -1
    expect(() => session.apply({ protocol: 1, kind: 'update', revision: 1, data: data() }))
      .toThrow(/finite, nondecreasing values/)
    now = 1_000
    session.apply({ protocol: 1, kind: 'update', revision: 1, patch: [] })
    expect(session.getRevision()).toBe(1)
    session.destroy()
    expect(() => session.apply({ protocol: 1, kind: 'update', revision: 2, patch: [] }))
      .toThrow(/has been destroyed/)
  })

  it('requires a snapshot, then applies sequential revisions and data replacement', () => {
    const { runtime, session } = makeSession()
    expect(() => session.apply({ protocol: 1, kind: 'update', revision: 1, data: data() })).toThrow(/first.*snapshot/)
    session.apply({ protocol: 1, kind: 'snapshot', revision: 10, document: document(), data: data() })
    session.apply({
      protocol: 1,
      kind: 'update',
      revision: 11,
      patch: [{ op: 'replace', path: '/nodes/title/content', value: 'Everyone' }],
    })
    expect(runtime.document.getSnapshot().nodes.title).toMatchObject({ content: 'Everyone' })
    expect(session.getRevision()).toBe(11)

    session.apply({ protocol: 1, kind: 'update', revision: 12, data: null })
    expect(runtime.data.getSnapshot()).toBeNull()
    expect(session.getRevision()).toBe(12)
  })

  it('keeps runtime state and revision unchanged when validation rejects a patch', () => {
    const { runtime, session } = makeSession()
    session.apply({ protocol: 1, kind: 'snapshot', revision: 3, document: document(), data: data() })
    const previousDocument = runtime.document.getSnapshot()
    const previousData = runtime.data.getSnapshot()

    expect(() => session.apply({
      protocol: 1,
      kind: 'update',
      revision: 4,
      patch: [{ op: 'add', path: '/nodes/title/notAProperty', value: true }],
    })).toThrow(/not supported/)
    expect(runtime.document.getSnapshot()).toBe(previousDocument)
    expect(runtime.data.getSnapshot()).toBe(previousData)
    expect(session.getRevision()).toBe(3)

    session.apply({
      protocol: 1,
      kind: 'update',
      revision: 4,
      patch: [{ op: 'replace', path: '/nodes/title/content', value: 'Recovered' }],
    })
    expect(session.getRevision()).toBe(4)
  })

  it('requires exact update revisions and allows a higher snapshot to resynchronize', () => {
    const { runtime, session } = makeSession()
    session.apply({ protocol: 1, kind: 'snapshot', revision: 4, document: document(), data: data() })
    expect(() => session.apply({ protocol: 1, kind: 'update', revision: 6, data: data() })).toThrow(/exactly one/)
    expect(session.getRevision()).toBe(4)

    runtime.setData(data([{ label: 'Local change' }]))
    expect(() => session.apply({ protocol: 1, kind: 'update', revision: 5, data: data() })).toThrow(/outside this session/)
    expect(session.getRevision()).toBe(4)

    session.apply({ protocol: 1, kind: 'snapshot', revision: 8, document: document('Resynced'), data: data() })
    expect(session.getRevision()).toBe(8)
    expect(runtime.document.getSnapshot().nodes.title).toMatchObject({ content: 'Resynced' })
  })

  it('detects public replaceSnapshot mutations outside the session', () => {
    const { runtime, session } = makeSession()
    session.apply({ protocol: 1, kind: 'snapshot', revision: 0, document: document(), data: data() })
    runtime.replaceSnapshot(document('Local'), data())
    expect(() => session.apply({ protocol: 1, kind: 'update', revision: 1, data: data() })).toThrow(/outside this session/)
    expect(session.getRevision()).toBe(0)
  })

  it('supports object replacement and array insertion with strict patch paths', () => {
    const { runtime, session } = makeSession()
    session.apply({ protocol: 1, kind: 'snapshot', revision: 0, document: document(), data: data() })
    const addedNode = {
      id: 'caption',
      type: 'text',
      parentId: 'root',
      annotations: { title: 'Caption' },
      content: 'Directory contents',
      textRole: 'paragraph',
    }
    session.apply({
      protocol: 1,
      kind: 'update',
      revision: 1,
      patch: [
        { op: 'add', path: '/nodes/caption', value: addedNode },
        { op: 'add', path: '/nodes/root/children/1', value: 'caption' },
        { op: 'add', path: '/nodes/root/annotations/title', value: 'Updated directory' },
        { op: 'remove', path: '/nodes/items' },
        { op: 'remove', path: '/nodes/root/children/2' },
      ],
    })
    const root = runtime.document.getSnapshot().nodes.root
    expect(root.type === 'container' ? root.children : []).toEqual(['title', 'caption'])
    expect(root.annotations.title).toBe('Updated directory')

    for (const path of ['/nodes', '/nodes/title/content/~2bad', '/nodes/title/content/child']) {
      expect(() => session.apply({
        protocol: 1,
        kind: 'update',
        revision: 2,
        patch: [{ op: 'replace', path, value: 'bad' }],
      })).toThrow()
    }
    expect(session.getRevision()).toBe(1)
  })

  it('treats an empty patch as a revision advancing no-op', () => {
    const { runtime, session } = makeSession()
    session.apply({ protocol: 1, kind: 'snapshot', revision: 0, document: document(), data: data() })
    const previousDocument = runtime.document.getSnapshot()
    const listener = vi.fn()
    runtime.document.subscribe(listener)

    session.apply({ protocol: 1, kind: 'update', revision: 1, patch: [] })

    expect(session.getRevision()).toBe(1)
    expect(runtime.document.getSnapshot()).toBe(previousDocument)
    expect(listener).not.toHaveBeenCalled()
  })

  it('preserves unkeyed row identities for patch-only updates and resets them with data', () => {
    const { runtime, session } = makeSession()
    session.apply({ protocol: 1, kind: 'snapshot', revision: 0, document: document(), data: data() })
    const before = runtime.getCollection(id('items'))!.getSnapshot()[0]!.id
    session.apply({
      protocol: 1,
      kind: 'update',
      revision: 1,
      patch: [{ op: 'replace', path: '/nodes/title/content', value: 'Changed' }],
    })
    expect(runtime.getCollection(id('items'))!.getSnapshot()[0]!.id).toBe(before)

    session.apply({ protocol: 1, kind: 'update', revision: 2, data: data() })
    expect(runtime.getCollection(id('items'))!.getSnapshot()[0]!.id).not.toBe(before)
  })

  it('advances the revision despite listener failures and attempts every notification', () => {
    const runtime = createDocumentRuntime(document(), { initialData: data() })
    const onNotificationError = vi.fn(() => { throw new Error('reporting failed') })
    const session = createDocumentUpdateSession(runtime, { onNotificationError })
    const listener = vi.fn()
    runtime.document.subscribe(() => { throw new Error('subscriber failed') })
    runtime.data.subscribe(listener)

    expect(() => session.apply({ protocol: 1, kind: 'snapshot', revision: 2, document: document('Accepted'), data: data() })).not.toThrow()
    expect(session.getRevision()).toBe(2)
    expect(onNotificationError).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledOnce()
  })

  it('rejects reentrant updates while notifying subscribers', () => {
    const runtime = createDocumentRuntime(document(), { initialData: data() })
    const onNotificationError = vi.fn()
    const session = createDocumentUpdateSession(runtime, { onNotificationError })
    runtime.document.subscribe(() => {
      session.apply({ protocol: 1, kind: 'snapshot', revision: 2, document: document(), data: data() })
    })

    expect(() => session.apply({ protocol: 1, kind: 'snapshot', revision: 1, document: document(), data: data() })).not.toThrow()
    expect(session.getRevision()).toBe(1)
    expect(onNotificationError).toHaveBeenCalledOnce()
  })

  it('rejects application inside an existing signal batch before mutation', () => {
    const runtime = createDocumentRuntime(minimalDocument(), { initialData: 'initial' })
    const session = createDocumentUpdateSession(runtime, { onNotificationError: vi.fn() })
    const previousDocument = runtime.document.getSnapshot()
    const previousData = runtime.data.getSnapshot()

    expect(() => batch(() => {
      session.apply({ protocol: 1, kind: 'snapshot', revision: 0, document: minimalDocument(), data: 'next' })
    })).toThrow(/inside a signal batch/)
    expect(session.getRevision()).toBeUndefined()
    expect(runtime.document.getSnapshot()).toBe(previousDocument)
    expect(runtime.data.getSnapshot()).toBe(previousData)
  })

  it('does not apply array item limits to its internal snapshot grouping', () => {
    const runtime = createDocumentRuntime(minimalDocument(), {
      initialData: 'initial',
      limits: { maxArrayItems: 1 },
    })
    const session = createDocumentUpdateSession(runtime, { onNotificationError: vi.fn() })
    expect(() => session.apply({
      protocol: 1,
      kind: 'snapshot',
      revision: 0,
      document: minimalDocument(),
      data: 'remote',
    })).not.toThrow()
    expect(session.getRevision()).toBe(0)
    expect(runtime.data.getSnapshot()).toBe('remote')
  })

  it('bounds patch operations and update attempts', () => {
    let time = 0
    const runtime = createDocumentRuntime(document(), { initialData: data() })
    const session = createDocumentUpdateSession(runtime, {
      maxMessagesPerSecond: 2,
      maxPatchOperations: 1,
      now: () => time,
      onNotificationError: vi.fn(),
    })
    session.apply({ protocol: 1, kind: 'snapshot', revision: 0, document: document(), data: data() })
    expect(() => session.apply({
      protocol: 1,
      kind: 'update',
      revision: 1,
      patch: [
        { op: 'replace', path: '/nodes/title/content', value: 'One' },
        { op: 'replace', path: '/nodes/title/content', value: 'Two' },
      ],
    })).toThrow(/operation count/)
    expect(() => session.apply({ protocol: 1, kind: 'update', revision: 1, data: data() })).toThrow(/rate limit/)
    time = 1000
    session.apply({ protocol: 1, kind: 'update', revision: 1, data: data() })
    expect(session.getRevision()).toBe(1)
  })

  it('rejects unsupported and oversized envelopes without advancing', () => {
    const { session } = makeSession()
    expect(() => session.apply({ protocol: 1, kind: 'snapshot', revision: 0, document: document(), data: data(), extra: true })).toThrow(/maximum JSON value count|not supported/)
    expect(session.getRevision()).toBeUndefined()
    expect(() => session.apply({ protocol: 2, kind: 'snapshot', revision: 0, document: document(), data: data() })).toThrow(/protocol/)
    expect(session.getRevision()).toBeUndefined()
  })
})

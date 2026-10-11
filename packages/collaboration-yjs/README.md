# @texaryn/collaboration-yjs

Optional Yjs support for collaborative scalar field editing in Texaryn forms.
The application owns the `Y.Doc`, provider, authentication, and persistence.

Install both packages:

```bash
pnpm add @texaryn/collaboration-yjs yjs
```

## Scope

The adapter shares edits to existing scalar fields. It stores an immutable
baseline snapshot and scalar overrides addressed by JSON Pointer. Concurrent
edits at different pointers merge. Concurrent edits at the same pointer use
Yjs map conflict resolution.

Array lengths and object properties stay fixed for the session. `Reset`,
`InsertItem`, `RemoveItem`, `MoveItem`, and object or array replacement are
rejected. Array controls are disabled while connected. Use
`initialization: 'none'` so conditional branch changes do not create local
defaults that are missing from the shared representation.

The host supplied `schemaVersion` must change whenever the schema, dialect,
UI hints, initialization policy, or collaboration format changes. A mismatch
stops the binding without disposing the host's Yjs document.

## Attach a form

Create one Yjs document for the form, attach the provider you chose, then bind
the runtime:

```ts
import * as Y from 'yjs'
import { createYjsFormSession } from '@texaryn/collaboration-yjs'

const doc = new Y.Doc()
const session = createYjsFormSession(runtime, {
  doc,
  schemaVersion: 'profile-form:3',
  onCommandRejected(error) {
    console.warn(error.message)
  },
})

const result = session.status.getSnapshot()
if (result.status === 'failed') throw result.error

// When the form closes:
session.close()
doc.destroy()
```

The session does not create or connect a network provider. It removes its own
observers and runtime hooks when closed and leaves the `Y.Doc` available to its
owner.

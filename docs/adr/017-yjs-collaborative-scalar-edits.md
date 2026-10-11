# ADR-017: Yjs for Collaborative Scalar Edits

## Status

Accepted, 2026-10-11

## Context

`FormRuntime` applies local commands synchronously. `SetValue` names a compiled
node, while array commands use current indexes. The runtime has no transport
provider, command observer, or remote snapshot operation. A network sequencer
and index transformation layer would add infrastructure that a form library
does not own.

[Yjs](https://docs.yjs.dev/) supplies shared types and update events without
choosing a provider. Its shared maps merge concurrent writes to different
keys and resolve concurrent writes to the same key deterministically.

## Decision

Add an optional `@texaryn/collaboration-yjs` package. The host supplies a
`Y.Doc` and its provider. The adapter uses the `texaryn-form-v1` map by default
and accepts a host supplied document key when one `Y.Doc` contains multiple
forms. Core remains independent of Yjs and network code.

Version 1 shares scalar field edits. It does not share changes to the form's
data shape.

```mermaid
flowchart LR
  Runtime[FormRuntime] -->|committed scalar edits| Adapter[@texaryn/collaboration-yjs]
  Adapter <-->|baseline and pointer overrides| Shared[Y.Doc]
  Host[Host application] --> Provider[Host selected provider]
  Provider <-->|Yjs updates| Shared
```

The shared document contains a versioned manifest with the host supplied
`schemaVersion` and an immutable baseline snapshot. Each scalar override is a
Yjs map entry keyed by its JSON Pointer. The shared form data is the baseline
with all current overrides applied. Pointer resolution uses this shared data,
not the currently compiled UI document, so an override remains present while a
conditional branch hides its field.

The host's `schemaVersion` must identify the schema, adapter dialect, UI hints,
initialization policy, and collaboration format. A client must have the same
version and baseline to attach to an existing shared document. Version 1
requires `initialization: 'none'`.

The runtime reports committed data mutations with their command origin and
before and after documents. A command guard rejects unsupported mutations
before they reach the data. Remote snapshots preserve the current array
identity map, preserve local `dirty` and `touched` state, recompute `modified`
against the local baseline, invalidate stale validation and submission work,
and recompile and publish the accepted data in one update. A collaboration
session locks array add, remove, and reorder controls while attached.

Only `SetValue` on an existing scalar field path is accepted. The scalar must
be JSON serializable. The baseline object and array shape stays fixed. Yjs
conflict resolution chooses a deterministic winner for concurrent writes to
the same pointer. Concurrent writes to different pointers both remain. The
adapter limits the baseline to 64 levels, 100,000 JSON values, 10,000 entries
per array, and 1,000,000 total string characters. A session accepts up to
10,000 scalar overrides. Schema-invalid scalar values remain in shared data;
the form runtime reports them through its configured validation or submit path.

If a shared document has a malformed manifest, a different `schemaVersion`,
or an override outside the supported scalar paths, the session stops and
reports an error. A ready session reports unsupported local commands and leaves
their data unchanged. Closing or failing a session removes its runtime hooks
and observers without destroying the host-owned `Y.Doc` or provider.

## Out of scope

Version 1 does not share property creation or deletion, object or array value
replacement, `Reset`, `InsertItem`, `RemoveItem`, `MoveItem`, schema changes,
undo, presence, authorization, persistence, or a network provider. Structural
array collaboration needs shared row identities and a specified ordering rule
for concurrent moves, insertions, and deletions. It remains a separate
decision.

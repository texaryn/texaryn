# ADR-013: Server Driven Documents Use Bounded Versioned Updates

## Status

Accepted, 2026-10-11

## Context

ADR-012 added a transport independent runtime for standalone display documents.
It accepts complete document and data replacements. The roadmap calls for a
server driven UI protocol with versioned snapshots and partial updates. Remote
updates must preserve the runtime's validation and atomic publication rules.

The runtime accepts JSON only, rejects unknown node kinds and properties, and
executes actions only through host registered handlers. Unregistered actions
render disabled. A remote document cannot select a framework component or run
expressions.

## Proposed Decision

Add a transport independent update session to `@texaryn/core`. It does not open
network connections. The host owns transport authentication, authorization,
request size limits, persistence, and delivery.

The wire protocol has its own integer version, independent of the document IR
version:

```ts
type DocumentMessage =
  | {
      protocol: 1
      kind: 'snapshot'
      revision: number
      document: unknown
      data: unknown
    }
  | {
      protocol: 1
      kind: 'update'
      revision: number
      patch?: readonly DocumentPatchOperation[]
      data?: unknown
    }

type DocumentPatchOperation =
  | { op: 'add'; path: string; value: JsonValue }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: JsonValue }
```

Envelope and operation objects reject unknown properties. An update must
contain a patch, a `data` property, or both. Data is a complete replacement for
the current data snapshot. Property presence distinguishes an omitted data
update from valid replacements such as `null`, `false`, `0`, or `{}`. An empty
patch is a valid no operation that advances the revision.

The session starts uninitialized and accepts only a full snapshot first. A
snapshot contains both document and data. After initialization, every update
must have the next revision. A later full snapshot can resynchronize only at a
higher revision. Revisions are nonnegative safe integers scoped to one
document stream. Older, repeated, skipped, malformed, or unsupported protocol
messages are rejected without advancing the revision.

Patch operations apply sequentially to a private candidate. Paths use ordinary
JSON Pointer syntax, and the decoded first token must be exactly `nodes` with
at least one following token. A patch cannot change the document version or
root ID. `add` replaces an object member or inserts into an array. `remove` and
`replace` require an existing target. Intermediate parents must exist. Array
indexes use canonical decimal notation, and `-` is accepted only for `add` at
the end of an array. Reads and existence checks use own properties only. The
protocol accepts only `add`, `remove`, and `replace`, and rejects unknown
operation members. `copy`, `move`, and `test` are unsupported. The completed
candidate is validated as a version 2 document before publication. The parsed
message is preflighted before the session copies any envelope, patch value, or
candidate. A candidate is checked against the same limits after each operation
and before the next operation begins.

Add `DocumentRuntime.replaceSnapshot(document, data)` to validate both inputs
and every collection binding before one commit boundary. The session revision
and runtime document, data, and row identities commit together before
subscriber notifications begin. Validation failures happen before that
boundary. Notification failures cannot make a committed update look rejected.
The public method uses ordinary notification behavior. An internal runtime
control prepares the snapshot, then installs document, data, collection rows,
row identities, session revision, and session baseline in one batch before
subscriber notifications begin. The internal commit hook cannot call host
code. The runtime attempts every subscriber notification. A session reports
notification errors through a host callback and isolates errors thrown by that
callback, so a committed update remains accepted. Reentrant session updates
are rejected while an update is being applied. Applying a session message from
inside an already active signal batch is rejected before mutation, so the
session can report notification failures and keep its reentrancy guard through
its own notification flush.

The session records the document and data snapshots it committed. If application
code calls `replaceDocument`, `setData`, or the public `replaceSnapshot` outside
the session, later patch and data updates are rejected until a higher revision
snapshot resynchronizes it. The initial snapshot establishes the baseline, so
the session never guesses the server revision from a locally constructed
runtime.

Bound resource use before copying untrusted parsed messages or recursively
validating them. The initial maxima are 64 levels of JSON depth, 250,000 JSON
values, 10,000 array items, 1,000,000 characters per string, 10,000,000 total
string characters, 10,000 document nodes, 64 levels of document tree depth,
10,000 rows per collection, 20,000 total collection rows, and 100,000 total
table cells. JSON value counts include each array, object, and scalar value.
String limits count UTF-16 code units and include object property names. An
iterative preflight enforces JSON depth, value, array, per string, and total
string limits before cloning.
An iterative graph walk counts the root node as depth one and enforces document
node count and tree depth before recursive validation or publication. Collection
limits are enforced before building runtime snapshots. One apply call shares a
one million value visit budget across message preflight, patch value copies,
and candidate checks after each patch operation. This is in addition to the
per candidate value maximum. Hosts may lower these limits. Version 1 does not
allow raising them.

Session limits are 30 apply attempts per rolling second and 100 patch
operations per message. Session options can lower either limit. The limiter
uses a monotonic clock and a fixed ring capped at 30 timestamps. Every received
attempt, including a malformed or over quota message, counts while a ring slot
is available. When all slots remain inside the rolling window, new attempts
are rejected without allocating or extending the ring. The host transport
limits raw request bytes before parsing JSON.

Action registration may use a bare handler for actions that accept no
arguments. A bare handler rejects any supplied `actionArgs`, including `null`.
An action with `actionArgs` requires a host registration descriptor with a
synchronous validator and handler. The validator rejects by throwing or
returns the validated JSON arguments. Core clones and freezes the returned
value before passing it to the handler. A descriptor without a validator also
accepts only omitted arguments. Authorization remains the handler's
responsibility. Hosts can implement validators with JSON Schema, Zod, or
handwritten checks. Core does not depend on an engine.

## Security Boundary

Server supplied values remain inert JSON. Patch application writes own data
properties and rejects invalid pointers. The bounded document validator remains
the authority for node IDs, graph structure, annotations, collection bindings,
and JSON values. Action arguments pass a host registered validator. The handler
applies authorization before side effects. The session preflights the already
parsed message and every resulting candidate against fixed limits. The host
transport limits raw request bytes before JSON parsing. Rate limits do not
replace transport authentication or server authorization.

Custom widget registries remain local to the client. A server message cannot
name a React, Vue, Solid, Svelte, Angular, Web Component, or other framework
component. Renderers keep escaping text and disabling unregistered actions.

## Consequences

The protocol can be used with polling, server sent events, WebSockets, or another
transport without adding a network dependency to core. A full snapshot can
recover after a missed update. Restricted patches can update document nodes and
data while the runtime preserves collection identity where bindings remain
compatible. A patch only update preserves the current data and compatible
unkeyed row identities. Supplying new data starts a new unkeyed row identity
lifetime, even when the supplied data is deeply equal to the current data.
Valid keyed rows retain their IDs when collection bindings match. The session
passes an explicit internal `preserveUnkeyed` policy, so behavior does not
depend on reference equality.

This proposal does not define authentication, server persistence, reconnect
policy, multiuser conflict resolution, collaborative editing, AI generation,
or arbitrary RFC 6902 operations. Those remain host concerns or later roadmap
decisions. The first implementation must test limits before cloning, revision
ordering, runtime mutation invalidation, rate limits, every supported patch
operation, patch path safety, action argument validation, atomic rejection,
notification failures, and row identity across compatible updates.

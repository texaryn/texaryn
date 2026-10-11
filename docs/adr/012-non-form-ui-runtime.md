# ADR-012: Non-Form UI Uses a Versioned Shared IR

## Status

Accepted, 2026-10-11

## Context

The post-validation roadmap adds tables, lists, and layouts after the form
renderers. The IR already defines text and action nodes, and `ContainerNode`
already names `group` and `layout` container kinds. The current compiler creates
only field and object or array container nodes. `FormRuntime` always compiles a
JSON Schema projection, so a server cannot supply a `UIDocument` directly.

The roadmap also leaves open whether layout belongs in the IR. `FieldHints`
contains deprecated `colSpan` and `hidden` fields. Neither has defined runtime
semantics, so neither should become the layout or visibility contract.

The IR is intended to be serializable, versioned, renderer neutral, and safe to
produce from a server or an AI model. Renderers must not interpret CSS or
execute expressions from document data.

## Decision

Keep one versioned `UIDocument` family and add a schema independent
`DocumentRuntime` to `@texaryn/core`. It is a sibling of `FormRuntime`, not a
form runtime with optional validation. Both implement a small
`UIDocumentRuntime` surface containing document and data stores plus lifecycle.
`FormRuntime` remains authoritative over its compiled document. It does not
accept generic document replacement. `DocumentRuntime` accepts an explicit
version 2 document and JSON data without a schema adapter.

Version 1 remains the form document produced by `compile`. Version 2 adds a
standalone display document containing non-form nodes only. Forms and
display-only tables or lists do not coexist in one document in this milestone.
Each runtime accepts only the version and node kinds it implements; an
unsupported version or node kind is an error, never an omitted widget. The
version 2 type excludes editable fields and object or array form containers
until their validation and initialization contracts are defined.

Keep node meaning semantic and data only:

- `FieldNode` remains an editable, schema backed value.
- `TextNode` remains static text with heading, paragraph, help, or error summary
  roles. The schema independent runtime rejects `error-summary`, because it has
  no form validation state.
- `ActionNode` names a host registered action and carries serializable
  arguments. The schema independent runtime accepts only the `button` role;
  submit and reset require form capabilities. The host owns action
  implementations and validates arguments and authorization.
- `ContainerNode` with `group` means an accessible named group. `layout` means
  an ordered, unlabelled sequence of child nodes. Renderers choose their own
  default spacing and markup. A version 2 group requires a nonempty
  `annotations.title` as its accessible name.
- `ListNode` and `TableNode` are read only views over arrays in runtime data.
  List rows may be any JSON value. A list has a row rooted JSON Pointer to a
  scalar value; the empty pointer selects the item itself. The selected list
  value must be a scalar, null, or missing. A table has ordered column
  descriptors, each with a stable column ID, localized label, and row rooted
  JSON Pointer. Column IDs are unique within each table. These are ordinary
  JSON Pointers evaluated against each row. Missing and null values render as
  empty. Object and array cell values are rejected rather than stringified
  implicitly.
- Each collection node has a document unique collection ID and may name a row
  key using a row rooted JSON Pointer. A configured key must resolve on every
  row to a string or finite number, and values must be unique. Equality is
  strict and type sensitive, so `1` differs from `"1"`. Invalid or duplicate
  keys reject the data update. The generic runtime keeps row identity across
  data updates when that key is valid and unique. Without a key, replacing data
  starts a new row identity lifetime. Replacing a document preserves row
  identity only when collection ID, data binding, and row key configuration
  still match.

The IR will not carry CSS classes, grid spans, arbitrary component names,
scripts, callbacks, or executable expressions. A renderer may register custom
widgets for semantic node types through its local registry. Document data cannot
select a component by name. `hidden` remains unsupported until its effect on
form validation and data retention is specified. Rich grid and flex semantics
remain deferred; layout nodes describe structure, not styling.

`DocumentRuntime` owns the current document, JSON data, subscriptions, stable
collection identities, and named action invocation. It does not validate JSON
Schema or edit data through fields. Action invocation is separate from form
commands, returns asynchronous success or failure, and rejects unknown action
names. Its document accepts only JSON values for content and arguments. The
existing schema adapter and `FormRuntime` continue to own schema projection,
form validation, defaults, and submission.

Document replacement and data updates are atomic. Before publishing either,
the runtime validates the version, supported node kinds, map keys and node IDs,
root, parent and child agreement, cycles, reachability, JSON Pointers,
collection bindings, and JSON values. At construction and document replacement,
it validates every current collection binding against current data. At each
data update, it validates all current bindings before changing data or row
identities. An absent collection pointer means an empty collection. A present
non-array source, non-object table row, non-scalar selected list value or cell,
and missing, invalid, or duplicate configured row key reject the update.
Construction and document replacement also validate that table column IDs are
unique within each table. Missing or null cell and selected list values render
empty. An object or array cell or selected list value is rejected rather than
stringified. Rejection leaves document, data, and row identities unchanged.

The runtime takes ownership of validated JSON snapshots and exposes immutable
snapshots to subscribers. It publishes document, data, and identity changes as
one transaction. Version 2 starts with full document replacement only. Data
updates are a separate operation. JSON Patch and arbitrary node insert,
remove, and move commands are deferred to the server driven UI milestone.

Version 1 keeps its existing `NodeBase.order` behavior. Version 2 orders
children by the parent `children` array and omits the redundant `order` field
from non-form node bases.

## Consequences

There is one document family for forms and server supplied UI. Framework
renderers can share node semantics while keeping framework markup and styling
local. The sibling runtime keeps schema validation and form commands out of
generic display documents. Version 2 must be rejected by an older runtime that
does not advertise support, and unknown node kinds cannot be silently ignored.
This milestone establishes a stand-alone read only document runtime; combining
its display nodes with schema driven fields is a separate design decision.

The first implementation must preserve version 1 form APIs and snapshots. It
must add the version 2 runtime and node conformance cases for text, groups,
layouts, lists, tables, and actions across every maintained renderer. Table and
list nodes are display only; editing remains the responsibility of
`FieldNode` and array form controls. Repeated row subtrees, editable fields
without a schema adapter, and partial document updates remain later decisions.


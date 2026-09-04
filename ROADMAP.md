# Texaryn: Technical Roadmap

*From Latin texere: to weave, construct, compose.*

A framework-neutral, headless runtime for declarative and dynamically generated
interfaces. Forms are the first domain. The architecture targets general dynamic
UI (layouts, tables, lists, actions, conditional and repeated content,
server-driven UI, AI-generated UI) without building any of it until the form
runtime has shipped and found users.

This document is the output of a structured research phase covering 12+ existing
projects, three server-driven UI systems, and the headless UI pattern space. It
takes explicit positions. Where the evidence supports a decision, the decision is
stated. Where it does not, the question is listed as open with the information
needed to close it.

## Table of Contents

1. [Problem Statement and Market Gap](#1-problem-statement-and-market-gap)
2. [Competitive Landscape](#2-competitive-landscape)
3. [Architectural Principles](#3-architectural-principles-challenged)
4. [System Architecture](#4-system-architecture)
5. [IR Design](#5-ir-design)
6. [Stable Identity Model](#6-stable-identity-model)
7. [State and Reactivity Model](#7-state-and-reactivity-model)
8. [Validation Architecture](#8-validation-architecture)
9. [Schema Adapter Architecture](#9-schema-adapter-architecture)
10. [Renderer Contract](#10-renderer-contract)
11. [Actions and Effects](#11-actions-and-effects)
12. [Extensibility](#12-extensibility)
13. [AI and Server-Driven UI](#13-ai-and-server-driven-ui)
14. [Package Structure](#14-package-structure)
15. [Security Model](#15-security-model)
16. [Versioning and Compatibility](#16-versioning-and-compatibility)
17. [Testing Strategy](#17-testing-strategy)
18. [Performance Model](#18-performance-model)
19. [Milestones and First PRs](#19-milestones-and-first-prs)
20. [Assessment: Decisions, Risks, and Viability](#20-assessment-decisions-risks-and-viability)

---

## 1. Problem Statement and Market Gap

No existing project combines all of: a framework-neutral headless core, a typed
and versioned UI intermediate representation, per-field reactive state, stable
array identity across mutations, async validation with per-field lifecycle, JSON
Schema 2020-12 with annotation collection, declarative actions, and a renderer
contract that allows conformance testing.

The closest projects each fall short in specific, structural ways:

**RJSF** (14k+ stars, most widely deployed): no IR, no headless runtime, no
dirty/touched tracking, no async validation, centralized mutable state with full
recomputation per keystroke, fragile array key regeneration on reorder.

**JSON Forms** (2k+ stars, framework-neutral claim): genuinely has a
framework-neutral core, but pays for it with 1858 lines of parallel Redux-shaped
store implementations across React/Angular/Vue. Untyped `options: any` bag on
every UI Schema element breaks the IR contract (renderers pass arbitrary
framework-specific data through it). Positional array identity only. AJV-coupled
error model.

**TanStack Form** (v1.33.5, ~4k stars, headless): framework-neutral core
(11,525 LOC in `@tanstack/form-core`) with seven working adapters (React, Vue,
Angular, Solid, Lit, Svelte, Preact). Has async validation with AbortController
cancellation, per-cause error maps, dirty/touched/pristine tracking, Standard
Schema V1 integration (Zod/Valibot/ArkType work out of the box), pluggable
validation scheduling, and cross-field dependency linking. But: fields mount
imperatively (`<form.Field name="foo">`), with no concept of schema-driven
generation. Zero JSON Schema support (grep confirms nothing across packages/ and
docs/). Positional array identity only (meta shifting by index on every mutation).
The type system's 20+ generic parameters collapse to `any` when `TFormData` is
derived at runtime, forfeiting the library's primary type-safety asset. It solves
"headless form state management" but not "schema to UI."

**@remoteoss/json-schema-form** (~300 stars): genuinely headless with a Field[]
IR. But: mutates fields in place, no `$ref` resolution, no `dependencies`
keyword, hand-rolled validator, incomplete JSON Schema coverage. Embeds UI hints
via `x-jsf-presentation` directly in the schema, conflating domain and
presentation.

**JSFE** (Web Components): mid-rewrite, TC39 signals, partially headless. But:
no validation pipeline, no conditionals in current code, `formAssociated` and
shadow DOM form participation are unresolved.

**First target user:** a React developer building a form-heavy application from
JSON Schema (configuration screens, multi-step onboarding, admin panels, data
entry tools). They have tried RJSF and hit one of: broken array reorder, no async
validation, no per-field dirty/touched state, or inability to customize without
forking a theme. They want a solution that works today in React but does not lock
them into React for the long term. Angular and Vue developers are secondary
targets, reachable once a second renderer ships.

The gap is real. The question is whether it is worth a new project or an
incremental fix to an existing one. Section 20 answers this directly.

## 2. Competitive Landscape

### Projects Studied

| Project | Framework | Headless | IR | Stable ID | Async Val | 2020-12 | State |
|---|---|---|---|---|---|---|---|
| RJSF | React | No | No | No | No | No | Centralized mutable |
| JSON Forms | Neutral (vendored stores) | Partial | UI Schema (untyped) | No | No | Via AJV plugin | Per-store |
| Uniforms | React | No | Bridge pattern | No | No | No | Context |
| @remoteoss/json-schema-form | Neutral | Yes | Field[] | No | No | Partial | Mutated in place |
| JSFE | Web Components | Partial | No | No | No | No | Signals (WIP) |
| Formly | Angular | No | FieldConfig | No | Via custom | No | Angular Forms |
| TanStack Form | Neutral (7 adapters) | Yes | No | No (positional) | Yes | No | @tanstack/store |
| Informed | React | No | No | No | Yes | No | Context |
| React Hook Form | React | No | No | No | Yes | No | Refs |

### Server-Driven UI Systems

Three independent systems converged on the same IR shape: A2UI (Airbnb), DivKit
(Yandex), and json-render (ThoughtWorks). Each uses a flat component map keyed
by stable ID, a root reference, a separate data model, a constrained component
catalog, and declarative actions. This convergent pattern is the strongest
external signal for what the IR should look like.

**Adaptive Cards** (Microsoft) takes a different approach with a tree structure
and no stable identity, designed for card-sized content rather than full
applications.

### Headless UI Patterns

**Zag.js** provides the most transferable architecture: a three-layer split of
pure state machine, framework adapter (`useMachine`), and prop getter functions.
The machine is the headless core; the adapter translates reactive primitives; the
prop getters produce framework-specific DOM attributes. This is the pattern to
follow for renderer bindings.

**React Aria** splits into `@react-stately` (state logic, no DOM) and
`@react-aria` (DOM behavior, accessibility). The two-layer separation is clean
but React-specific at both layers.

**Downshift** pioneered the prop-getter pattern and `stateReducer` for consumer
customization. Both ideas are worth adopting.

### Key Takeaway

The convergent evidence points to: flat node map IR, per-node reactive state,
prop-getter renderer binding, host-registered declarative actions. Every project
that chose a different shape hit a documented wall.

## 3. Architectural Principles (Challenged)

The original proposal listed ten principles. Here they are, each challenged
against the research evidence.

### P1: Pure TypeScript core, zero framework dependencies

**Verdict: Keep.** JSON Forms proved this is achievable but showed the cost:
parallel store implementations. The solution is to not use a store abstraction at
all. Per-node `Store<T>` instances with a `getSnapshot() + subscribe(cb) => unsubscribe`
adapter contract push the framework integration to the thinnest possible layer.
TanStack Form validates this approach with its 100-line adapters.

### P2: Schema adapter pattern (not hardcoded JSON Schema)

**Verdict: Keep the port, defer the generality.** The uniforms bridge pattern
(10-method abstract class) proves schema adapters work. But building the
abstraction before a second adapter exists risks designing for imaginary
requirements. Ship with a JSON Schema adapter only. Define the port by what that
adapter needs. Extract the generalization when Zod or TypeBox support actually
lands. The port is exported from `@texaryn/core` (separate adapter packages
need the type), but marked experimental before 1.0: its shape is driven by JSON
Schema needs and may change when a second schema format tests the abstraction.

### P3: Strict separation of domain schema, UI description, and UI implementation

**Verdict: Keep, but kill the "normalized domain model" layer.** The original
proposal described four layers: domain schema, normalized domain model, headless
runtime, UI IR. Three suffice. The "normalized domain model" adds a
representation between the original schema and the compiled IR that nothing
consumes. JSON Schema with resolved `$ref` and evaluated conditionals
(`if`/`then`/`else`) compiles directly into IR nodes. Adding an intermediate
normalized form creates a maintenance surface with no consumer. If a second
schema adapter someday needs a common intermediate, that is the time to introduce
it.

### P4: Deterministic core (same inputs produce same state)

**Verdict: Keep, with a precise definition.** "Deterministic" means:
the compiler is a pure function of its inputs. Stable array identity is
history-dependent (two runtimes with identical data can have different identity
maps), so the compiler consumes identity rather than owning it:

```typescript
compile(input: {
  projection: SchemaProjection   // resolved schema for current data
  uiHints: UIHints
  identities: IdentityMap        // current identity snapshot
}): UIDocument
```

Given the same projection, the same UI hints, and the same identity snapshot,
the IR is identical. State transitions are deterministic:
`dispatch(command, currentState) => nextState` is pure. Side effects (validation
requests, action execution) are modeled as effects emitted by the state machine,
not performed inside it. This is the Elm architecture applied to form state.

### P5: Versioned, typed IR

**Verdict: Keep. This is the project's primary differentiator.** JSON Forms'
untyped `options: any` bag is the cautionary tale. Every node in the IR has a
discriminated union type. The IR carries a version number. Renderers declare
which IR version they support. Breaking changes to the IR require a major version
bump with a migration function.

### P6: Per-field reactive state

**Verdict: Keep, with signals as internal implementation and `Store<T>` as public
contract.** The TC39 Signals proposal (Stage 1) defines a useful internal shape.
`@preact/signals-core` is the most mature implementation but its effect scheduler
creates conflict risk when embedded in frameworks that have their own scheduling.
Recommendation: implement a minimal signal core (~200 lines) following the TC39
spec surface, exposed through `Store<T>` (`getSnapshot + subscribe`). The public
contract is stable regardless of the internal reactive engine. When TC39 Signals
ships natively, swap the internals with no public API change.

### P7: Stable identity for array items

**Verdict: Keep. This is the second most important differentiator.** Every
studied project either uses positional identity (JSON Forms, @remoteoss) or
generates brittle keys (RJSF's `Math.random()` in a key generator that
regenerates on reorder). The solution: each array item gets an opaque stable ID
at creation time, stored in a parallel identity map. JSON Pointer paths use
indices for data access; the runtime maps between index and stable ID
transparently. Move and reorder operations preserve identity. Renderers receive
stable IDs, never indices.

### P8: Declarative actions (host-registered, not arbitrary JS)

**Verdict: Keep, following the server-driven UI convergent pattern.** A2UI and
DivKit both landed on: actions are named, registered by the host, and invoked
with serializable arguments. The runtime validates that the action exists and
that its arguments match the registered schema before dispatching. This is
necessary for the server-driven and AI-generated UI stories, and costs nothing
for the simple form case where the only actions are submit and reset.

### P9: Renderer registry with introspectable capabilities

**Verdict: Keep, but simplify.** The original framing suggested renderers would
declare capabilities like "supports drag-and-drop reorder." This is overdesigned
for v1. A simpler contract: the renderer registers widget components keyed by
node type (or by node type + format). The runtime matches IR nodes to widgets
using a tester/rank system inspired by JSON Forms. Capability introspection can
be added when a concrete use case demands it.

### P10: AI as optional producer/editor of IR, not runtime dependency

**Verdict: Keep. This is a constraint, not an abstraction.** AI produces IR (or
schema + UI hints). The runtime processes IR. The runtime has no AI dependency.
This is correct by construction as long as the IR is the only exchange format.
No special "AI mode" in the runtime.

### Principles Not Proposed That Should Be

**P11: No arbitrary executable expressions in the serialized IR.** Dynamic
behavior is represented using declarative predicates or delegated to the schema
evaluation layer. The runtime evaluates these deterministically as data changes.

The IR is serializable and contains no user-authored code, no template language,
and no Turing-complete expression evaluator. This prevents the expression sandbox
problem (Angular templates, Adaptive Cards expressions, Formly's expression
parser).

But "no expressions" does not mean "resolved once at compile time." JSON Schema
conditionals (`if`/`then`/`else`, `dependentSchemas`) depend on runtime data. When
a user changes `country` from `"FR"` to `"US"`, the active schema changes and the
IR must reflect it. The schema evaluation layer maintains an active-schema
projection that reacts to data changes. The IR compiler produces a new snapshot
from that projection. The runtime diffs old and new IR and patches only the
changed nodes.

The boundary: the schema evaluation port owns "which fields exist and what
constraints apply given the current data." The IR contains the resolved result,
not the rules that produced it. Renderers never evaluate predicates; they read
booleans.

**P12: Renderer conformance testing.** A renderer is correct if it passes a
conformance suite. The suite feeds IR snapshots to the renderer and asserts DOM
structure, ARIA attributes, and interaction behavior. This is how the "any
framework" promise becomes testable rather than aspirational.

## 4. System Architecture

```
                    Domain Description
                      JSON Schema
                          |
               +----------+----------+
               | Schema Evaluation   |  (refs, active schemas, annotations)
               | Port                |  (reacts to data changes)
               |                     |
               |  resolve(ptr, data) |
               |  annotations(ptr)   |
               |  validate(data)     |
               +----------+----------+
                          |
                 Active Domain Projection
                 (which fields exist, what
                  constraints apply, given
                  current data)
                          |
               +----------+----------+
               |    IR Compiler      |  (pure: projection + hints => IR)
               +----------+----------+
                          |
                 Texaryn UI IR
                (flat node map, versioned,
                 semantic, serializable)
                          |
               +----------+----------+
               |  Deterministic      |  (pure TypeScript, zero deps)
               |  Runtime            |
               |                     |
               |  - State manager    |
               |  - Command bus      |
               |  - Validation       |
               |    orchestrator     |
               |  - Identity map     |
               |  - Action handler   |
               +----------+----------+
                          |
                  Runtime State
                 (per-node stores:
                  value, errors,
                  dirty, touched,
                  visible, disabled)
                          |
                  getSnapshot()
                  subscribe()
                          |
               +----------+----------+
               | Renderer Binding    |  (one per framework)
               |                     |
               |  - subscribe to     |
               |    node stores      |
               |  - widget lookup    |
               |  - prop getters     |
               +----------+----------+
                          |
               +----------+----------+
               |   Widget Layer      |  (React, Angular, Vue, WC, etc.)
               |                     |
               |  - TextInput        |
               |  - Select           |
               |  - Checkbox         |
               |  - ArrayControl     |
               |  - ObjectLayout     |
               |  - Custom           |
               +----------+----------+
```

Four boundaries to protect: schema evaluation, UI IR, runtime state, renderer.
Each is a distinct representation with a distinct owner.

### Data Flow

1. **Schema in.** The schema evaluation port receives a JSON Schema (or future
   alternative), resolves all `$ref` pointers, and prepares an evaluator that
   can project the active schema for any data state. Annotations (title,
   description, default, readOnly, examples) are collected at resolution time
   for static schemas, or re-evaluated per pointer when the active schema depends
   on data.

2. **Compile.** The IR compiler asks the schema evaluation port for the active
   domain projection given the current data. It walks that projection to produce
   a flat node map. Each node has a stable ID, a JSON Pointer to its data
   location, a node type (field, container, text, action), and the collected
   annotations as typed properties.

3. **Re-evaluate.** When data changes (via a command), the runtime asks the
   schema evaluation port whether the active domain projection changed. For
   schemas without conditionals, the projection is stable and this is a no-op.
   For schemas with `if`/`then`/`else` or `dependentSchemas`, the port re-resolves
   the affected pointers against the new data. If the projection changed, the IR
   compiler produces a new snapshot. The runtime diffs old and new IR, updates
   only the changed node stores, and preserves stable IDs for array items that
   moved.

4. **Render.** Framework bindings subscribe to node stores via
   `getSnapshot()`/`subscribe()`. When a store updates, only the affected widget
   re-renders. The widget receives its props through a prop getter function that
   translates runtime state into framework-specific attributes.

5. **Command.** User input dispatches typed commands (`SetValue`, `InsertItem`,
   `RemoveItem`, `MoveItem`, `Submit`, `Reset`). The command handler updates the
   data store, marks dirty/touched state, triggers schema re-evaluation for
   data-dependent conditionals, and schedules validation.

### Package Dependency Graph

```
schema ───┐
data ─────┤
rules ────┼── Texaryn ──> interface
actions ──┘

@texaryn/core                    (zero deps, IR types, compiler, state,
    |                             commands, SchemaEvaluationPort interface)
    |
    +── @texaryn/schema-json          (JSON Schema evaluation, $ref, conditionals)
    |       |
    |       +── @texaryn/schema-json-hyperjump  (backed by @hyperjump/json-schema)
    |       +── @texaryn/schema-json-ajv        (backed by AJV)
    |
    +── @texaryn/react                (React binding, depends on core)
    |       |
    |       +── @texaryn/react-bootstrap  (Bootstrap 5 markup and classes)
    |       +── @texaryn/react-mui        (MUI component integration)
    +── @texaryn/vue                  (Vue binding, depends on core)
    +── @texaryn/angular              (Angular binding, depends on core)
    +── @texaryn/wc                   (Web Component binding, depends on core)
    |
    +── @texaryn/test-suite           (renderer conformance tests)
```

Styling integrations remain separate from framework bindings.
`@texaryn/react-bootstrap` renders native HTML with Bootstrap 5 classes and
declares `@texaryn/react`, `react`, and `bootstrap: ^5.3` as peer dependencies.
Widgets map field state onto classes such as `form-control`, `form-label`,
`form-select`, `form-check`, `is-invalid`, `invalid-feedback`, `btn`, and
`btn-primary`. The package does not depend on `react-bootstrap`. It proves that
Texaryn can integrate with a CSS and markup framework without an intermediate
component library.

`@texaryn/react-mui` tests a different boundary by wrapping a third-party React
component system. Emotion and Tailwind remain examples of custom styling rather
than package dependencies. These targets test three distinct integration modes:
CSS and markup conventions, component systems, and application-owned styling.

## 5. IR Design

The IR is a flat map of nodes, not a tree. This is the convergent pattern from
A2UI, json-render, and DivKit. A flat map allows O(1) node lookup, streaming
updates (add/remove/update individual nodes without re-sending the tree), and
deterministic diffing.

### Node Map Structure

```typescript
interface UIDocument {
  version: 1                // IR version, integer (see section 16)
  rootId: NodeId            // entry point into the node map
  nodes: Record<NodeId, UINode>
}
// No data, no validation state, no interaction state.
// The IR describes structure. Runtime state is separate (see below).

type NodeId = string & { __brand: 'NodeId' }

type UINode =
  | FieldNode
  | ContainerNode
  | TextNode
  | ActionNode

interface NodeBase {
  id: NodeId
  type: string              // discriminant
  parentId: NodeId | null
  dataPointer: JsonPointer | null  // pointer for this IR snapshot; can change on recompile
  order: number             // sibling order within parent
  visible: boolean          // resolved (not an expression)
  disabled: boolean         // resolved
  annotations: NodeAnnotations
}

interface NodeAnnotations {
  title?: string
  description?: string
  readOnly?: boolean
  writeOnly?: boolean
  deprecated?: boolean
  examples?: unknown[]
  default?: unknown
}
```

### Field Nodes

```typescript
interface FieldNode extends NodeBase {
  type: 'field'
  fieldType: FieldType
  format?: string           // JSON Schema format (email, uri, date, etc.)
  constraints: FieldConstraints
  enumValues?: EnumOption[]
  widget?: string           // explicit widget override (from UI hints)
}
// No value, validation, or interaction state. Those live in RuntimeState.

type FieldType =
  | 'string' | 'number' | 'integer' | 'boolean'
  | 'array'  | 'object'

interface FieldConstraints {
  required?: boolean
  minLength?: number
  maxLength?: number
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  multipleOf?: number
  pattern?: string
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
}

interface EnumOption {
  value: unknown
  title?: string            // from annotation or oneOf/anyOf title
}

// ValidationState and InteractionState are runtime-only (not in the IR).
// See RuntimeState below.
```

### Container Nodes

```typescript
interface ContainerNode extends NodeBase {
  type: 'container'
  containerType: 'object' | 'array' | 'group' | 'layout'
  children: NodeId[]        // ordered child IDs
  arrayMeta?: ArrayMeta     // present only for array containers
}

interface ArrayMeta {
  itemIds: StableItemId[]   // stable identity, see section 6
  itemKey?: string          // from UI hints, JSON Pointer relative to item, e.g. '/id'
  minItems?: number
  maxItems?: number
  canAdd: boolean           // derived from maxItems constraint
  canRemove: boolean        // derived from minItems constraint
  canReorder: boolean       // from UI hints, default false
}

type StableItemId = string & { __brand: 'StableItemId' }
```

### Text and Action Nodes

```typescript
interface TextNode extends NodeBase {
  type: 'text'
  content: string
  textRole: 'heading' | 'paragraph' | 'help' | 'error-summary'
}

interface ActionNode extends NodeBase {
  type: 'action'
  actionType: string        // registered action name
  label: string
  actionArgs?: Record<string, unknown>
  buttonRole: 'submit' | 'reset' | 'button'
}
```

### Design Decisions

**Why flat, not tree?** A tree forces the renderer to walk from the root to find
a changed node. A flat map with parent/children references gives both: O(1) node
access and reconstructible tree structure. Streaming updates (server-driven UI,
collaborative editing) can patch individual nodes without retransmitting the
document.

**Why no executable expressions?** The `visible` and `disabled` fields are
booleans, not expressions. The schema evaluation port resolves
`if`/`then`/`else` and `dependentSchemas` against current data; the IR compiler
produces resolved booleans from that projection. When data changes and the active
schema shifts, the port re-evaluates, the compiler produces a new IR snapshot, and
the runtime patches the changed nodes. Renderers never evaluate conditions; they
read the resolved result.

This does not mean the IR is static. It means the IR contains snapshots, not
programs. The dynamic behavior lives in the schema evaluation layer, which the
runtime invokes deterministically on data changes. The tradeoff is that the
schema evaluation port runs on every data change for schemas with conditionals.
Section 18 covers the performance implications.

**Why typed constraints instead of raw schema?** The renderer should never need
to interpret JSON Schema keywords. `FieldConstraints` exposes the subset of
schema constraints that affect UI behavior (showing "3/100 characters", disabling
add button at maxItems). The validator handles the rest.

**Why `widget?: string` on FieldNode?** This is the escape hatch for UI hints.
A schema or UI hint document can specify "use a textarea for this string field"
or "use a slider for this number." Without it, the renderer chooses based on
type + format + constraints, which is correct 80% of the time and wrong for the
other 20%.

**What happens when schema and UI hints disagree?** UI hints are overrides, and
the schema is the source of truth for data structure. A UI hint can change
presentation (widget choice, ordering, placeholder text, visibility) but cannot
change the data model (add a field not in the schema, change a field's type, make
a required field optional). If a UI hint references a JSON Pointer that does not
exist in the schema, the compiler ignores it and logs a warning. If a UI hint
sets `hidden: true` on a required field, the field is hidden but still validated
(the user must supply the value through a default or programmatic means). This
rule is simple: UI hints affect how nodes render, never what nodes exist or what
validation runs.

### What the IR Does Not Contain

No data values. No validation state. No dirty/touched/interaction state. No
framework-specific data. No CSS classes. No event handlers. No component
references. No `options: any`. The IR describes structure and constraints. The
runtime owns all mutable state. This avoids the two-sources-of-truth problem
(value in the IR vs value in the store).

### Runtime State (Separate from IR)

```typescript
interface RuntimeState {
  data: unknown                            // current form data
  nodes: Map<NodeId, NodeRuntimeState>     // per-node mutable state
  identities: IdentityMap                  // stable array identity
  submission: SubmissionState              // submission lifecycle
}

interface NodeRuntimeState {
  value: unknown                           // current field value
  validation: ValidationState
  interaction: InteractionState
}

interface ValidationState {
  status: 'idle' | 'pending' | 'valid' | 'invalid'
  errors: ValidationError[]
}

interface ValidationError {
  instancePointer: string                  // JSON Pointer to the failing location
  keyword: string                          // JSON Schema keyword that failed
  message?: string
  params: Record<string, unknown>
}

interface InteractionState {
  dirty: boolean
  touched: boolean
  pristine: boolean                        // inverse of dirty, for convenience
  modified: boolean                        // value differs from initial
}
```

The IR and runtime state are joined by `NodeId`: the IR says "this node is a
required email field with maxLength 100," and the runtime state says "its current
value is `'alice@example.com'`, it is valid, dirty, and touched." Renderers
receive both through `Store<T>` instances (section 7).

## 6. Stable Identity Model

Three kinds of identity serve three purposes:

| Identity | Purpose | Example | Lifetime |
|---|---|---|---|
| `NodeId` | Identify a node in the IR | `"node_abc123"` | Stable across recompilation |
| `StableItemId` | Identify an array item | `"item_xyz789"` | Stable across move/insert/remove |
| JSON Pointer | Address data | `"/address/street"` | Changes when array items move |

### The Problem

JSON Pointer uses array indices: `/items/0`, `/items/1`. When item 0 is removed,
the former item 1 becomes `/items/0`. Every framework's reconciliation algorithm
uses keys to match old and new elements. If the key is the index, removal
triggers re-mount of every subsequent item. If the key is derived from the data
(like RJSF's approach), identical data values produce duplicate keys.

RJSF's `generateRowId` uses `Math.random()`, which means IDs regenerate on every
render cycle that reconstructs the array. JSON Forms uses the array index as
identity, which means reorder is not distinguishable from "delete all and
recreate."

### The Solution

The runtime maintains a parallel identity map:

```typescript
interface IdentityMap {
  // For each array container, maps stable item IDs to current indices
  arrayIdentities: Map<NodeId, StableItemId[]>

  // Reverse lookup: stable item ID to its container and current index
  itemLookup: Map<StableItemId, { containerId: NodeId; index: number }>
}
```

When the runtime processes an `InsertItem` command:

1. Generate a new `StableItemId` (monotonic counter, not random).
2. Insert it at the specified position in the identity array.
3. Update the index of every subsequent item in the reverse lookup.
4. Recompile the affected container's children.

When the runtime processes a `MoveItem` command:

1. Remove the `StableItemId` from its current position.
2. Insert it at the new position.
3. Update indices in the reverse lookup.
4. The `StableItemId` is unchanged; only the index changes.
5. The renderer sees the same key at a different position and animates the move.

When data arrives from outside (server push, undo, reset):

1. The runtime diffs the new array against the old using a configurable matcher.
2. Default matcher: reference equality on primitives, deep equality on objects.
   This is best-effort: two items with identical content are fundamentally
   ambiguous and may swap identities. The runtime accepts an optional identity
   hint (`itemKey`: a JSON Pointer relative to the item, e.g. `/id`) to resolve
   the ambiguity. When present, the matcher uses it instead of deep equality.
   The hint lives in runtime configuration or UI hints, not in the JSON Schema
   itself (identity is Texaryn behavior, not data semantics).
3. Matched items keep their `StableItemId`. Unmatched items get new IDs.
4. This is the one case where identity can change, and it is explicit.

### JSON Pointer Mapping

Renderers and the validation layer need JSON Pointers for data access. The
runtime provides a lookup:

```typescript
function resolvePointer(itemId: StableItemId): string
// Returns "/items/2" for the item currently at index 2

function resolveItemId(pointer: string, containerId: NodeId): StableItemId
// Returns the stable ID for the item at that index in that container
```

The JSON Pointer is stored in the IR snapshot (`NodeBase.dataPointer`) but can
change between snapshots when items above it are inserted or removed. The
`NodeId` and `StableItemId` remain constant across recompilation; the pointer
does not.

## 7. State and Reactivity Model

### Per-Node State

Each node in the IR has an associated state object. The public contract is
`Store<T>`, not signals:

```typescript
interface Store<T> {
  getSnapshot(): T
  subscribe(listener: () => void): () => void  // returns unsubscribe
}
```

Signals are an internal implementation detail. The TC39 Signals proposal (Stage 1
as of 2025) defines a useful shape, and the internal implementation follows it:

```typescript
// Internal only. Not exported from @texaryn/core.
interface Signal<T> {
  get(): T
  set(value: T): void
}

interface Computed<T> {
  get(): T  // derived, recomputes when dependencies change
}
```

Each node exposes its state as `Store<T>` instances:

```typescript
interface NodeState {
  value: Store<unknown>
  errors: Store<ValidationError[]>
  dirty: Store<boolean>
  touched: Store<boolean>
  validationStatus: Store<'idle' | 'pending' | 'valid' | 'invalid'>
  visible: Store<boolean>          // reactive view of the current IR snapshot's resolved value
  disabled: Store<boolean>         // reactive view of the current IR snapshot's resolved value
}
```

The internal signal graph drives computation. The `Store<T>` wrapper exposes the
result. If the TC39 proposal ships natively, or a different reactive engine proves
better, the internal implementation swaps with no public API change.

### Why Not @preact/signals-core?

`@preact/signals-core` is the most mature TC39-shaped signal implementation. But
its effect scheduler assumes it owns the microtask queue, which conflicts with
React's concurrent mode scheduler and Angular's change detection. Embedding it
in a framework-neutral core would force every framework adapter to work around
scheduling conflicts.

Instead: implement a minimal signal core (~200 lines) that provides `Signal`,
`Computed`, and `batch()`. No effect scheduler. Framework adapters use
`getSnapshot() + subscribe(callback) => unsubscribe` (React's `useSyncExternalStore`
contract, also implementable in every other framework). When the TC39 Signals
proposal advances to Stage 3 with native browser support, swap the internal
implementation with no public API change.

### Framework Binding Contract

The `Store<T>` interface (defined above) is the binding contract. Each framework
adapter consumes it:

- **React**: `useSyncExternalStore(store.subscribe, store.getSnapshot)`
- **Vue**: `shallowRef` seeded from `getSnapshot()`, updated via `subscribe`
- **Angular**: `signal()` seeded from `getSnapshot()`, updated via `subscribe`
- **Svelte**: `readable` store wrapping `subscribe`
- **Web Components**: subscription in `connectedCallback`, cleanup in
  `disconnectedCallback`

### Commands (Not Events)

User interactions dispatch typed commands, not raw events:

```typescript
type Command =
  | { type: 'SetValue';    nodeId: NodeId; value: unknown }
  | { type: 'InsertItem';  containerId: NodeId; index: number; value?: unknown }
  | { type: 'RemoveItem';  containerId: NodeId; index: number }
  | { type: 'MoveItem';    containerId: NodeId; from: number; to: number }
  | { type: 'SetTouched';  nodeId: NodeId }
  | { type: 'Submit' }
  | { type: 'Reset';       data?: unknown }
```

Commands are serializable. They can be logged, replayed, sent over a wire (for
collaborative editing), or undone. The command handler is a pure function:

```typescript
function processCommand(state: FormState, command: Command): {
  nextState: FormState
  effects: Effect[]
}
```

Effects are descriptions of side effects to perform:

```typescript
type Effect =
  | { type: 'validate';     nodeIds: NodeId[] }
  | { type: 'recompile';    reason: 'data-changed' | 'schema-changed' }
  | { type: 'executeAction'; actionType: string; args: unknown }
  | { type: 'notify';       event: string; payload: unknown }
```

The effect executor sits outside the pure core. This separation allows the
command handler to be tested without mocking validation or action execution.

### Submission Lifecycle

Submission is the one workflow complex enough to warrant a state machine:

```
idle ──submit──> validating ──all valid──> submitting ──success──> submitted
                     |                        |
                     +-─ invalid ──> idle      +-─ error ──> idle
```

The machine tracks: which validations are pending, whether any failed, whether
submission is in progress, and the submission result. It emits effects
(run validations, execute submit action) rather than performing them.

XState is a good fit for this machine but is not a dependency of the core. The
machine is hand-coded as a reducer function, ~50 lines. XState integration is an
optional adapter for consumers who already use it.

## 8. Validation Architecture

### Validation as Part of the Schema Evaluation Port

The headless core does not validate. It delegates to the `SchemaEvaluationPort`
(section 9), which includes `validate()` and optional `validateAt?()` alongside
`project()`. The validation methods use `MaybePromise`:

```typescript
type MaybePromise<T> = T | Promise<T>

// These methods live on SchemaEvaluationPort (section 9).
// Shown here for the validation architecture discussion.
//
//   validate(data: unknown): MaybePromise<ValidationResult>
//   validateAt?(data: unknown, pointer: JsonPointer): MaybePromise<ValidationResult>

interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}
```

The port accepts both synchronous and asynchronous validators via `MaybePromise`.
The runtime normalizes internally with `await`, so synchronous validators take the
fast path (no microtask deferral when the result is already resolved), while
async validators (server-side checks, debounced validation, cross-field lookups)
work without a separate port.

### Why MaybePromise, Not Pure Async

RJSF has no async validation. Adding it retroactively would require changing
every call site that assumes `isValid` is synchronous, including the
`retrieveSchema` hot path where `isValid` is called during schema resolution.
The port must accommodate async from day one.

But pure `Promise<T>` on every call has real costs: Promise scheduling overhead,
harder-to-debug stack traces, and testing complexity where every assertion needs
`await`. `MaybePromise<T>` gives synchronous validators (AJV, @cfworker) a
genuinely synchronous fast path while keeping the port open for async validators
from the start.

### Validator Implementations

#### AJV (v8.20.0, 378M weekly downloads, 33KB gzipped)

The most widely used JavaScript JSON Schema validator. Supports 2020-12 natively
since v8. Compiles schemas to JavaScript functions, making it the fastest
validator for repeated validation. Error paths use `instancePath` (JSON Pointer).

**Disqualified for annotation collection.** AJV's documentation explicitly states
that metadata keywords (title, description, default, readOnly, writeOnly,
examples, deprecated) are "reserved but not collected." The docs note "format
keywords will still collect annotations once supported," confirming annotations
are planned, not implemented. You would have to traverse the schema yourself to
collect metadata, which defeats the purpose of running it through applicators.

**Maintenance:** Joined OpenJS Foundation. Last release v8.20.0 (April 2026),
last commit May 2026. Releases are infrequent; the pace has declined from its
peak. v8.18.0 was a security fix (CVE-2025-69873). Stable but not rapidly
evolving.

**CSP incompatible.** Uses `new Function()` for code generation. Does not work
in Cloudflare Workers, strict CSP environments, or some browser extensions
without build-step precompilation.

**Recommendation:** support as a validation-only adapter for consumers who
already use it. Do not couple the core to it.

#### @hyperjump/json-schema (v1.17.8, 337K weekly downloads, 71KB gzipped)

Full 2020-12 compliance including vocabularies and annotation collection. This is
the only JavaScript validator that implements the spec's annotation collection
algorithm.

**Annotation collection is the critical differentiator.** The library provides a
dedicated `annotate()` function (separate from `validate()`) that processes an
instance through a schema and returns an annotated node AST. The API includes:
- `annotate(schemaUri, instance, outputFormat)`: produces the annotated tree
- `annotation(instance, keyword, dialectId)`: retrieves annotations at a location
- `annotatedWith(instance, keyword, dialectId)`: yields nodes with an annotation

This correctly implements the JSON Schema spec rule that annotations within a
failing branch of oneOf/anyOf/then/else are ignored even when the instance
validates against the complete document.

**Maintained by a JSON Schema spec author.** The maintainer (Jason Desrosiers) is
a core contributor to the specification and a top StackOverflow answerer for the
jsonschema tag. The library was built as the reference implementation for
annotation collection. Last publish: August 2026 (24 days ago). Only 7 open
issues. Steady release cadence.

**CSP safe.** Pure interpretation (no `eval`, no `new Function`). Works in
browsers, Node, web workers, and Cloudflare Workers.

**Performance tradeoff.** Slower than AJV (interpreted, no code generation). For
a form runtime that validates on user interaction (not millions of records), this
is unlikely to matter.

**Recommendation:** use as the reference validator implementation. Annotation
collection through applicators is the mechanism the IR compiler depends on.

#### @cfworker/json-schema (v4.1.1, 7.7M weekly downloads, 6KB gzipped)

Designed for Cloudflare Workers. Supports drafts 4, 7, 2019-09, 2020-12.
Validated against ~4,500 assertions from the json-schema-test-suite. Error output
includes `instanceLocation` and `keywordLocation` as JSON Pointers.

**No annotation collection.** The `validate()` function returns
`{ valid, errors }` only. Internal `evaluated` tracking for
`unevaluatedProperties`/`unevaluatedItems` is never exposed.

**CSP safe.** No `eval`, no `new Function`. The smallest bundle of all
candidates.

**Maintenance note:** last npm publish January 2025 (19 months ago). High
download count is driven by RJSF which bundles it as an alternative validator.

**Recommendation:** viable as a lightweight validation-only adapter for
CSP-restricted environments, paired with separate annotation extraction.

#### json-schema-library (v11.6.2, 548K weekly downloads, 31KB gzipped)

A surprise find. This library was designed with form builder use cases in mind
(the author also maintains `@sagold/react-json-editor`). Supports drafts 04
through 2020-12.

**Partial annotation support, with form-builder-oriented APIs:**
- `getNode(pointer)`: resolves a JSON Pointer through the compiled schema and
  returns the resolved schema node, giving access to title, description, default,
  readOnly, writeOnly
- `getChildSelection()`: lists available sub-schema options for oneOf scenarios
- `getData()`: generates default-populated objects from schemas
- `eachNode()`: traverses all schema nodes

This is not the JSON Schema spec's formal annotation collection through
applicators. It resolves the effective schema at any data pointer, from which you
can read metadata directly. For the 90% case (properties, allOf, simple oneOf),
this works. For the edge case (annotations from a oneOf branch that fails locally
but contributes to a passing full-document evaluation), only @hyperjump is correct.

**CSP safe.** No code generation.

**Actively maintained.** Latest release July 2026. Steady cadence.

**Recommendation:** worth evaluating as an alternative to @hyperjump if full
spec-compliant annotation collection proves unnecessary in practice. The
form-builder-oriented API (`getNode`, `getChildSelection`) may be more practical
to integrate.

#### Validator Comparison

| | AJV | @hyperjump | @cfworker | json-schema-library |
|---|---|---|---|---|
| 2020-12 | Yes | Yes | Yes | Yes |
| Annotations | No | Yes (spec) | No | Partial (pragmatic) |
| CSP safe | No | Yes | Yes | Yes |
| Bundle (gzip) | 33KB | 71KB | 6KB | 31KB |
| Downloads/week | 378M | 337K | 7.7M | 548K |
| Last publish | 2026-04 | 2026-08 | 2025-01 | 2026-07 |
| Status | Stable, slowing | Active | Slow | Active |

#### Validator Choice Decision

The core does not choose a validator. The `SchemaEvaluationPort` owns both
validation and schema projection, and its implementations wrap whatever library
the consumer prefers. Validation is one of two responsibilities (alongside
`project()`), not a separate subsystem.

For annotation collection: static extraction (walking the resolved schema tree)
covers properties, allOf, and simple oneOf where a discriminator property selects
the branch. Data-dependent annotation resolution (which oneOf/anyOf branch applies
given current data) requires a validator that exposes annotation results per
branch. @hyperjump/json-schema implements this through its `annotate()` API
(currently marked experimental). Adapters backed by AJV or @cfworker degrade to
static extraction for these edge cases, which means annotations from the
non-matching branch of a oneOf may be missing. This is acceptable for most forms
and documented as a known limitation of those adapters.

### Validation Scheduling

The runtime decides when to validate, not the renderer:

- **On blur** (default): validate the field when `SetTouched` fires
- **On change**: validate after every `SetValue`, debounced
- **On submit**: validate all fields on `Submit`
- **On demand**: the host can trigger validation for specific nodes

Scheduling is configurable per-field and globally. The configuration lives in UI
hints, not in the schema.

### Error Mapping

Validation errors reference JSON Pointers. The runtime maps them to `NodeId`
using the identity model from section 6. Errors for nested properties map to the
deepest matching node. Errors for array items map to the specific item's node
using the stable identity map.

## 9. Schema Evaluation Architecture

### The Port

The schema evaluation port is the boundary between domain description (JSON
Schema today, potentially Zod or TypeBox later) and the IR compiler. It owns
two responsibilities: producing a resolved schema projection for current data,
and validation.

```typescript
type MaybePromise<T> = T | Promise<T>

interface SchemaEvaluationPort {
  project(data: unknown): SchemaProjection
  // Returns the full resolved view of the schema given current data.
  // Handles $ref resolution, if/then/else, dependentSchemas, oneOf/anyOf
  // discrimination, and annotation collection in a single pass.
  // SchemaProjection is a transient resolved view, not a long-lived
  // normalized-domain layer.

  validate(
    data: unknown
  ): MaybePromise<ValidationResult>
  // Full-document validation. Authoritative: the result accounts for
  // cross-property constraints, dependentRequired, if/then/else,
  // contains, unevaluated*, and combinators.

  validateAt?(
    data: unknown,
    pointer: JsonPointer
  ): MaybePromise<ValidationResult>
  // Optional single-pointer validation with explicitly weaker semantics.
  // May miss cross-property and combinator constraints. A fast path
  // for on-blur feedback, not part of the correctness model. The runtime
  // falls back to full validate() when this is absent or on submit.
}

interface SchemaProjection {
  nodes: Map<JsonPointer, NodeProjection>
}

interface NodeProjection {
  type: JsonSchemaType
  format?: string
  constraints: FieldConstraints
  children?: ChildProjection[]    // for object/array types
  enumValues?: EnumOption[]       // for enum types
  active: boolean                 // false if hidden by conditionals
  annotations: AnnotationSet
}

interface AnnotationSet {
  title?: string
  description?: string
  readOnly?: boolean
  writeOnly?: boolean
  deprecated?: boolean
  examples?: unknown[]
  default?: unknown
}
```

The data flow is:

```text
JSON Schema + data
       ↓
SchemaEvaluationPort.project()
       ↓
SchemaProjection  (transient resolved view)
       ↓  + UIHints + IdentityMap
     compile()
       ↓
   UIDocument
```

The IR compiler calls `project()` to build the flat node map.
The runtime calls `project()` again after data changes to detect whether the
active projection shifted, and re-compiles affected subtrees if it did.

### json-schema-library as Design Reference

The `json-schema-library` package (v11.6.2, 548K weekly downloads) deserves study
before implementing the port. Its `getNode(pointer, data)` API resolves a JSON
Pointer through a compiled schema using current instance data, handling `oneOf` and
`dependencies` dynamically. Its `getChildSelection()` lists available sub-schema
options. Its `eachNode()` traverses all schema nodes. These are close to the
operations `SchemaEvaluationPort.project()` needs. The implementation may be usable
directly, wrapped behind the port, or its approach replicated.

### JSON Schema Adapter

The first (and for v1, only) adapter implements `SchemaEvaluationPort` for JSON
Schema. Its responsibilities:

1. **$ref resolution.** Resolve all `$ref` pointers including recursive refs.
   Use `$anchor` and `$dynamicAnchor` from 2020-12. Handle circular refs by
   detecting cycles and inserting placeholder nodes. Local `$defs`/`$ref` is
   in the MVP scope; remote `$ref` and `$dynamicRef` are deferred.

2. **Active schema projection.** Process `if`/`then`/`else`,
   `dependentSchemas`/`dependentRequired`, and the draft-07 `dependencies`
   keyword against current data. Return `active: true/false` per pointer.
   This is the schema evaluation layer's core job: maintaining which fields
   exist and which constraints apply as data changes.

3. **oneOf/anyOf discrimination.** When a field uses `oneOf` or `anyOf`,
   determine which sub-schema applies to the current data. This is where JSON
   Forms falls down: it destroys data that does not match the newly selected
   sub-schema. The correct behavior: preserve all data, validate against the
   selected sub-schema, and report active/inactive branches.

4. **Annotation collection.** Extract `title`, `description`, `default`,
   `readOnly`, `writeOnly`, `deprecated`, `examples` from the applicable
   sub-schemas. For `oneOf`/`anyOf`, collect from the matching branch.
   @hyperjump/json-schema provides spec-compliant annotation collection through
   its `annotate()` API (currently marked experimental). This is the strongest
   existing implementation for data-dependent annotation resolution, but it is
   one adapter implementation, not the architecture.

5. **Format handling.** Map JSON Schema `format` values to IR field types and
   widget hints. `"email"` produces a string field with `format: "email"`;
   the renderer decides whether that means `<input type="email">` or a custom
   email widget.

### Adapter Packaging

The schema evaluation port is defined in `@texaryn/core` (interface only).
Implementations live in their own packages:

- `@texaryn/schema-json`: JSON Schema adapter. Depends on a validator library
  as a peer dependency.
- `@texaryn/schema-json-hyperjump`: adapter backed by @hyperjump/json-schema
  (spec-compliant annotation collection, CSP safe).
- `@texaryn/schema-json-ajv`: adapter backed by AJV (fast, widest ecosystem,
  no annotation collection, not CSP safe).

Texaryn is not a wrapper around any specific validator. The port defines what
the runtime needs; adapters implement it with whatever library fits.

### UI Hints

UI hints are not part of the JSON Schema. They are a separate document that maps
JSON Pointers to presentation overrides:

```typescript
interface UIHints {
  [jsonPointer: string]: FieldHints | ArrayHints
}

interface FieldHints {
  widget?: string           // override widget selection
  order?: number            // override sibling order
  placeholder?: string
  helpText?: string
  colSpan?: number          // layout hint for grid containers
  hidden?: boolean          // force hide regardless of schema
  validationTrigger?: 'blur' | 'change' | 'submit'
}

interface ArrayHints extends FieldHints {
  itemKey?: JsonPointer     // pointer relative to item, e.g. '/id'
  canReorder?: boolean      // enable drag-to-reorder UI
}
```

UI hints are optional. Without them, the compiler produces a usable IR from the
schema alone. With them, the IR can be customized without modifying the schema.

This is explicitly not `x-jsf-presentation` embedded in the schema (the
@remoteoss approach). Schema and presentation are separate inputs to the
compiler.

### Draft Support

**JSON Schema 2020-12** is the primary target. Full support including:
`$ref`, `$dynamicRef`, `$anchor`, `$dynamicAnchor`, `$vocabulary`,
`if`/`then`/`else`, `dependentSchemas`, `dependentRequired`,
`prefixItems`/`items`, `unevaluatedProperties`/`unevaluatedItems`.

**Draft 2019-09** is supported because 2020-12 is a minor revision of it.

**Draft-07** is supported through a dialect-aware evaluator that processes
draft-07 schemas natively, using draft-07 semantics. This is not keyword
mapping: `$ref` behavior, tuple arrays (`items` + `additionalItems`),
`dependencies`, and evaluation semantics differ between drafts, so a translation
layer would introduce silent semantic bugs. The underlying validator libraries
(AJV, @hyperjump, json-schema-library) already handle multiple dialects natively;
the adapter delegates to the dialect the schema declares.

**Draft-04** is deferred. It has significant keyword differences (`id` vs `$id`,
`definitions` vs `$defs`, different `$ref` resolution) that would complicate the
adapter without clear demand. Add it when a consumer needs it.

### Dialect Detection

```typescript
type Dialect = 'draft-07' | '2019-09' | '2020-12'

interface DialectConfig {
  defaultDialect: Dialect    // used when $schema is absent
}

function detectDialect(
  schema: unknown,
  config: DialectConfig
): Dialect {
  if (typeof schema !== 'object' || schema === null) return config.defaultDialect
  const s = schema as Record<string, unknown>
  if (typeof s.$schema === 'string') {
    if (s.$schema.includes('draft-07')) return 'draft-07'
    if (s.$schema.includes('2019-09')) return '2019-09'
    if (s.$schema.includes('2020-12')) return '2020-12'
  }
  return config.defaultDialect
}
```

When `$schema` is absent, the adapter uses a configurable `defaultDialect`
(initially `'draft-07'`, since the majority of schemas in the wild use draft-07)
rather than guessing from keyword heuristics. The consumer can set this to
`'2020-12'` if they know their schemas are modern.

## 10. Renderer Contract

### Widget Registration

```typescript
interface RendererRegistry {
  register(tester: WidgetTester, component: unknown, rank?: number): void
  resolve(node: UINode): unknown  // returns the best-matching component
}

interface WidgetTester {
  test(node: UINode): boolean
  rank: number  // higher rank wins when multiple testers match
}
```

This is the JSON Forms tester/rank pattern, which is its best design decision.
A widget registers with a tester function and a rank. When the runtime needs a
component for a node, it runs all testers and picks the highest-ranked match.

Example registrations:

```typescript
// Default: any string field gets TextInput
registry.register({ test: n => n.type === 'field' && n.fieldType === 'string', rank: 1 }, TextInput)

// Override: string fields with format "email" get EmailInput
registry.register({ test: n => n.type === 'field' && n.format === 'email', rank: 2 }, EmailInput)

// Override: string fields with widget hint "textarea" get Textarea
registry.register({ test: n => n.type === 'field' && n.widget === 'textarea', rank: 3 }, Textarea)
```

### Prop Getters

Following Zag.js and Downshift, the renderer binding provides prop getter
functions rather than raw props:

```typescript
interface FieldProps {
  getLabelProps(): Record<string, unknown>
  getInputProps(): Record<string, unknown>
  getErrorProps(): Record<string, unknown>
  getDescriptionProps(): Record<string, unknown>
}
```

Prop getters handle ARIA attributes, `id` generation, `htmlFor` linking, error
association via `aria-describedby`, and required/disabled state. The widget
author calls `getInputProps()` and spreads the result onto their element.

This solves the accessibility gap in every studied project: RJSF's accessibility
depends on each widget theme implementing it correctly; JSON Forms has no
accessibility contract at all. Prop getters centralize the ARIA logic in the
binding layer, not in individual widgets.

### Conformance Suite

A renderer is correct if it passes the conformance test suite. The suite provides:

1. **IR snapshots** covering every node type, field type, and format.
2. **Assertions** for DOM structure (label/input/error association), ARIA
   attributes (required, invalid, describedby), and keyboard interaction.
3. **Interaction tests** that dispatch commands and verify the widget responds
   correctly (value change, touch on blur, array add/remove/reorder).

The suite is framework-agnostic. It accepts a `render` function and a
`querySelector` function, so it works with React Testing Library, Angular
TestBed, and bare DOM.

```typescript
interface ConformanceSuiteConfig {
  render(ir: UIDocument, registry: RendererRegistry): Element
  querySelector(root: Element, selector: string): Element | null
  dispatchEvent(element: Element, event: Event): void
  waitForUpdate(): Promise<void>  // wait for framework rendering cycle
}
```

## 11. Actions and Effects

### Action Registry

```typescript
interface ActionRegistry {
  register(
    actionType: string,
    handler: ActionHandler,
    schema?: unknown  // JSON Schema for args validation
  ): void

  dispatch(actionType: string, args: unknown): Promise<ActionResult>
}

type ActionHandler = (args: unknown, context: ActionContext) => Promise<ActionResult>

interface ActionContext {
  getData(): unknown
  getNodeState(nodeId: NodeId): NodeState
  dispatch(command: Command): void
}

interface ActionResult {
  ok: boolean
  data?: unknown
  error?: string
}
```

Actions are registered by the host application, not defined in the schema or IR.
The IR can reference action types by name (`ActionNode.actionType`), and the
runtime validates that the action exists before allowing the node to render as
enabled.

### Built-in Actions

Two actions are always registered:

- `submit`: collects form data, runs full validation, calls the user-provided
  submit handler
- `reset`: resets form data to initial values, clears dirty/touched/validation
  state

All other actions are host-defined. Examples: "navigate", "openModal",
"addToCart". The runtime has no opinion about what they do.

### Why Not Arbitrary Expressions?

The Adaptive Cards expression language and Formly's expression parser both
created Turing-complete evaluation in the template layer. This prevents static
analysis, creates security risks for server-driven UI, and makes the IR
unpredictable (the same IR can produce different results depending on the
expression evaluation context).

Declarative actions with serializable arguments avoid all three problems.
The tradeoff: you cannot express "when this field changes, set that field to
this value" in the IR. You express it in the host application's action handler.
This is the correct boundary for a headless runtime.

## 12. Extensibility

### Extension Points

The system has five extension points, ordered from most to least common:

1. **Widgets.** Register a component for a specific node type/format/widget
   combination. This is the primary extension mechanism.

2. **Schema evaluation adapters.** Implement the `SchemaEvaluationPort` for a
   different validation library or schema format.

3. **Actions.** Register host-specific action handlers.

4. **Future schema formats.** Implement `SchemaEvaluationPort` for a different
   schema format (Zod, TypeBox, GraphQL introspection).

5. **IR transforms.** Post-compilation transforms that modify the IR before
   the renderer sees it. Use cases: add layout wrappers, inject help text,
   apply theme-specific node attributes.

### Plugin Model

Plugins are plain functions that receive the runtime configuration and register
their extensions:

```typescript
interface Plugin {
  name: string
  setup(runtime: RuntimeConfig): void
}

interface RuntimeConfig {
  widgets: RendererRegistry
  actions: ActionRegistry
  schemaEval: SchemaEvaluationPort
  transforms: TransformPipeline
}
```

No lifecycle hooks. No dependency injection. No middleware chain. A plugin is a
function that calls `register` on the registries it cares about. This is
deliberately minimal.

Formly's extension pipeline is more powerful (lifecycle hooks, pre/post
processing, wrapper injection) but also more complex. The minimal plugin model
can grow toward Formly's if demand warrants it. Starting with it would be
premature.

### IR Transforms

```typescript
type IRTransform = (document: UIDocument) => UIDocument

interface TransformPipeline {
  add(transform: IRTransform, priority?: number): void
  apply(document: UIDocument): UIDocument
}
```

Transforms run after compilation and before the renderer receives the IR. They
are pure functions (deterministic, no side effects). Use cases:

- **Layout injection**: wrap every top-level field group in a layout container
- **Help text injection**: add text nodes below fields that have descriptions
- **Conditional removal**: strip nodes based on feature flags

Transforms are optional. The IR is usable without them.

## 13. AI and Server-Driven UI

### IR as Exchange Format

The IR (section 5) is the exchange format for server-driven and AI-generated UI.
A server or an AI model produces a `UIDocument` (or a partial update to one),
and the runtime processes it identically to a locally compiled document.

This works because:
- The IR is serializable (JSON).
- The IR is typed and versioned.
- The IR contains no expressions (no evaluation context dependency).
- The IR contains no framework-specific data.

### Server-Driven UI Flow

```
Server ──(UIDocument JSON)──> Client Runtime
  |                               |
  |  partial update:              |
  |  { patch: [                   |
  |    { op: "replace",           |
  |      path: "/nodes/n1/visible"|
  |      value: true }            |
  |  ]}                           |
  |                               |
  +─(JSON Patch)────────────────> |
```

The server can send a full `UIDocument` on initial load and JSON Patch updates
for subsequent changes. The runtime applies patches, updates affected node
signals, and the renderer updates the affected widgets.

### AI-Generated UI Flow

An AI model (local or remote) generates IR in one of two ways:

1. **Schema generation.** The AI produces a JSON Schema and optional UI hints.
   The runtime compiles them through the normal pipeline. This is safer because
   the schema is validated before compilation.

2. **IR generation.** The AI produces a `UIDocument` directly. The runtime
   validates the IR against the versioned type definitions before rendering. This
   is faster (skips compilation) but requires the AI to produce valid IR.

In both cases, the runtime validates the input before processing. Malformed
schemas or IR documents are rejected with typed errors, not rendered with
undefined behavior.

### Security Boundary

Server-driven and AI-generated UI introduces a trust boundary. The IR can
reference action types, but actions execute only if the host registered them.
An IR document that references an unregistered action type renders the action
button as disabled.

This is the same pattern as DivKit's action catalog: the server can describe
what actions exist, but the client decides which are allowed.

Additional security constraints for remote IR:
- No `eval` or dynamic code in any layer.
- Action arguments are validated against the registered schema before dispatch.
- The IR validator rejects unknown node types and unknown properties.
- Rate limiting on IR updates (prevent DoS via rapid re-compilation).

## 14. Package Structure

```
packages/
  core/               @texaryn/core
    src/
      ir/             IR type definitions, document builder
      compiler/       Schema-to-IR compiler
      state/          Signal implementation, node state
      commands/       Command types, command handler
      identity/       Stable identity map
      actions/        Action registry, built-in actions
      validation/     Validation orchestrator, scheduler
      transforms/     IR transform pipeline
      index.ts        Public API

  schema-json/        @texaryn/schema-json
    src/
      evaluation/     SchemaEvaluationPort implementation
      refs/           $ref resolution (local $defs first, remote later)
      conditionals/   if/then/else, dependencies, active schema projection
      annotations/    Annotation extraction
      dialects/       Draft detection, draft-07 compat
      index.ts

  schema-json-hyperjump/  @texaryn/schema-json-hyperjump
    src/              Adapter backed by @hyperjump/json-schema
                      (spec-compliant annotation collection)

  schema-json-ajv/    @texaryn/schema-json-ajv
    src/              Adapter backed by AJV
                      (fast validation, no annotation collection)

  react/              @texaryn/react
    src/
      hooks/          useForm, useField, useFieldArray
      binding/        Store-to-React bridge (useSyncExternalStore)
      prop-getters/   ARIA prop generators
      components/     FormRoot, FieldRenderer, ArrayRenderer
      index.ts

  vue/                @texaryn/vue
  angular/            @texaryn/angular
  wc/                 @texaryn/wc

  test-suite/         @texaryn/test-suite
    src/
      fixtures/       IR snapshots for every node type
      assertions/     DOM structure, ARIA, interaction
      runner/         Framework-agnostic test runner
```

### Dependency Rules

- `core` has zero runtime dependencies.
- `schema-json` depends on `core` (for IR types and `SchemaEvaluationPort`).
- `schema-json-hyperjump` depends on `schema-json` and on
  `@hyperjump/json-schema` as a peer dependency.
- `schema-json-ajv` depends on `schema-json` and on `ajv` as a peer dependency.
- Framework packages depend on `core` and on their respective framework as a
  peer dependency.
- `test-suite` depends on `core` only.

### Build

TypeScript with project references. Each package compiles to ESM and CJS.
The core emits `.d.ts` files that downstream packages consume.

Monorepo tooling: pnpm workspaces or npm workspaces. Turborepo or Nx for build
orchestration. The choice is not load-bearing; either works.

## 15. Security Model

### Threat Model

The primary threats come from remote IR (server-driven UI, AI-generated UI):

1. **Malicious IR injection.** An attacker crafts an IR document that references
   actions the host did not intend to expose, or that contains node properties
   designed to cause XSS through the renderer.

2. **Schema injection.** An attacker provides a JSON Schema that causes excessive
   computation (deeply nested `$ref`, exponential `oneOf` combinatorics).

3. **Validation bypass.** An attacker submits data that passes client-side
   validation but exploits differences between the client validator and the
   server validator.

### Mitigations

**IR validation.** Every `UIDocument` from an external source is validated
against a strict JSON Schema for the IR itself. Unknown properties are rejected.
Node types must be from the known set. Action types must exist in the host's
action registry.

**Schema depth limits.** The `$ref` resolver has a configurable recursion limit
(default: 10). The `oneOf`/`anyOf` evaluator has a branch limit (default: 20).
These prevent resource exhaustion from adversarial schemas.

**No HTML in IR.** The IR contains strings (titles, descriptions, error
messages), never HTML. Renderers must escape all string content. The conformance
suite asserts this.

**Validation is advisory.** Client-side validation is a UX feature. The server
must re-validate every submission. The runtime makes no guarantee that validated
data is safe; it guarantees that data _reported as valid_ matched the schema at
the time of validation.

**Content Security Policy.** The runtime executes no dynamic code. No `eval`, no
`Function()`, no `innerHTML` assignment. Framework renderers must follow their
framework's security guidelines (React's JSX escaping, Angular's DomSanitizer).

### Expressions and Code Execution

The runtime has no expression language and executes no user-provided code. This
is a deliberate security decision, not a missing feature. Every project that
added an expression language (Formly, Adaptive Cards, Angular forms) eventually
needed to sandbox it. The correct design is to not have one.

## 16. Versioning and Compatibility

### What Gets Versioned

Four surfaces have independent version considerations:

1. **Runtime API** (`@texaryn/core` public exports). Follows semver. Breaking
   changes require a major bump.

2. **IR format** (`UIDocument` type definition). Carries its own version number
   inside the document. Breaking changes to the IR shape require:
   - A new IR version number.
   - A migration function from the old version to the new one.
   - Renderers declare which IR versions they support.
   - The runtime can run the migration at compile time.

3. **Schema evaluation contract** (`SchemaEvaluationPort`). Defined in `core`,
   implemented in `schema-json-*` packages. Changes affect every adapter.

4. **Renderer contract** (widget registration, prop getters, conformance suite).
   Changes here affect every renderer. The conformance suite is versioned with
   the core, and renderers target a suite version.

### IR Versioning Strategy

The IR version is a single integer, not semver. It increments on every breaking
change. Migration functions form a chain:

```typescript
const migrations: Record<number, (doc: UIDocument) => UIDocument> = {
  2: migrateV1ToV2,
  3: migrateV2ToV3,
}

function migrateToLatest(doc: UIDocument): UIDocument {
  let current = doc
  while (current.version < LATEST_VERSION) {
    const migrate = migrations[current.version + 1]
    if (!migrate) throw new Error(`No migration from v${current.version}`)
    current = migrate(current)
  }
  return current
}
```

This allows persisted IR documents (server-driven UI scenarios) to survive
runtime upgrades.

### Breaking Change Policy

Before 1.0: the IR and public API may change between minor versions. After 1.0:
semver applies strictly. IR breaking changes trigger a major version. Migration
functions are provided for at least two major versions back.

## 17. Testing Strategy

### Layers

1. **Unit tests for the pure core.** The compiler, command handler, identity map,
   and validation orchestrator are pure functions. Test them with property-based
   testing (fast-check): generate random schemas and data, assert invariants
   (all nodes have unique IDs, identity map is consistent, commands are
   reversible).

2. **Integration tests for the JSON Schema adapter.** The adapter is tested
   against the JSON Schema Test Suite (the official test suite used by validator
   implementations). This catches $ref resolution bugs, conditional evaluation
   bugs, and annotation collection gaps.

3. **Conformance tests for renderers.** Each renderer runs the conformance suite
   (section 10). This is the mechanism that makes "works with any framework" a
   tested claim.

4. **Snapshot tests for the IR.** A set of reference schemas with expected IR
   output. These detect unintended IR changes during refactoring.

5. **Performance benchmarks.** Compilation time, state update time, and memory
   usage for representative schemas (10 fields, 50 fields, 200 fields, nested
   arrays). Run in CI with regression thresholds.

### Property-Based Testing Invariants

These invariants hold for any valid schema and data:

- Every `NodeId` in the document is unique.
- Every `parentId` references an existing node.
- Every `children` array contains only existing `NodeId` values.
- The `rootId` exists and has `parentId: null`.
- Every non-null `dataPointer` resolves to a location in the data when the
  field's closest required ancestor is present. Optional unfilled fields may
  have a `dataPointer` whose parent path does not yet exist in the data.
- The identity map is consistent: every `StableItemId` maps to an existing
  index, and every index maps back to the correct `StableItemId`.
- `processCommand(state, command)` followed by the inverse command returns to
  the original state (for reversible commands: SetValue, MoveItem).

### Test Runner

Vitest. It supports TypeScript natively, runs in Node (for core tests), and can
run in browser mode (for renderer tests). The test infrastructure has no
dependency on the core.

## 18. Performance Model

### Hotspots

1. **IR compilation.** Runs on initial render and on every data change for
   schemas with conditionals. The compiler walks the schema tree and produces a
   flat node map. For a 50-field form, this should complete in under 1ms.

2. **Diffing.** When the IR is recompiled, the runtime diffs old and new node
   maps to determine which signals to update. A naive diff (iterate all nodes,
   compare) is O(n) where n is node count. For forms under 200 fields, this is
   fast enough. For larger forms, a targeted diff (only recompile the subtree
   affected by the data change) is worth implementing.

3. **Validation.** Async validation introduces latency by definition. The
   scheduling strategy (section 8) controls when validation runs. The runtime
   should batch validation requests: if three fields change in quick succession,
   run one validation pass, not three.

4. **Store updates.** Per-node stores mean a value change updates one store, not
   a global state object. The framework adapter subscribes to that store and
   re-renders one widget. This is the performance win over RJSF's centralized
   state (which re-renders the entire form on every keystroke).

### Benchmarks to Publish

- Time to first render: schema parse + compile + first framework render
- Keystroke latency: time from input event to DOM update
- Array operations: insert/remove/reorder at various array sizes
- Memory: node count vs memory usage (to detect leaks in signal subscriptions)
- Validation throughput: validations per second for a representative schema

### Targeted Recompilation

For schemas with data-dependent conditionals (`if`/`then`/`else` where the `if`
references a specific field's value), the compiler can track which fields affect
which conditionals. When a `SetValue` command fires, only the conditionals that
depend on the changed field are re-evaluated. This is a performance improvement, not a
requirement for v1, but the compiler should be structured to allow it.

## 19. Milestones and First PRs

### Phase 0: Foundation (PRs 1-5)

**Goal:** A compilable monorepo with types, the pure core, and one test.

1. **Monorepo scaffold.** pnpm workspace, TypeScript project references,
   `packages/core`, `packages/schema-json`, `packages/react`. Build script that
   compiles all packages. No code yet.

2. **IR type definitions and `SchemaEvaluationPort` interface.** All types from
   section 5, `Store<T>` interface, `SchemaEvaluationPort` interface, and
   `MaybePromise<T>` type in `packages/core/src/`. Export from the package root.
   Tests assert the types compile.

3. **`Store<T>` binding spike, then signal implementation.** First: a trivial
   `Store<T>` backed by a plain variable and callback list, with binding tests
   for React (`useSyncExternalStore`) and one of Vue (`shallowRef` +
   `subscribe`) or Angular (`signal()` + `subscribe`). This proves the contract
   works across two frameworks before investing in signal internals. Then:
   ~200 lines internal signal engine (`Signal`, `Computed`, `batch()`), swap the
   trivial store for signal-backed stores. Property-based tests for consistency.

4. **Command types and handler.** All command types from section 7. The handler
   as a pure function. Tests for every command type, including reversibility.

5. **Identity map.** Implementation from section 6. Tests for insert, remove,
   move, and external data reconciliation.

### Phase 1: Schema Evaluation (PRs 6-10)

**Goal:** Given a JSON Schema and data, produce a valid IR backed by a real
schema library.

6. **Schema evaluator spike + ADR.** Evaluate json-schema-library and
   @hyperjump/json-schema against the `SchemaEvaluationPort` contract. Build a
   minimal fixture harness running both against the JSON Schema Test Suite
   ($ref, annotations, validation). Write ADR-002 recording the choice and
   tradeoffs. The chosen library handles $ref resolution, dialect detection,
   and annotation collection; Texaryn does not reimplement any of these.

7. **Concrete `SchemaEvaluationPort` adapter.** Implement the port with the
   library chosen in PR6. The adapter delegates `project()` and `validate()`
   to the library. Covers draft-07 and 2020-12 via dialect-aware evaluation
   (section 9). Local `$ref` works through the library's resolver. Remote
   `$ref` and `$dynamicRef` are deferred: networking, caching, and trust
   policy make them more than library support. Tests: the fixture harness
   from PR6, expanded to core vocabulary.

8. **Schema to IR compilation.** Using the concrete adapter from PR7, compile
   primitives (string, number, integer, boolean), objects, and arrays into IR
   nodes. FieldNodes for primitives, ContainerNodes for objects, array
   ContainerNodes with identity map wiring. Tests: for each schema type, assert
   the IR contains the expected node structure with correct annotations.

9. **Conditional evaluation.** `if`/`then`/`else`, `dependentSchemas`,
   `dependentRequired`, draft-07 `dependencies`. The concrete adapter re-resolves
   affected pointers when data changes. Tests: change data, verify the active
   schema projection updates and IR reflects new visibility.

10. **oneOf/anyOf discrimination.** The concrete adapter determines which
    sub-schema applies given current data. Data preservation (not destruction).
    Tests: switch between sub-schemas, verify data is preserved.

### Phase 2: React Renderer (PRs 11-15)

**Goal:** Render a JSON Schema form in React.

11. **React binding.** `useForm` hook that creates a runtime instance,
    subscribes to `Store<T>` via `useSyncExternalStore`, returns the document.
    `useField` hook for individual field subscription.

12. **Prop getters.** ARIA-correct label, input, error, and description props.
    Tests assert correct `aria-describedby`, `aria-required`, `aria-invalid`.

13. **Default widget set.** TextInput, NumberInput, Checkbox, Select, Textarea,
    DateInput, ArrayControl, ObjectLayout. Each uses prop getters.

14. **Conformance suite (initial).** Test fixtures for every field type. Run
    against the React widget set. This is the proof that the conformance testing
    strategy works.

15. **Demo application.** A single-page app that loads a JSON Schema from a
    textarea, renders the form, and shows the output data in real time. This is
    the project's calling card.

### Phase 3: Validation and Polish (PRs 16-20)

**Goal:** Production-ready validation, error display, and form submission.

16. **Second `SchemaEvaluationPort` adapter.** Implement the port with the
    library not chosen for PR7 (the other of json-schema-library or
    @hyperjump/json-schema). Run the same test suite against both adapters to
    prove the port abstraction holds.

17. **Validation orchestrator.** Wire validation scheduling (blur, change, submit
    triggers). Connect validation results to `NodeRuntimeState.validation`.
    Tests: blur a required empty field, verify the error surfaces; type valid
    input, verify the error clears.

18. **Error display.** Wire validation errors to field nodes. Error summary
    action node. Conformance tests for error ARIA attributes (`aria-invalid`,
    `aria-describedby` pointing to error text).

19. **Form submission.** Submission lifecycle state machine. Submit action.
    Disabled state during submission. Error handling.

20. **Documentation and first release.** API reference (generated from types).
    Getting started guide. Migration guide from RJSF. Publish 0.1.0 to npm.

### Phase 3.x: UI Integration Contract (shipped before Phase 4)

Proves that a third-party UI ecosystem consumes Texaryn without duplicating
renderer glue and without core changes, so the renderer contract is exercised
by a second consumer before the Vue renderer freezes more of it.

- `useFieldBinding(node)` in `@texaryn/react`: the composition layer for field
  widgets (value and `setValue`, label, description, placeholder, display-gated
  errors, ARIA prop getters) with two DOM adapters, `domInputProps` for text,
  number, textarea and select controls and `domCheckboxProps` for checkboxes.
  The default field widgets are built on it.
- `@texaryn/react-bootstrap`: native HTML with Bootstrap 5 classes, no
  `react-bootstrap` dependency, no CSS loaded by the package, versioned
  independently of the core group. It passes the renderer and ARIA conformance
  suites unchanged; those suites now take a registry factory.
- The demo switches between the default and Bootstrap renderers and owns the
  stylesheet.
- Next: the MUI spec validates the same contract against a component system
  (controlled props, `helperText`, error state, theming). Container binding
  primitives are added only if Bootstrap and MUI both duplicate the same
  non-presentational composition.

### Phase 4: Second Renderer (PRs 21-25)

**Goal:** Prove the "framework-neutral" claim by shipping a second renderer.

The second renderer should be Vue (large community, different reactivity model)
or Web Components (framework-neutral proof). Vue is recommended because its
reactivity model is the most different from React, making it the strongest test
of the binding contract.

Web Components have known form participation issues (`formAssociated`,
`ElementInternals`, shadow DOM and `<form>` interaction) that JSFE's current
codebase demonstrates are unresolved. Scoping Web Components as a proof of
neutrality with named risks is honest; scoping them as a primary target is not.

### Phase 5+: Post-Validation

Defer until the project has users:
- Additional schema adapters (Zod, TypeBox)
- Additional renderers (Angular, Svelte, Solid)
- MUI integration through `@texaryn/react-mui` as the third-party React
  component system test (second consumer of the integration contract below)
- Emotion and Tailwind examples as custom styling integration tests
- Non-form node types (tables, lists, layouts)
- Server-driven UI tooling
- AI generation tooling
- Visual form builder
- Drag-and-drop array reorder
- Collaborative editing (OT/CRDT on top of commands)

## 20. Assessment: Decisions, Risks, and Viability

### The 5 Most Important Architectural Decisions

**1. Flat node map IR, not a tree.**
Three independent server-driven UI systems (A2UI, DivKit, json-render) converged
on this shape. It enables O(1) node access, streaming partial updates, and
deterministic diffing. This is the most externally validated decision in the
architecture.

**2. Per-node `Store<T>` with `getSnapshot+subscribe` binding contract.**
This pushes framework integration to the thinnest possible layer (~100 lines per
framework) and guarantees that a value change re-renders one widget, not the
entire form. It avoids JSON Forms' parallel store problem and RJSF's full
re-render problem. Signals are internal; the public contract is stable regardless
of the reactive implementation.

**3. Stable identity as a first-class concept, separate from JSON Pointer.**
Every studied project either lacks this or implements it incorrectly. It is the
prerequisite for correct array reorder, animation, and undo. Building it into the
core from day one prevents the "bolt it on later" failure mode.

**4. `MaybePromise` validator port, not synchronous-only.**
RJSF's synchronous `isValid` call during schema resolution is the root cause of
its inability to add async validation. `MaybePromise<T>` gives synchronous
validators a genuine fast path while keeping the port open for server-side
validation, debounced validation, and cross-field validation from day one.

**5. Schema evaluation as a separate port that reacts to data changes.**
The schema evaluation layer (not the IR) owns "which fields exist and what
constraints apply." The IR contains resolved snapshots, not expressions or
predicates. But the evaluation port re-projects the active schema when data
changes, so conditional schemas (`if`/`then`/`else`, `dependentSchemas`) produce
correct, up-to-date IR. Renderers remain pure functions of the current snapshot.
This avoids both the "stale IR" problem (compile-once) and the "expression
sandbox" problem (Turing-complete template language).

### The 5 Biggest Risks

**1. Second system effect.** This project is designed by someone who maintained
AJSF (Angular JSON Schema Form) and understands every failure mode of the
existing tools. The temptation is to solve every problem at once. The milestones
deliberately defer non-form use cases, but scope creep during implementation is
the likeliest failure mode.

**2. Adoption threshold.** RJSF has 14k+ stars, JSON Forms has 2k+, TanStack
Form has 4k+. A new project must be dramatically better at a specific task to
overcome switching costs. "Better architecture" is not enough; "this form that
took 200 lines in RJSF takes 40 lines here, and array reorder works" is.

**3. Signal implementation risk.** The TC39 Signals proposal is at Stage 1. It
may change significantly or stall. A custom 200-line implementation is small
enough to maintain but is also code that every other signal library's community
has already debugged. The mitigation: exhaustive property-based testing, and the
`getSnapshot+subscribe` contract is stable regardless of the internal
implementation.

**4. JSON Schema complexity.** Full 2020-12 support including `$dynamicRef`,
`unevaluatedProperties`, and annotation collection through applicators is a
significant implementation effort. The JSON Schema Test Suite helps, but edge
cases in $ref resolution and oneOf discrimination have bitten every project.

**5. The "one more renderer" trap.** Each new renderer (Vue, Angular, Web
Components, Svelte, Solid) is a maintenance commitment. React-only with a
credible second renderer proof is better than five half-maintained renderers.

### Decisions That Would Be Expensive to Reverse

**1. Flat node map vs tree IR.** Once renderers consume a flat map, switching to a
tree structure changes every renderer and every IR consumer. Commit early, with
the convergent evidence from A2UI/DivKit/json-render as justification.

**2. Stable identity as a core concept.** If array identity is added later as a
bolt-on, every command, every renderer, and every test must be retrofitted. RJSF
and JSON Forms both show that positional identity, once shipped, becomes permanent.

**3. The `getSnapshot+subscribe` binding contract.** Every framework adapter is
built against this interface. Changing it means rewriting every adapter. The
contract is minimal enough that it should survive, but if it turns out to be
insufficient for pull-based frameworks (Solid, Svelte 5), the alternatives
(exposing raw signals, adding a `pull()` method) are additive rather than
breaking.

**4. Schema evaluation as a port boundary.** The division between "schema
evaluation port resolves the active schema" and "IR compiler produces snapshots
from that projection" shapes every data flow in the system. If the evaluation
logic is baked into the compiler instead, extracting it later requires splitting
a monolithic component. If the port interface is wrong (too chatty, too coarse,
missing a method the compiler needs), every adapter must be rewritten. This
boundary deserves an ADR before PR #1.

**5. `MaybePromise` validator contract.** Making the port sync-only after shipping
it as `MaybePromise` is additive (callers already handle both). Making it async
after shipping sync would break every call site. `MaybePromise` is the
cheapest starting position because sync validators return plain values (no
`Promise.resolve()` wrapper needed) and async validators work without a separate
port.

### Smallest MVP Worth Publishing

A package that takes a JSON Schema (draft-07 or 2020-12) and renders a working
form in React with:
- Object, string, number, integer, boolean, enum fields
- Required validation (sync)
- Async validation (server-side, debounced)
- Dirty and touched tracking
- Arrays with add, remove, and stable identity
- Local `$defs`/`$ref` (reusable schema fragments)
- Submit with loading state
- Deterministic commands (serializable, replayable)

This is phases 0-3. Local `$ref` is included because a JSON Schema form builder
without it looks toy-like in its first release, and local `$ref` resolution is
straightforward compared to remote refs or `$dynamicRef`. If this demo form does
not feel meaningfully better than the equivalent RJSF or JSON Forms code, the
project does not have product-market fit and should not proceed.

Deferred from MVP:
- Remote `$ref`
- `$dynamicRef`
- `unevaluatedProperties`/`unevaluatedItems`
- Complex `oneOf`/`anyOf` UI generation
- `if`/`then`/`else` UI generation (schema evaluation port supports it; UI
  generation from it is deferred)

### What to Defer Until After Product-Market Validation

- Schema adapters for anything other than JSON Schema
- Renderers beyond React and one proof-of-neutrality renderer
- Non-form node types (tables, lists, general layouts)
- Server-driven UI tooling (the IR supports it by construction; the tooling can wait)
- AI generation tooling
- Visual form builder
- Drag-and-drop reorder (array add/remove/move via commands is sufficient)
- Draft-04 JSON Schema support
- Collaborative editing
- IR migrations (not needed until the IR has shipped and changed)
- Plugin ecosystem

### Why Not Build on TanStack Form?

This is the strongest counterargument to a new project and deserves a direct
answer.

TanStack Form provides: a tested framework-neutral core, seven working adapters,
async validation with cancellation, Standard Schema V1 integration, and pluggable
validation scheduling. Building a schema-driven layer on top is feasible: pipe
AJV errors through `prefixSchemaToErrors` into `GlobalFormValidationError`, and
the error path format is compatible.

Three layers would need to be built on top: (a) schema traversal and field-set
derivation (the entire JSON Schema `$ref`/conditional/oneOf/annotation stack),
(b) annotation extraction and widget mapping (the entire renderer registry), and
(c) the identity model (stable array item IDs replacing positional identity).

The problem is (c). TanStack Form's `metaHelper` remaps field metadata by index
on every array mutation. Its `fieldInfo` record is keyed by dot/bracket path
strings. Stable identity requires a parallel mapping layer that intercepts every
array operation and translates between stable IDs and positional paths. This is
not building on top; it is working around a core design decision.

The type system collapse is also structural: TanStack Form's 23 generic
parameters on `FieldApi` are its primary differentiator, and they all degenerate
to `any` when the form shape is derived from a runtime JSON Schema. You gain the
adapter set but lose the feature that justifies the library's complexity.

**The verdict on TanStack Form:** if the goal were "add JSON Schema support to an
existing form state manager," TanStack Form would be the right foundation. But
Texaryn's goal is "schema to UI through a typed IR." The IR, the stable identity
model, and the annotation-driven compilation pipeline are not features that sit
on top of a form state manager; they replace its core data structures. Building
them inside TanStack Form's abstractions would mean fighting its type system, its
identity model, and its store shape.

### Does This Project Deserve to Exist?

Yes, with a narrow scope and an honest assessment of the competition.

**The case for:** No existing project provides stable array identity, async
validation, and a typed IR in a headless, framework-neutral package with JSON
Schema 2020-12 annotation collection. TanStack Form is headless and
framework-neutral but has no schema-driven generation, no IR, and no stable
identity. RJSF has the widest JSON Schema support but is React-locked with
architectural problems that cannot be fixed incrementally (centralized state, no
IR, synchronous validation). JSON Forms is the closest competitor but its untyped
options bag, positional array identity, and AJV coupling are structural, not
incidental. @remoteoss/json-schema-form is genuinely headless but lacks `$ref`,
`dependencies`, and mutates fields in place.

**The case against:** The JSON Schema form space is crowded with good-enough
solutions. Most forms are simple enough that RJSF's problems do not surface.
The users who need stable array identity, async validation, and framework
neutrality simultaneously may be too few to sustain a project. Building a full
JSON Schema form library (including $ref, conditionals, oneOf/anyOf) is 6-12
months of focused work before the first stable release. And the annotation
collection story depends on @hyperjump/json-schema (337K weekly downloads, APIs
marked experimental), a smaller ecosystem player than AJV (378M downloads). The
`SchemaEvaluationPort` abstraction insulates against this, but the first adapter
will lean on Hyperjump's capabilities.

**The verdict:** The project is worth starting if and only if the author commits
to the smallest MVP (section above), ships it within 8 weeks, and measures
adoption before expanding scope. The architecture is sound and externally
validated. The risk is not "is the design right?" but "is the market large enough
for a fifth JSON Schema form library?" The MVP answers that question with
working code rather than speculation.

---

## Architecture Diagram

```
                  Domain Description
                    JSON Schema
                        |
                        v
              Schema Evaluation Port
          refs / active schemas / annotations
          (reacts to data changes)
                        |
                        v
                   IR Compiler
                        |
                        v
             +--------------------+
             | Texaryn UI IR      |
             | versioned          |
             | flat node map      |
             | semantic           |
             | serializable       |
             +--------------------+
                        |
                        v
              Deterministic Runtime
        state / identity / rules / actions
          validation / dirty / touched
                        |
                 getSnapshot()
                 subscribe()
                        |
          +-------------+-------------+
          v             v             v
       React          Vue          Angular
```

Four boundaries: schema evaluation != UI IR != runtime state != renderer.

## ADR Required Before PR #1

**Schema evaluation boundary.** The division between "schema evaluation port
resolves the active schema given current data" and "IR compiler produces snapshots
from that projection" is the most consequential boundary in the system. It
determines: (a) whether the IR can be produced without data (no, for schemas with
conditionals), (b) when re-compilation happens (on data changes that affect the
active schema), (c) what the schema evaluation port's `project()` method returns,
and (d) whether json-schema-library's `getNode(pointer, data)` pattern can back
the port directly. This boundary is expensive to reverse: if evaluation logic is
baked into the compiler, extracting it later requires splitting a monolithic
component. If the port interface is wrong, every adapter must be rewritten. Write
the ADR, prototype the port with a 10-field schema that has one `if`/`then`/`else`
conditional, and verify the boundary holds before committing to it.

## Open Questions

These questions are not resolved by the research and require implementation
experience or user feedback to answer:

1. **Should the IR support layout hints (grid columns, flex direction) or leave
   all layout to the renderer?** The research is split: A2UI includes layout;
   DivKit includes layout; Adaptive Cards includes layout. But all three are
   server-driven UI systems where the server controls layout. For a form
   library, the question is whether layout hints in the IR are a feature or a
   maintenance burden.

2. **Should the validator port include a "resolve applicable sub-schema"
   method?** For oneOf/anyOf discrimination, the adapter needs to know which
   sub-schema the current data matches. This could be a validator
   responsibility (validate against each and pick the one that passes) or an
   adapter responsibility (match on discriminator properties). The validator
   approach is more correct; the discriminator approach is faster.

3. **What is the right granularity for validation scheduling?** Per-field
   debounce timers? Per-form batching? Both? The answer depends on the
   validator's latency profile, which varies between AJV (microseconds) and
   server-side validation (milliseconds).

4. **Should the React binding use React context or direct signal subscription
   for deeply nested forms?** Context avoids prop drilling but couples the
   component tree to the form tree. Direct subscription is more flexible but
   requires each widget to independently connect to the runtime.

5. **Is the `getSnapshot+subscribe` contract sufficient for frameworks with
   pull-based reactivity (Solid, Svelte 5)?** These frameworks may perform
   better with direct signal integration rather than the push-based subscription
   adapter. This is a question for the third or fourth renderer, not the first.

6. **How should SSR work?** The headless core runs in Node.js by construction
   (no DOM, no browser globals). Schema compilation and initial IR generation work
   on the server. The open questions are: (a) should the server send the serialized
   UIDocument to the client for hydration, or should the client re-compile from
   the schema? Sending the UIDocument saves compilation time on the client but
   doubles the payload. (b) How do signals hydrate? The server cannot subscribe to
   signals, but it can produce a snapshot of all node states. The React binding
   would need to hydrate from that snapshot using `useSyncExternalStore`'s server
   snapshot argument. (c) Validation on the server is sync-only (no user
   interaction to trigger async validation). The first render shows no validation
   state, which is correct. This needs prototyping with React Server Components
   and Next.js before committing to a design.

7. **What is serializable and what is not?** Commands, IR documents, and form data
   are serializable by design (plain JSON, no functions, no DOM references). The
   signal graph and the identity map are runtime-only structures that can be
   reconstructed from a serialized UIDocument. Action handlers are host-registered
   functions and are not serializable. This division (data and descriptions cross
   the wire; behavior stays on the host) is the correct boundary for server-driven
   UI. The open question is whether the full command log should be persisted for
   replay and undo: the commands themselves are serializable, but a long session
   accumulates thousands of SetValue commands that may not be worth storing.

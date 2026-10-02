# ADR-007: A Recursive Schema Expands Once Past the Data

## Status

Accepted, for issue #119. Both JSON Schema adapters, `@texaryn/schema-json` and the private `@texaryn/schema-json-hyperjump`, project, validate and initialize every local recursive schema in bounded work, and reject at creation a schema that applies itself at one instance location. The published surface in `@texaryn/core` is `ProjectionBoundary`, `NodeProjection.boundaries`, `NodeProjection.recursiveExpansion`, `NodeProjection.defaultSources`, `ContainerNode.boundaries`, the refusal reasons `recursive-expansion` and `recursive-default`, and `objectChildKey`; in `@texaryn/schema-json` it is `SameLocationCycleError`.

## Context

A projection lists every declared property whether or not the data reaches it. That is load-bearing: an untouched optional field must render. A recursive `$ref` makes that descent unbounded.

Measured before this decision, with json-schema-library 11.6.2:

- schema-json threw `RangeError` or exhausted the heap for `$ref: '#'` under an `$id`, `#/$defs/node`, `#/definitions/node`, mutual `a -> b -> a`, and recursion through a typed `allOf` or `if`/`then` under a definition; through the root, the subtree was dropped and draft-07 validation threw `RangeError`. The catalog example this decision adds, a tree whose `child` is `{ $ref: '#/$defs/node' }`, overflows the stack at `c868832`.
- Hyperjump bounded each `$ref` target once per path past the data, and looped under `schema-defaults`: a default beneath the recursion filled a level, which exposed the next, until the 32-pass budget of ADR-003 threw.
- json-schema-library 11.6.2's draft-07 parser (the draft-06 `$ref` keyword, `src/draft06/keywords/$ref.ts:42-44`) writes `node.context.refs[resolveUri(currentId, node.evaluationPath)] = node` with no check, so the registry entry that `$ref: '#'` resolves through is overwritten during compilation and reductions. On a fresh compile of an anonymous root, `refs[""]` holds `#/properties/name`. A draft-07 adapter for `{ type: 'object', properties: { name: { type: 'string' }, child: { $ref: '#' } } }` returns valid for `{ child: 'text' }` at `c868832`. The draft-07 metaschema lost the 9 root fields whose schema is the root itself (eight `$ref: '#'` and `items`, whose `anyOf` holds one), and with the 5 fields the Consequences name, 32 of its 46 root fields rendered.
- No same-location cycle validated correctly when its condition held. A root `allOf: [{ $ref: '#' }]` or `anyOf: [{ $ref: '#' }]` threw `RangeError` in `validate`. `allOf: [{ if: { properties: { flag: { const: true } } }, then: { $ref: '#' } }]` validated `{ flag: false }` and threw for `{ flag: true }`, except in draft-07 without an `$id`, where `'#'` resolved to `#/properties/flag` and the answer came from that node.
- schema-json reported a spurious `unresolved-projection-shape` for an acyclic `$ref` chain, and dropped the subtree of a draft-07 `oneOf` or `anyOf` wrapper around a `$ref`, nested or not, once it held data, because the reduction of a `oneOf` or `anyOf` loses the selected branch's `$ref`: the field being typed into disappeared.
- json-schema-library's `resolveRef` compiles a fresh copy of the target on every call. An object of 500 string fields behind one `$ref` takes 1,383.6 ms to project at `c868832` (the timing method is under Consequences).
- RJSF 5.24.13 renders object recursion until the tab hangs. RJSF 6 detects the cycle (`CyclicSchemaField`) and renders `CyclicSchemaExpandTemplate`, an explicit expand action.

The constraints any bound has to meet: every data command reprojects; initialization fills exactly what is exposed, `active || provisional` (ADR-003 rule 5); objects have no add control; diagnostics describe schemas, not data; errors attach only to projected nodes, so a bound must never cut inside the data.

## Decision

**A recursive schema expands once past the data.** Past the data, a path never repeats a schema identity. A self-reference shows one empty level; `a -> b -> a` shows `/a` and `/a/b`. Each level the user fills exposes the next.

Three mechanisms, kept separate:

1. **Same-location cycles are schema errors**, rejected when the adapter is created.
2. **Projection across instance locations is bounded** by the data, by schema identity and by a budget on recursion-induced speculative nodes. It moves with the data, so it is reported on nodes.
3. **Initialization never writes where the projection expanded recursion past the data**, and refuses a default that recreates itself. It reads a node fact of its own, never the boundaries, so neither the cut nor the budget changes the data it writes.

### The schema graph

Both adapters build one static graph per adapter, in `schema-graph.ts`. Its vertices are schema positions: a base URI plus a JSON Pointer, with `https://texaryn.invalid/root` as the base of an anonymous root. Messages print only the fragment, so a position in the schema reads `#/properties/child`. Its edges have two kinds:

- **In-place edges** stay at one instance location: `allOf`, `anyOf`, `oneOf`, `not`, `if`, `then`, `else`, schema-valued `dependencies` in every dialect (json-schema-library evaluates it past draft-07), `dependentSchemas` in 2019-09 and 2020-12, and the dialect's reference keywords. `then` and `else` add no edge without an `if`; `if: false` adds none through `then` and `if: true` none through `else`, because the specification does not evaluate them.
- **Instance edges** move to another location: `properties`, `patternProperties`, `additionalProperties`, `items`, `prefixItems`, `additionalItems`, `contains`, `propertyNames`, `unevaluatedItems`, `unevaluatedProperties`.

Reference keywords are per dialect. A keyword from another dialect is unknown and adds no edge.

| dialect | reference edges |
|---|---|
| draft-07 | `$ref`, whose siblings the dialect ignores |
| 2019-09 | `$ref`, `$recursiveRef` |
| 2020-12 | `$ref`, `$dynamicRef` |

A `$dynamicRef` whose statically resolved target is not a `$dynamicAnchor` of the same name behaves as `$ref`, as the specification says, and is an edge to that target. Otherwise its target is chosen from the dynamic scope at evaluation time, so the graph over-approximates it with an edge to every `$dynamicAnchor` of that name. A `$recursiveRef` is an edge to its static target and to every schema declaring `$recursiveAnchor: true`, whatever the target declares and wherever the anchor sits, because json-schema-library 11.6.2 resolves it from the evaluation history without reading either: a cycle through an anchor on a non-root subschema overflows `validate`.

**The check is over the graph, not over evaluation.** It is conservative in two places. A nontrivial conditional is not analysed, so a self-application under an `if` that can never match is rejected. A dynamic reference is over-approximated, so a schema whose static dynamic-reference graph closes a same-location cycle is rejected even when no runtime dynamic scope would select it.

Two sets are derived from the graph, once per adapter:

- **Same-location cycles**: the strongly connected components over in-place edges only.
- **Recursive positions**: every position on a cycle of the whole graph, both edge kinds. Membership is a set lookup.

The graph's documents are the schema and, in schema-json, the bundled metaschemas the adapter loads when the schema references one. Neither adapter's configuration accepts any other remote document, and an unresolvable reference fails closed, so no reference leaves the graph. The resource index that resolves identifiers walks `then` and `else` whatever `if` says, because json-schema-library compiles both, so an `$anchor`, `$dynamicAnchor` or draft-07 fragment `$id` inside a kept dead branch is a reference target; the edges keep the evaluation rule above. An `$id` declared under both `$defs` and `definitions` resolves as the library resolves it: to the `definitions` copy in draft-07, where the library keeps the last node it registers, and to the `$defs` copy in 2019-09 and 2020-12, where it keeps the first. A fragment whose percent escapes do not decode, such as `#/properties/50%off`, is kept raw, which is the key the document holds. The graph is adapter-neutral, so hyperjump carries a copy of the file, as it does for `dialect.ts`, and a test asserts the two are byte-identical.

### Same-location cycles

Every same-location cycle reachable from the root is rejected, conditional ones included, except the trivially unreachable conditionals the graph omits. `createJsonSchemaAdapter` and `createHyperjumpAdapter` throw `SameLocationCycleError`, whose `positions` holds each cycle's members and whose message names one position and the path. For the conditional above, in draft-07 and 2020-12, in both adapters:

> Schema position "#" applies itself to the instance location it is evaluating, without crossing into a property or item: "#" (allOf/0) "#/allOf/0" (then) "#/allOf/0/then" ($ref) "#". The evaluator recurses without end wherever this position is reached, so the schema is rejected.

with `positions` equal to `[["#", "#/allOf/0", "#/allOf/0/then"]]`. The check rejects none of the 1,233 vendored JSON-Schema-Test-Suite schemas. Draft-07 `{ $dynamicRef: '#' }` and 2020-12 `{ $recursiveRef: '#' }` construct, because the keyword is unknown in that dialect; 2019-09 `{ $recursiveRef: '#' }` and 2020-12 `{ $dynamicRef: '#' }` are rejected. `{ if: false, then: { $ref: '#' } }`, `{ if: true, else: { $ref: '#' } }` and a `then` or `else` without `if` construct and validate. A conditional that reaches the root through a property, `then: { properties: { next: { $ref: '#' } } }`, crosses into another location and constructs.

### Terms

- **Holds data:** the value at the location is present as an own property of its parent and not `null`, so a member named `constructor` or `toString` holds data only when the data declares it.
- **Anchor:** the root, every array row, and every location that holds data. A row is an anchor even when it holds `null`, because it exists because the data holds it (the `InsertItem` row of #127).
- **Past the data:** an object member whose value is absent or `null`, where absent includes a parent that is not an object. Anchors are never past the data.
- **Data member:** a member of an anchor. Always projected, never cut, never budgeted, so no declared field of the data disappears.
- **Speculative node:** a past-the-data location that is not a data member, at depth two or more below its nearest anchor.

### Identity

The identity of a projected location is the set of schema positions that apply there, closed under `$ref` and `allOf`, before any merging:

- In draft-07 a schema object holding `$ref` contributes nothing and its siblings are not walked, although json-schema-library parses them; only its target is followed.
- In 2019-09 and 2020-12 a `$ref` site contributes when it holds another keyword.
- A site holding only `$ref` never contributes. It is a pointer, not a schema.
- Conditional and alternative branches (`if`, `then`, `else`, `oneOf`, `anyOf`, `dependentSchemas`, `dependencies`, `not`) are not in the set. Recursion through them is still caught, because the property position it reaches repeats.

Each position's closure is memoised once per adapter. **Positions come from markers.** In schema-json every schema object the graph reaches carries `x-texaryn-position` in the projection's copy of the document, except one that is also instance data (under `const`, `default`, `enum` or `examples`) or a map of subschemas, which a marker would change, generated from the graph's own traversal, and markers are written and read as own properties only. Identity, the recursive-position lookup and every document read take the marker. A boolean subschema, which cannot carry one, takes its parent's marker plus its escaped key. Hyperjump computes identity from its walk positions.

**An empty identity is never a repeat.** Both adapters budget a location whose identity is empty, as a termination guard for any producer of one that is not known.

### The cut

A speculative location whose identity equals the identity of a past-the-data ancestor is not projected and not listed in its parent's `children`. That ancestor carries the boundary `recursion`. The cut is decided before the budget, so a cut location never consumes budget.

### The budget

A speculative node is **recursion-induced** when its identity, or the identity of a past-the-data ancestor, holds a recursive position. Only those are budgeted, so a schema with no recursive position is never budgeted: nested objects five levels deep with four children each project all 1,365 nodes.

The unit of admission is an object together with all of its non-object members (strings, numbers, booleans, enums, and arrays, which have no rows past the data), because the object's reduction is where the cost lies. Only a child the budget counts (past the data, below the first level, recursion-induced) is deferred; every other child is walked at once, so a schema with no recursive position keeps `c868832`'s node order and the key order of the data `schema-defaults` writes. The deferred objects are admitted breadth first by depth below their nearest anchor, ties in pre-order walk order, under two limits per projection: **16 objects, and 512 recursion-induced speculative nodes in total**. An object is admitted only when it and all of its leaves fit in both, and its leaves are admitted with it. A recursion-induced speculative leaf whose parent is a data member counts one node on its own and is admitted while the node limit lasts. A withheld object is not projected and not listed in its parent's `children`; the parent carries the boundary `budget` and still shows its own leaves.

Each limit exists for its own reason. **The object limit shapes what the form shows**: how many levels of a recursive schema appear before the user types. **The node limit bounds what one object can add**, since an object can carry any number of leaves. The limits are constants, not options. `buildProjection` in each adapter takes an internal `limits` parameter that only tests pass.

These limits are not a depth cap. They count only recursion-induced speculative nodes, which lie past the data by definition, so they never cut inside the data, and a data member is never withheld.

### Worked examples

Measured in both adapters, in draft-07 and 2020-12, for `{ type: 'object', properties: { name: { type: 'string' }, child: { $ref: '#' } } }`:

- `{}` projects `''`, `/name`, `/child` (carrying `recursion`) and `/child/name` (`recursiveExpansion`).
- `{ child: {} }` adds `/child/child` (`recursion`) and `/child/child/name` (`recursiveExpansion`); `/child` carries none.
- `{ child: null }` projects as `{}`.
- Mutual `a -> b -> a` at `{}` projects `/a` (`recursion`), `/a/b` and their fields, and stops before `/a/b/a`.
- Recursive array items: rows are anchors, so nothing below a row is cut until a member is absent.

### The port

The port declares these fields; their contract is this.

- **`ProjectionBoundary`** is `'recursion' | 'budget'`.
- **`NodeProjection.boundaries`** says why the projection stopped beneath this node. `recursion`: a descendant would repeat this node's schema identity, and this node is past the data. `budget`: the per-projection budget withheld some of its descendants. A location withheld for either reason is not listed in its parent's `children`. The field is absent when there is no boundary, never an empty array; it lists each reason at most once, `recursion` before `budget`; and only object nodes carry it, because only an object projects speculative members. A self-recursive node whose speculative descendants exhaust the budget carries `["recursion", "budget"]`.
- **`ContainerNode.boundaries`** is copied from an object's projection by the compiler. A binding may ignore it. It keeps a collapsed or explicit-expand rendering open without a port change.
- **`NodeProjection.recursiveExpansion`**: the projection reached this node only by expanding the schema's recursion past the data. It is two or more levels below its nearest anchor, and it or an ancestor below that anchor applies a schema position that lies on a cycle. It is `true` or absent. A policy that writes into the projection must not write here, because each level it wrote would expose another.
- **`NodeProjection.defaultSources`**: the schema positions whose agreeing `default` declarations supplied `annotations.default`. It is present only when `annotations.default` is and the node's identity holds a recursive position, sorted and without duplicates. Outside a cycle a repeated source is one definition shared by two sites, which `c868832` fills at both, so no adapter reports it there. Positions are spelled as `defaultConflict` spells them, a JSON Pointer into the document without the leading `#`, for example `/$defs/node/properties/name`.
- **`DefaultRefusal.reason`** gains `recursive-expansion` and `recursive-default`, below.
- **`objectChildKey(node)`** is the last segment of a node's data pointer, or its node id when it has none.
- **`SameLocationCycleError`** carries `positions`, each cycle's members in sorted order, and a message naming the first position and the path through the cycle.

### Initialization

`schema-defaults` (ADR-003) reads `recursiveExpansion` and `defaultSources`, never `boundaries`.

- **It never writes at a node with `recursiveExpansion`.** Each such absent location that declares a default, or whose declarations disagree, is reported as the refusal `recursive-expansion`. Filling it would materialise the recursion, which is ADR-003's own objection to an unbounded pass: the field is shown, the default is not written, and the refusal says why.
- **The budget only ever withholds nodes with `recursiveExpansion`**, and a cut location would carry it too, so the data initialization writes depends on neither. A withheld or cut location has no node, so it has no refusal either: the refusal list covers what the projection shows.
- **A boundary alone suppresses nothing.** A data member that carries `recursion`, such as `/child` at `{}`, is written when it declares its own default; the next level is then a data member, and `recursive-default` stops the repeat.
- **A default that opens a level, an object or a non-empty array, is refused as `recursive-default` when one of its sources is also a source of a strict ancestor that holds data or was written earlier in the same run**, instead of running the 32-pass budget out. The test reads the data snapshot, so a level an earlier run wrote counts as one written in this run, and each edit leaves a self-recreating default at the depth it reached. A default of `[]`, `null` or a scalar creates no deeper location and is written, so a reply tree ending in `replies: []` or a nullable `next` keeps the data it has at `c868832`. The adapters report `defaultSources` only where identity holds a recursive position, so the test applies only there. It is an intersection of source sets, because agreeing declarations can differ between levels, and it is path sensitive: one source written in two sibling branches is not a repeat. `{ a: { $ref: '#/$defs/kids' }, b: { $ref: '#/$defs/kids' } }`, where `kids` is an array with `default: [{}]` whose items hold a `name` defaulting to `'n'` and the same `a` and `b`, fills `{ a: [{ name: 'n' }], b: [{ name: 'n' }] }` and refuses `/a/0/a`, `/a/0/b`, `/b/0/a` and `/b/0/b`.
- **The order of checks per location** is `recursiveExpansion`, the existing refusals, then the ancestor source.
- **Refusals come from the final pass only**, as before this decision, so a refusal whose location a later write moved is not reported.
- **Termination:** a write happens only where the data reaches or one level below it outside the recursion, so each level of a recursive chain is created only by its own default that opens a level, whose source repeats within finitely many levels.

Each adapter's recursion tests assert that the initialized data is identical with the limits at 0, 16 and unbounded. The conformance suite asserts in both adapters and dialects that a root `title` defaulting to `'x'` beside 17 recursive object properties initializes to `{ title: 'x' }`, with each nested `title` refused as `recursive-expansion`.

### json-schema-library

- **The root reference fix**, in `root-reference.ts`, draft-07 only, because the 2019-09 and 2020-12 parsers register an entry once and never overwrite it. It replaces the root's entry in `SchemaNode.context.refs` (the `""` key for an anonymous root, the root's `$id` without its fragment otherwise) with an accessor that always returns the root and ignores writes, and fixes in the same way, in both compiled trees, every other entry the parser filed for its own location (the root's key plus the node's evaluation path). A reduction during projection therefore cannot replace a definition's entry with a reduced copy that a later reference resolves to. Entries the parser files under a path relative to an ancestor stay writable, because a later compile of that location corrects them. It fails closed: when `context`, `context.rootNode` or `context.refs` is missing or shaped differently, adapter creation throws an error naming json-schema-library 11.6.2, and a once-per-process self-test on two probe schemas, anonymous and with an `$id`, throws if the fix stops repairing validation. The dependency range is `~11.6.2`, the range the tests cover: a new minor needs a Texaryn release that verifies the internal again.
- **The reference cache.** Each compiled `$ref` site resolves to one target node per adapter. The cache key includes the site annotations json-schema-library copies onto a resolved node, and tells `default: null` from no default, so no annotation leaks from one site into another along a `$ref` chain. The shared target is safe only while json-schema-library does not mutate a resolved node. Only `$ref` is cached, because its target is fixed when the schema loads; `$dynamicRef` and `$recursiveRef` are not, because their targets depend on the dynamic scope.
- **Repairs.** `dereference` maps a root reference to the root and follows a `$ref` chain to a fixpoint with a visited set, only through a site whose other keywords do not apply or are annotations the library merges onto the target, and through every site in draft-07, which ignores a `$ref`'s siblings. In 2019-09 and 2020-12 a site declaring `type`, `format` or `enum` beside its `$ref` ends the chain, so those keywords still apply. Where the reduction of a `oneOf` or `anyOf` loses the selected branch's `$ref`, the walk dereferences the evaluator's selected branch, on the shape test and on the object path.
- **Two compiled trees.** Validation compiles the document as written. Projection compiles a normalised, marked copy, described next. Validation therefore equals the result of the library's own evaluation by construction, apart from the construction refusals and the draft-07 root reference fix.

### Branches the specification never evaluates

`normalize.ts` removes, from the document the projection and the schema graph use, a `then` or `else` without `if`, a `then` under `if: false`, and an `else` under `if: true`. It keeps any such branch that a reference reaches, in every spelling json-schema-library resolves, and any branch in which a schema declares an `$id`, `$anchor` or `$dynamicAnchor`, whether or not a reference uses it, and it strips an `if` whose `then` and `else` are both gone. The test reads every object in the document, so a `$ref`, `$dynamicRef` or `$recursiveRef`, or an identifier key inside a `default`, `const` or `examples` value, also keeps a branch. A kept dead branch never blanks a live location: the identity walk carries a `dead` flag, a repeat inside a dead branch never marks a cycle, a node reached dead first and live later is revived, and a kept dead branch contributes its members' declarations but not their closure.

### Hyperjump

The same identity, cut, both limits, boundaries, `recursiveExpansion`, `defaultSources` and construction check, in `static-walk.ts`, with the copied `schema-graph.ts`. `collectDefaultConflicts` takes the projection's walk result instead of walking again with its own cycle key, so it is bounded by the same rule whether `buildProjection` calls it or a test does. Hyperjump walks the live branch of a boolean `if` and registers a schema whose objects are shared between positions. In draft-07 its identity walk, static walk and default-conflict walk ignore `dependentSchemas`, which the dialect does not define, and stop at a `$ref`'s target without following its siblings, as its evaluator and the shared graph do; a boolean target still descends into the siblings. A location without a `type` takes its shape by schema-json's rule, from `projection-shape.ts`, a byte-identical copy of the module schema-json uses. The rule derives a form shape and asserts nothing about the instance, so no `type` is written into the schema and validation is unchanged. Keywords fall into four families (object, array, string, number), and `format` is in none because it describes string contents. Every family counts toward a conflict, but only `object` and `array` are ever inferred: `minimum` cannot tell `number` from `integer`, and a wrong scalar guess selects the wrong widget. Each position that creates a node or structurally writes it (an active or provisional one) records its keyword families on the node, except a position a `then`, `else` or dependent-schema branch reaches at the location it applies at, so the families come from the location's own keywords, its `allOf` members, the selected `oneOf` or `anyOf` branch and the reference target of any of these; a property such a branch declares starts again from its own positions. An explicit `type` from a position that does not apply is only a candidate, whether that position creates the node or meets it typeless. An exposed location creates the nodes of its array rows before it walks any branch, so a branch that does not apply cannot give a row keywords of another family. A node still typeless once the walk ends takes the one family that is `object` or `array`, before boundaries are assigned, and an explicit `type` from a position that applies always wins. Failing both, it takes the one candidate type; with several, a node that lists children takes `object` when it is a candidate, since only an object holds children, or else the one `object` or `array` among them, and any other node stays typeless. A node that stays typeless is omitted together with every node beneath it, and so is a node beneath a scalar, without a report, so every node's parent is an object or an array. Its entry in the parent's `children` stays, and the topmost omitted node of each branch is reported as `unresolved-projection-shape`, or `ambiguous-projection-shape` when more than one family applied, unless it is already reported as a same-location cycle. A node no object schema wrote to is omitted without a report. The same holds for a node that only a `oneOf` or `anyOf` with a renderable branch, none of whose branches applies, wrote to. A branch is renderable when it, read together with the `allOf` members it holds, declares a `type` or keywords of a single family that is `object` or `array`, or declares no keyword of any family and a `oneOf` or `anyOf` it holds has a renderable branch. The recursion contract keeps cut and budget-withheld locations out of `children`.

### Bindings

NodeIds are pre-order counters, so growth before the field being typed into renumbers it. With `child` declared before `name`, typing into `/child/name` exposes `/child/child` ahead of it; keyed by node id, the input would remount and lose focus after one keystroke. React's `ObjectLayout`, React Bootstrap's `BootstrapObjectLayout`, React MUI's `MuiObjectLayout` and Vue's `ObjectLayout` key object children by `objectChildKey`, the key Web Components already used, and Web Components imports it from core.

## Alternatives rejected

- **A data-only bound with an add control for objects.** Projecting only what the data holds hides every untouched optional field, which must render, and objects have no add control in any binding. Adding one is a new control in every family, where one level past the data lets the user reach the next level by typing.
- **A fixed or configurable depth cap.** It counts levels from the root, so it cuts inside the data, and errors attach only to projected nodes, so an error below the cap attaches to nothing. The two limits above are not a cap of this kind: they count only recursion-induced speculative nodes, all past the data.
- **The roadmap's placeholder nodes and cut markers.** A placeholder is a node with no field behind it, a new kind every binding would render, and a cut marker in `children` would list a location the projection does not hold. `boundaries` on the object carries the same fact.
- **Hyperjump's rule of each `$ref` target once per path past the data.** It is keyed on reference targets rather than on what applies at a location, so a recursion through an `allOf` wrapper showed one level more than a direct one: `child: { type: 'object', allOf: [{ $ref: '#' }] }` at `{}` projected `/child/child`. Under `schema-defaults` it looped until the pass budget threw.
- **Content keys for identity.** Equal content at distinct positions compares equal: content keys cut the five-definition all-to-all schema, with no leaf fields and no limits, to 6 nodes against 326.
- **`schemaLocation` keys, or positions derived from `schemaLocation`.** json-schema-library's reduced node carries a `schemaLocation` that grows for merged nodes. It shares one location for `if`, `then` and `else` under a referenced definition, percent-encodes `definitions` names but not `$defs` names, takes the reference's spelling for a target built through its `get()` fallback, and cannot represent a raw `/` or `~` in a `$defs` name, so no inversion of the string recovers the position.
- **A diagnostic for the cut.** Where the cut falls moves with the data, and `SchemaProjection.diagnostics` describes the schema. The node carries it, as it carries `active` and `provisional`.
- **`null` rows as past the data.** A row exists because the data holds it, including a `null` row an `InsertItem` created. Cutting below it would take fields from a row the user just added.
- **Filling defaults where recursion was expanded past the data.** Each level written would expose another.
- **The boundaries as the materialisation barrier.** The budget would then decide the data: where a `budget` boundary falls depends on the limits, so a barrier there writes different data under different limits. ADR-003 rejects that for its own pass budget. `recursiveExpansion` covers every location the cut or the budget can withhold, so neither can.
- **A single limit on objects.** One object can carry any number of leaves: a recursive object with 5,000 string fields behind a definition projects 10,003 nodes at `{ x: {} }` without the node limit and 5,515 with it.
- **A budget over every speculative node.** It cut a non-recursive form, nested objects five levels deep with four children each, to 133 of its 1,365 nodes.
- **A validation-time cycle guard instead of the construction error.** A schema that loops the evaluator is not valid input.
- **An injected `$id` for anonymous roots**, as the registry fix. It failed seven JSON-Schema-Test-Suite tests and leaked into error params.
- **A pnpm patch of json-schema-library.** It does not reach consumers, who install the published package.
- **An explicit expand action as the only rendering**, which is RJSF 6's answer. The projection already exposes the next level as soon as the current one holds data, so an action would add a control to every binding for what typing does; `ContainerNode.boundaries` leaves it available to a binding that wants one.
- **Deciding a dead branch's liveness on json-schema-library's merged nodes.** A merged node no longer records which declaration each branch came from, so liveness cannot be decided on it. Removing the branches from the document before compilation gives the graph, the compiled tree and identity one input.
- **One compiled tree for validation and projection.** json-schema-library evaluates some branches the specification never does (an `unevaluatedProperties` or `unevaluatedItems` merge across a `$ref`) and resolves some references through its depth-1 scope, so validating the normalised document changes results. A shared tree also carries registry state from a projection into a later validation.
- **Carrying refusals across passes.** It reported one location twice with two reasons.
- **String equality for the repeat test.** Agreeing declarations can differ between levels: hyperjump reported `/$defs/n` and `/properties/tree` at `/tree` and `/$defs/n` at `/tree/0/tree`, and string equality wrote one extra level.
- **A shared module for the graph.** It would need a new public export from core or schema-json.
- **Dropping a typeless location together with its members in hyperjump before deriving a shape.** It changed 1,334 of 7,716 measured variants, stopped `schema-defaults` writing typed defaults under a typeless container that schema-json fills, and shifted order-hint positions, while the recursion contract only needs cut and budget-withheld locations out of `children`. Hyperjump derives the shape first (issue #116), so only a location whose keywords imply no shape is omitted, as in schema-json.

## Consequences

**Measured cost.** Every timing here except the creation table is the median of 20 calls on one adapter (projections or one `SetValue` dispatch) after 3 warm-up calls, on an Apple M1 Max with 32 GB and Node 26.5.1, running the TypeScript sources through `tsx`, with other processes holding the load average at 4 to 5. "Before" is `c868832`.

| schema at `{}` | schema-json before | schema-json | hyperjump before | hyperjump |
|---|---|---|---|---|
| the draft-07 metaschema without its `$id` | 33 nodes, 1.8 ms | 403 nodes, 34.3 ms | 369 nodes, 1.1 ms | 412 nodes, 2.4 ms |
| nested objects, 5 deep, 4 children each (1,365 nodes) | 22.0 ms | 26.0 ms | 1.4 ms | 3.3 ms |
| 500 string fields behind one `$ref` (502 nodes) | 1,383.6 ms | 5.0 ms | not measured | not measured |
| six definitions, each referring to all six | `RangeError` | 45 nodes, 1.8 ms | not measured | 45 nodes, 1.5 ms |
| a recursive object with 5,000 string fields behind a definition | `RangeError` | 514 nodes, 51.0 ms | not measured | 514 nodes, 44.2 ms |

On the metaschema form, one `SetValue` dispatch takes 1.7 ms before and 35.6 ms now.

**Creating a schema-json adapter costs 2.4 to 4.6 times what it did at `c868832`, and the design accepts that one-time cost.** Creation normalises the document, builds the schema graph, checks it for same-location cycles, marks positions and compiles a second tree; the graph and the second compiled tree take most of it. It stays under 20 ms at 1,365 nodes. These rows are the final review's measurements on this machine: built JavaScript, the median of 20 creations, `c868832` and this decision interleaved.

| schema | before | now | ratio |
|---|---|---|---|
| small, no remote | 0.03 ms | 0.08 ms | 2.8x |
| small, 2020-12 metaschema remote | 1.66 ms | 3.96 ms | 2.4x |
| small, draft-07 metaschema remote | 0.40 ms | 1.29 ms | 3.2x |
| 200 flat string fields, 2020-12 | 0.62 ms | 2.59 ms | 4.2x |
| 200 flat string fields, draft-07 | 0.56 ms | 2.29 ms | 4.1x |
| nested objects, 5 deep, 4 children each (1,365 nodes) | 3.96 ms | 18.41 ms | 4.6x |
| the draft-07 metaschema without its `$id` | 0.21 ms | 0.90 ms | 4.3x |
| six definitions, each referring to all six | 0.18 ms | 0.77 ms | 4.3x |

Creating a hyperjump adapter costs 1.04 to 1.31 times what it did.

**The draft-07 metaschema costs more because the adapter now renders fields it used to drop.** With both limits at 0 it projects 42 nodes in 19.7 ms, against 33 nodes in 1.8 ms before: it follows the 9 root fields that reference the root, each a reduction of the whole metaschema. It renders 41 of its 46 root fields (32 before), and hyperjump 44 (44 before). The five schema-json does not render are `default` and `const`, which are boolean schemas, and `minLength`, `minItems` and `minProperties`, whose `nonNegativeIntegerDefault0` is a typeless `allOf` wrapper around a `$ref`, which schema-json does not project; hyperjump misses the two boolean ones.

**Why 16 objects.** The draft-07 metaschema at `{}` over the object limit, with the node limit at 512:

| object limit | schema-json | hyperjump |
|---|---|---|
| 8 | 317 nodes, 31.3 ms | 323 nodes, 2.5 ms |
| 16 | 403 nodes, 34.3 ms | 412 nodes, 2.4 ms |
| 32 | 512 nodes, 50.8 ms | 524 nodes, 3.1 ms |
| 64 | 507 nodes, 61.6 ms | 525 nodes, 3.4 ms |

At 16 the node limit does not bind on the metaschema (361 recursion-induced nodes in schema-json, 367 in hyperjump; removing the node limit changes nothing), and no container carrying `budget` is left without a child. At 32 and 64 the node limit binds and leaves 2 and 4 such containers with no child to type into. On the 5,000-field object the node limit binds at `{}` (5,002 nodes without it, 514 with it). Projection time changes little there (54.2 against 50.1 ms in schema-json, 43.3 against 41.3 ms in hyperjump, each a separate run), because the reduction of the object is the cost; what the node limit bounds is the number of nodes the runtime compiles and a binding renders.

**A non-recursive schema pays for the identity bookkeeping**, as the nested row shows. schema-json's general per-node cost is driven by reductions and is a separate issue.

**A schema that constructed before can now fail at creation.** A conditional self-application at one location constructed and validated while its condition was false; it is rejected at creation, and the message names the position. The same holds for a dynamic reference whose static graph closes a same-location cycle that no runtime scope selects.

**Validation compiles the document as written, projection a normalised copy.** Three consequences follow:

- A reference that json-schema-library resolves through its depth-1 scope into a removed dead branch's child renders as the live declaration while validating against the removed one: in 2019-09 and 2020-12 four such shapes render a field as a number that validation requires to be a string, and in draft-07 one shape the reverse. When nothing live declares the target, the field is listed in its parent's `children` with no node and no diagnostic, which is how any unresolvable `$ref` projects.
- An error that only a removed branch declares lands at no node. On such a form `Submit` returns to `idle` without calling `onSubmit` and with no visible error, as an `additionalProperties` error at an undeclared key does.
- Validation after a projection equals validation before it. With one shared tree, json-schema-library's reductions changed registry state that a later `validate` read: in draft-07 a reference then resolved elsewhere, and in 2019-09 an `$anchor` inside an `enum` or `const` value made `validate` throw `RangeError`.

**Fields under a branch the specification never evaluates are not projected**, unless a reference reaches the branch or a schema inside it declares an `$id`, `$anchor` or `$dynamicAnchor`. For a branch with neither, hyperjump already behaved this way, and schema-json showed its fields as inactive. A kept branch, whether a reference or an identifier keeps it, still shows its fields as inactive in schema-json, as at `c868832`, and hyperjump projects none of them at the branch's location.

**Known limits, not fixed here:**

- A 2019-09 schema with a `$recursiveAnchor` on a non-root subschema can be flagged `recursiveExpansion` where json-schema-library never recurses, the accepted over-approximation. A `$recursiveAnchor` at a position the resource index never walks is not a dynamic target.
- `defaultSources` keeps each adapter's spelling of a position, as `defaultConflict` does, and they differ for an encoded name: a draft-07 definition named `d 0` is `/definitions/d%200/properties/v` in schema-json and `/definitions/d 0/properties/v` in hyperjump.
- At a node whose identity holds a recursive position, hyperjump reports an empty `defaultSources` where its evaluator reports a default its static conflict walk never visits: under `additionalProperties` or `patternProperties`, in a draft-07 `dependencies` branch and behind references that are not `#`-local. The pass cannot see that default repeat, so a self-recreating default in one of those shapes still runs to the 32-pass budget. A `default` beside `$ref` in 2019-09 and 2020-12 does not: hyperjump reports it only where the data holds the location, and never writes it.
- `active` differs between the adapters in 47 cases of the recursion conformance suite, in 17 fixtures, listed in `KNOWN_ACTIVE_DIFFERENCES` in `tests/conformance/recursive-ref.suite.ts`. In these cases neither adapter changed its `active` value at any location it projected at `c868832`. 26 of the cases, in 10 fixtures of conditional declarations without recursion, differ the same way at `c868832`. The other 21 have no counterpart there. In 19, schema-json did not project the location at `c868832`: beneath wrapped recursion (`allOf`, `if`/`then`/`else`, draft-07 `oneOf`) it dropped the subtree or threw `RangeError`, and under nested draft-07 `oneOf` wrappers it dropped the subtree. In 2, hyperjump did not project it, because it did not walk the live `else` of a boolean `if`.
- The adapters feed the shape rule from different positions. schema-json reads a location's own keywords and the `oneOf` or `anyOf` branch the data selects. Hyperjump also reads the location's `allOf` members and the reference target of any of these positions. In neither adapter does a `then`, `else` or dependent-schema branch add keywords to the location it applies at, so that location's shape and reports do not follow the value the branch depends on. A typeless root whose only keyword is an `allOf` member holding `properties` is an object in hyperjump and unresolved in schema-json, and an `allOf` member that adds keywords of a second type makes the location ambiguous in hyperjump and an object in schema-json. Hyperjump takes a `type` that only positions that do not apply declare by the candidate rule above, where schema-json gives a typeless wrapper no branch applies to an `object` stand-in and a property that unselected branches declare the first branch's type: with no value, hyperjump omits a `oneOf` of two scalar types and a discriminated property whose branches give it different scalar types, types a `oneOf` whose branches share one scalar type by it, and makes an `anyOf` of an object with `properties` and an array an object where schema-json makes it an array. A scalar that declares `properties` keeps them in hyperjump's `children` with no node, and schema-json lists none. A typeless `oneOf` or `anyOf` wrapper whose branches declare no `type`, and that no branch applies to, is omitted without a report in hyperjump, where schema-json lists a `oneOf` wrapper's branch fields as inactive, and the port contract keeps a composition the value does not match out of the diagnostics. schema-json looks one level into a branch, so for `anyOf: [{ oneOf: [...] }]` whose inner branches only declare `properties` it reports `unresolved-projection-shape` for a value that selects no branch and projects the location for one that selects a branch; hyperjump looks through nested `oneOf`, `anyOf` and `allOf` members and reports nothing. A draft-07 `oneOf` branch that is only a `$ref` stays inactive in hyperjump's branch check, so that wrapper is omitted without a report too. A typeless location whose own keywords imply a shape keeps the `active` flag of its typed twin while its value is absent, except a typeless `oneOf` container, which both adapters keep inactive. Hyperjump also reports a `$ref` it does not follow and a `$ref` to a boolean schema, where schema-json projects the first and reports nothing for the second. `projection-shape.suite.ts` pins the `allOf`, `oneOf`, candidate `type` and draft-07 `$ref` rows in both adapters, and that a `then`, `else` or dependent-schema branch leaves the shape and reports the same for both values of its condition. Known limit: a property of an array row that both the exposed row and a branch that does not apply declare takes the branch's keyword families first, so an active typeless property of that kind can be reported ambiguous and dropped with its subtree. The primary adapter does not have this limit, and it is filed in #177.
- Hyperjump marks a location inactive while its value is absent when a schema position at that location (an `allOf` member, a `then` or `else`, a `oneOf` or `anyOf` branch, or a dependent-schema branch) has no `type`, holds a `oneOf`, an `anyOf`, an `if` with `then` or `else`, or dependent schemas, and none of the branches it holds is active, even when the location has a `type`: the rule reads the type of the position being walked, not of the location. A branch of a position that is not itself active is not active. A later active position at the location sets the flag back to `true`, so the result follows the order in which the walk reaches the positions. schema-json keeps the location active. A typed optional object with `allOf: [{ if, then }]` renders as a hidden container in hyperjump, and at the root this is why `project(undefined)` can differ from `project({})`. It is a follow-up issue.
- Form projection of `$dynamicRef` and `$recursiveRef` stays outside the documented scope. Only their cycle check is specified here.
- Follow-up issues: the `active` differences listed in `KNOWN_ACTIVE_DIFFERENCES`; form projection of `$dynamicRef` and `$recursiveRef`; a `$recursiveAnchor` at a position the resource index never walks; caching speculative subtrees across projections; schema-json's general per-node projection cost; schema-json's array path ignoring `items` and `default` that exist only inside `allOf`; `$ref`-site `default` by dialect; the typeless `allOf: [{ $ref }]` drop and unprojected `additionalProperties` members; hyperjump following only `#`-local references; hyperjump's `URIError` on a non-ASCII percent-escaped reference; json-schema-library's shared `schemaLocation` for a root `then` and `if` under an `$id`; three candidate-walk visited keys that still read `schemaLocation`; an inline `then` or `else` beside an inline `if` inside a referenced definition, which schema-json drops; an upstream report for the registry overwrite; an explicit expand rendering for a boundary.

## Related

- ADR-003, whose pass budget this decision keeps from running out on a recursive schema
- Issue #127, the `InsertItem` row that makes a `null` row an anchor
- `tests/conformance/recursive-ref.suite.ts` and `tests/conformance/recursive-initialization.suite.ts`, the port contract in both adapters
- `packages/schema-json/src/__tests__/recursion.test.ts` and `packages/schema-json-hyperjump/src/__tests__/recursion.test.ts`, the budget in both, and the reference cache in schema-json's

# @texaryn/core

## 0.8.0

### Minor Changes

- 89c44e5: Makes a pointer segment mean the same thing to `setAtPointer` as it does to
  `getAtPointer` when the container is an array, and writes down the contract.
  
  The writer coerced the token with `Number(key)` while the reader used it as a
  property key, so the two addressed different places. `getAtPointer(['a','b'], '/01')`
  was `undefined` while `setAtPointer(['a','b'], '/01', 'x')` wrote element 1.
  Worse, `Number('1x')` and `Number('-')` are `NaN`, so those writes set a
  property named `"NaN"` on the array, which `JSON.stringify` drops: the value
  was accepted, stored, and then silently absent from the submission.
  
  Per RFC 6901 an array token is digits with no leading zero, or `-` for the
  position after the last element. A canonical index now writes that element and
  `-` appends. Anything else throws.
  
  Two behaviour changes come with it. A non-index token that previously coerced,
  such as `/01`, now throws instead of writing a different element. And an index
  past the end now throws instead of extending the array, because the gap would
  be holes and a hole serializes as `null`, which would submit values no schema
  described. An index equal to the length still appends, since that creates no
  gap. Objects keyed `"01"` or `"-"` are untouched; this is about arrays.
  
  `setAtPointer` now carries its contract in full, and `getAtPointer` states that
  it is total. The asymmetry is deliberate: reading a location that does not
  exist yields `undefined`, while writing where nothing can be written is an
  error.
- 43e4370: Creates every missing parent level on a write, instead of one and then
  throwing.
  
  `setAtPointer` created exactly one absent level and raised a `TypeError` on
  two, because it read the child before recursing and reading a missing level
  threw. The last segment tolerated absence, since `{ ...undefined }` is `{}`,
  which is why one level worked and two did not. A form built with
  `initialData: {}` over a schema nested two levels deep therefore threw out of
  `dispatch` on the first keystroke in that field, and `dispatch` returns `void`
  from an event handler, so the exception landed in the host's render with
  nothing able to handle it. `setAtPointer({}, '/a/b/c/d', 1)` now returns four
  nested objects, and an absent or `null` level is created at any depth.
  
  A missing level is created as an object whatever its key looks like, including
  a numeric one. A numeric segment does not imply an array: an object property
  may be named `"0"`, and the projection builds `/rows/0` for it from the
  property name. Writing into an array that already exists is unchanged, and an
  array that has to be created is the caller's to create.
  
  Both refusals also name the offending location with a correctly escaped
  pointer. `parsePointer` unescapes, so rebuilding a pointer from its segments
  without re-escaping printed `/a/b` for the single key `a/b`, and a caller who
  copied that pointer out of the message would have addressed a different
  location. The writes themselves were always correct; only the message was wrong.
  
  Nor does anything need such a level to become an array: an array item's pointer
  exists only once its row is in the data, which means its array already exists,
  so the level above an index is never the missing one.
- a835e87: Separates two facts a projection had been collapsing into one boolean.
  `NodeProjection.active` keeps its meaning, that JSON Schema evaluation says the
  node applies, and `NodeProjection.provisional` is new: the form exposes the node
  so the user can complete it. `ChildProjection.provisionalRequired` is the same
  split for requiredness.
  
  A renderer shows a node when either holds, and reports a field required when
  either holds, which the compiler decides so the two facts stay apart on the
  port. Both new fields are optional and absent means false, so an adapter that
  does not select provisionally behaves exactly as before and no binding changes.
  
  Nothing emits `provisional` yet. It exists so a `oneOf` branch the data uniquely
  identifies but has not yet satisfied can be shown rather than hidden, which is
  issue #120: hiding it leaves the user no way to supply the property that would
  make the branch apply.
- 9b262d3: Refuses to write through a value that cannot hold a property, and stops
  treating a `null` root as absent.
  
  `setAtPointer` used to spread whatever it found on the path. `{ ...'plain' }` is
  `{0:'p',1:'l',2:'a',3:'i',4:'n'}` and `{ ...7 }` is `{}`, so a form whose data
  had a scalar where the schema expected an object turned that scalar into
  character keys, or discarded it, on the first write to a child. Both produced an
  instance no schema described, from data the caller had supplied, and the string
  case did it silently. It now throws, naming the pointer being written, the
  location of the offending value and its type.
  
  Absent still creates, which is how a nested field is written at all, and `null`
  creates with it: `getAtPointer` reads through `null` and `undefined`
  identically, so writing agrees with reading, and a schema of
  `{ type: ['object', 'null'] }` may legitimately start at `null`.
  
  `createFormRuntime` no longer coerces `initialData: null` to `{}`, and `Reset`
  no longer treats `data: null` as no data. Both used `??`, which conflated `null`
  with absent while `false`, `0` and `''` survived, so a caller could not express
  a `null` instance and which falsy values lived was arbitrary. Both now test for
  `undefined`.
  
  A scalar root is unaffected where the schema says the root is the field: writing
  at the root pointer replaces the document rather than walking into it. The
  refusal is about the write, not about the root.
- 748b250: Derive a form shape for schemas that declare structure without `type`
  
  A schema is not obliged to declare `type`, and one that declares `properties`
  without it is both valid and widespread: not one parameter step in a Backstage
  Software Template declares `type: object`. Every such schema used to project no
  node at all, which threw at the root and, one level down, dropped the field
  from the form with no error at all.
  
  The projection now derives a shape from type-specific structural keywords when
  exactly one JSON type's keywords are present, and reports the pointer as
  ambiguous when more than one type's are. Nothing scalar is inferred, because
  `minimum` cannot distinguish `number` from `integer` and a wrong guess selects
  the wrong widget.
  
  This is a projection decision and not a type assertion. No `type` is written
  into the schema and the schema is never mutated, so
  `{ properties: { name: … } }` continues to accept a string, a number and null,
  exactly as JSON Schema says it should, while the form renders as an object.
  
  `SchemaProjection` gains an optional `diagnostics` array, with the
  `ProjectionDiagnostic` and `ProjectionDiagnosticCode` types, so a pointer that
  could not be given a shape is reported rather than silently absent. Two codes:
  `ambiguous-projection-shape` where keywords from more than one type conflict,
  and `unresolved-projection-shape` where there is nothing to go on at all. An
  `enum` without a `type` is the common case of the second, and deliberately not
  read as a string, because JSON Schema permits members of different types.
  
  Diagnostics describe schemas rather than data. One case is not reported: a
  `oneOf` or `anyOf` whose branches the current value does not match, where some
  branch would have rendered for a value that did. Whether the value is
  acceptable is validation's subject. A branch the value does match and that
  still supplies no shape is reported, as is a composition with no renderable
  branch at all, because those are limitations rather than data states.
  
  The rule in full: an explicit `type` is used, an unambiguous structural shape
  is derived, and everything else is reported. Nothing is guessed and nothing
  disappears without a word.

### Patch Changes

- b2bb9d6: Stops `dispatch` from tearing down validation for a command that then throws.
  
  `dispatch` invalidated the validation scheduler before running the command, on
  the assumption that a dispatched command always happens. Since the pointer
  write began refusing to write through a value that cannot hold a property, one
  does not, and the two steps disagreed: `invalidate` bumps the epoch, which is
  how an in-flight validation result is recognised as stale and dropped without
  calling back, and everything that would repair the state runs past the throw.
  
  The result was not a lost update but a wedged form. With a validation in
  flight, a refused write left the submission at `validating` and its nodes at
  `pending` permanently, with no writer left to move them, and a later `Submit`
  could not recover it because the submission was already `validating`.
  
  Every side effect now happens after the handler returns, so nothing observable
  is torn down for a command that turns out not to happen. A refused write
  changed no data, so the validation already running against that unchanged data
  is left to finish.
- 55ce8d6: Stops the pointer helpers treating JavaScript's inherited properties as members
  of the JSON document.
  
  Both walked with `current[key]`, so `{}` appeared to have `constructor`,
  `toString` and a `__proto__` leading out of the document. `getAtPointer({}, '/constructor')`
  returned a function rather than `undefined`, and a deeper pointer through
  `/__proto__` surfaced prototype members as if they were the instance's data.
  
  The write side turned that into a visible failure. `"constructor"` is a legal
  JSON Schema property name, and since the pointer write began refusing to write
  through a value that cannot hold a property, a function cannot, so a form over
  a schema declaring that property could not be filled in:
  `setAtPointer({}, '/constructor/name', 'x')` threw instead of creating the
  object. It now writes it.
  
  Both helpers change together, because `getAtPointer` is what seeds every node's
  initial value and fixing only the writer would leave the reader exposing
  inherited members.
  
  Writing `__proto__` lands as an ordinary own property and does not reassign the
  prototype, which object spread already guaranteed and is now pinned. An array's
  `length` is an own property and is still read; whether a pointer should address
  it is a question about array semantics and is tracked separately.

## 0.7.0

### Minor Changes

- 04270e8: Give every array action control an accessible name that says which row it acts on.
  
  Five buttons all announced as "Remove" leave a screen reader user guessing. Each now carries the current 1-based position and whatever schema titles exist, so "Remove Contact 2 from Contacts", degrading to "Remove item 2" when nothing is titled. Reorder controls read "Move up Contact 2 in Contacts", and the per-array control reads "Add item to Contacts". The visible words stay "Remove", "Up" and "Add", with the longer string in `aria-label`, which contains the visible text so speech input still works.
  
  The row's own value is deliberately not used: it is mutable, often blank, frequently duplicated, and sometimes sensitive. The position is recomputed on every render rather than captured when a row is created, because a row survives a move while its position does not.
  
  The add control is named from the item template rather than from the first row, so an empty array still says "Add Tag" where naming it matters most. That needed the template's annotations, which the projection did not carry: `NodeProjection.itemAnnotations` is new and optional, so an adapter that cannot supply it stays valid, and `ArrayMeta.itemTitle` carries the result to renderers.
  
  React exposes the decision as `useArrayActions` so its three widget sets cannot drift, and the name builders are exported for custom widgets. Reorder-control parity is unchanged: the three React sets still expose no reorder button.

## 0.6.0

### Minor Changes

- e7c00ce: Render a schema's `readOnly` as read-only rather than disabled, and enforce it in the runtime.
  
  A disabled control is not focusable and is announced differently; a read-only one stays focusable and selectable, which is what `readOnly` means. Compiled nodes now carry a resolved `readOnly` that a read-only object or array passes to everything beneath it, because editing a descendant changes the ancestor's value. The runtime refuses `SetValue`, `InsertItem`, `RemoveItem` and `MoveItem` on a read-only node, so a custom widget set cannot write past the restriction; `Reset` stays allowed as the owning authority replacing state. Renderers use the native `readonly` attribute where HTML has one and `aria-readonly` plus refusing the change where it does not, which is select and checkbox. `disabled` remains part of the node API, but the compiler no longer derives it from `readOnly`, so compiled nodes currently resolve it to false.

## 0.5.1

### Patch Changes

- 469fe1f: Per-node runtime state now follows the logical array item across a reorder instead of staying at the index. Node ids are positional, so `MoveItem` used to leave `dirty`, `touched`, `errors` and `validationStatus` with whichever item took the old position, which reported a valid row as invalid carrying another row's message while the invalid row looked valid. Recompilation now carries interaction history by a logical address built from property names and `StableItemId`s, and starts an inserted item fresh. A validation result is dropped rather than moved when an item's pointer changes, because a schema can apply per index, so a result produced at the old position says nothing about the new one. Every binding reads `getNodeState`, so React, Vue and Web Components all gain the fix unchanged.

## 0.5.0

### Minor Changes

- 8b20b6e: Array identity is keyed by an opaque `IdentityKey` for the logical container instead of the positional node id, exposed as `ArrayMeta.identityKey`. A nested array now keeps its `StableItemId`s when the row that contains it moves, or when a row is inserted or removed above it. `compile` returns identity for the arrays it visited only, so an array that leaves the document is minted afresh when it returns, and a compile that throws leaves the previous identity untouched. `registerArray`, `insertItem`, `removeItem`, `moveItem` and `reconcile` take an `IdentityKey` where they took a `NodeId`.

## 0.4.0

### Minor Changes

- ffae9f1: A failed Submit now shows its errors. Before, `showErrors` required a field to be touched, so submitting a form the user had not interacted with validated, failed, returned to idle and displayed nothing. `SubmissionState` gains `attempts`, the number of accepted Submit commands since creation or the last Reset, and a field's errors are shown once it is invalid and either touched or `attempts` is above zero. Reset returns `attempts` to zero.

## 0.3.0

### Minor Changes

- cd13f98: The `order` field hint is now applied. It sets presentation order among siblings: lower comes first, a field without one keeps its schema position, and equal values keep schema order. Hinted and unhinted fields share one scale, so moving a field to the front means giving it a value below every schema index. It orders siblings and nothing else, and array items are unaffected because their order is their data order.
  
  `colSpan` and `hidden` are now marked deprecated. Both were already inert. `colSpan` needs a layout contract that does not exist, and `hidden` needs an explicit decision about whether a hidden field validates, submits, stays active and retains its data, which would otherwise conflict with the active and inactive semantics schema evaluation already provides. Neither is removed yet; both go in the next major.

### Patch Changes

- 3172a01: Array item identity now survives mutation at the document boundary. The command handler already maintained it, reconciling on data changes and updating it directly for insert, remove and move, but every recompile discarded that and rebuilt a positional set, so `arrayMeta.itemIds` handed renderers index semantics: removing the first of two rows moved the survivor from `item_1` to `item_0`, detaching any per-row state keyed to it. Compilation now adopts the identity the handler produced.
  
  `compile()` takes an optional fourth argument carrying that identity forward. It is additive and defaults to the previous behaviour, so no caller has to change.

## 0.2.0

### Patch Changes

- f223cf9: Apply the `helpText` UI hint. The compiler carries it onto the field node and the default widgets render it as the field description, taking precedence over the schema `description`, with `aria-describedby` linking the input to it. `colSpan` is marked deprecated: it has never been applied and will be removed or replaced once Texaryn has a layout contract. `hidden` is documented as not applied yet.

## 0.1.2

### Patch Changes

- 25cb16e: Add focused npm search keywords and GitHub Sponsors funding metadata to the public packages.

## 0.1.1

### Patch Changes

- 9bcc0b2: Apply the `placeholder` UI hint. The compiler now carries it onto the field node and `getInputProps` emits it, so text, number and textarea widgets render the placeholder that the hint has documented since the first alpha.

## 0.1.0

### Minor Changes

- afa1f81: Add display-policy-aware error presentation. Core runtime computes `showErrors` per node (`touched && invalid`) and maintains a reactive `visibleErrors` aggregate. React prop getters set `aria-invalid` and error-linked `aria-describedby` only when `showErrors` is true. New `FieldErrors` component replaces inline error rendering in all default widgets. New standalone `ErrorSummary` component subscribes to `visibleErrors`.
- 65d58b2: Add automatic validation triggered by blur, change, and submit hints with configurable debounce, epoch-based stale result protection, and submission race handling.
- 18f74ea: First public alpha: JSON Schema to React form pipeline.
  
  Schema evaluation, IR compiler, headless runtime, React bindings, default widgets, and prop getters.

### Patch Changes

- e8807f4: Add submission lifecycle with snapshot semantics.
  Submit captures the current form data as an immutable attempt. Validation
  and onSubmit both operate on the captured snapshot, not live state.
  Duplicate Submit while validating or submitting is a no-op. Edits during
  submitting update the form but do not alter the in-flight payload or
  trigger blur/change validation. Reset or destroy during an in-flight
  submission cleanly cancels via a generation counter.

## 0.1.0-alpha.0

### Minor Changes

- 18f74ea: First public alpha: JSON Schema to React form pipeline.
  
  Schema evaluation, IR compiler, headless runtime, React bindings, default widgets, and prop getters.

# @texaryn/core

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

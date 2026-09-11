# @texaryn/vue

## 0.3.1

### Patch Changes

- Updated dependencies [89c44e5]
- Updated dependencies [43e4370]
- Updated dependencies [b2bb9d6]
- Updated dependencies [55ce8d6]
- Updated dependencies [a835e87]
- Updated dependencies [9b262d3]
- Updated dependencies [748b250]
  - @texaryn/core@0.8.0

## 0.3.0

### Minor Changes

- 04270e8: Give every array action control an accessible name that says which row it acts on.
  
  Five buttons all announced as "Remove" leave a screen reader user guessing. Each now carries the current 1-based position and whatever schema titles exist, so "Remove Contact 2 from Contacts", degrading to "Remove item 2" when nothing is titled. Reorder controls read "Move up Contact 2 in Contacts", and the per-array control reads "Add item to Contacts". The visible words stay "Remove", "Up" and "Add", with the longer string in `aria-label`, which contains the visible text so speech input still works.
  
  The row's own value is deliberately not used: it is mutable, often blank, frequently duplicated, and sometimes sensitive. The position is recomputed on every render rather than captured when a row is created, because a row survives a move while its position does not.
  
  The add control is named from the item template rather than from the first row, so an empty array still says "Add Tag" where naming it matters most. That needed the template's annotations, which the projection did not carry: `NodeProjection.itemAnnotations` is new and optional, so an adapter that cannot supply it stays valid, and `ArrayMeta.itemTitle` carries the result to renderers.
  
  React exposes the decision as `useArrayActions` so its three widget sets cannot drift, and the name builders are exported for custom widgets. Reorder-control parity is unchanged: the three React sets still expose no reorder button.
- c9b930f: Show a required field's requirement to a sighted user, without announcing it twice.
  
  Required was conveyed only through `aria-required`, so a sighted user had nothing to tell a required field from an optional one. Every required label now carries a visible `(required)`.
  
  Three channels carry that one fact and are deliberately kept separate. The visible label reads "Full Name (required)". The accessible name stays exactly "Full Name", because the indicator is `aria-hidden` and `aria-required` already reports the state; putting it in the name as well makes some screen readers say it twice. WCAG's Label in Name allows exactly this omission when the state is surfaced programmatically.
  
  The indicator is the word rather than an asterisk, so nothing has to be explained elsewhere on the form. `field.label` and `fieldLabel()` still return the raw schema title: the decoration lives in the label rendering, so a visual convention does not become the canonical field title a custom widget sees. React exposes `FieldLabelContent` so its three widget sets cannot drift, and each binding exports `REQUIRED_INDICATOR` so a custom widget can match the wording.

### Patch Changes

- Updated dependencies [04270e8]
  - @texaryn/core@0.7.0

## 0.2.0

### Minor Changes

- 3545378: Expose a titled nested object as a named group in React and Vue, closing the last gap the DOM accessibility contract declared.
  
  A nested object rendered as a plain `div` gives no indication where one group of fields ends and the next begins. It is now a `fieldset` named by its `legend`, matching what `@texaryn/web-components` already did. The element is chosen once at mount and only the grouping semantics are re-derived, because a conditional subschema can add or drop a title on any recompile and swapping `div` for `fieldset` at that moment would remount the subtree and take the caret with it. An untitled nested object stays a `fieldset` but carries `role="none"`, since an unnamed group is noise in the accessibility tree.
  
  The decision is shared through a new `useObjectGroup` hook, so the three React widget sets cannot drift apart on it. The root object is still a plain container: it is the form itself, not a group inside one.
- 3e53ca9: Keep each field's error container mounted as a live region instead of inserting it with the message already inside.
  
  A region that appears together with its content is not reliably announced, which is what every binding did: React and Vue rendered nothing until an error existed, and Web Components kept the node but hid it, which takes it out of the accessibility tree just the same. The container now exists from mount, stays empty while the field is valid, and only its contents change.
  
  It is `aria-live="polite" aria-atomic="true"` rather than `role="alert"`. This is a public semantic change: `ErrorProps` promised `role: 'alert'` and now carries the live-region attributes instead. Alert is assertive, and validation runs on change, blur and submit, so keeping it would have interrupted typing and spoken once per failing field on submit. `aria-describedby` stays conditional, pointing at the region only while it has something to say. `ErrorSummary` loses its `role="alert"` and keeps rendering conditionally, because the fields now announce their own errors and an aggregate region would repeat the same validation event.
- 4a161b2: Give every rendering surface its own DOM id namespace, so two forms on one page no longer share ids or reference each other's elements.
  
  `FormProvider` becomes a real component rather than an alias for `FormContext.Provider`, and owns the namespace for everything under it, `ErrorSummary` included. Rendering through `FormContext.Provider` now throws, because the context alone carries no namespace. `makeId`, `getInputProps`, `getLabelProps`, `getErrorProps` and `getDescriptionProps` take the prefix explicitly; there is no unprefixed fallback, which would let a custom widget reintroduce the collision. `@texaryn/vue` takes the prefix from `provideFormRuntime` and now requires Vue 3.5 for `useId`. Generated ids are opaque relationship identifiers rather than styling hooks.
- e7c00ce: Render a schema's `readOnly` as read-only rather than disabled, and enforce it in the runtime.
  
  A disabled control is not focusable and is announced differently; a read-only one stays focusable and selectable, which is what `readOnly` means. Compiled nodes now carry a resolved `readOnly` that a read-only object or array passes to everything beneath it, because editing a descendant changes the ancestor's value. The runtime refuses `SetValue`, `InsertItem`, `RemoveItem` and `MoveItem` on a read-only node, so a custom widget set cannot write past the restriction; `Reset` stays allowed as the owning authority replacing state. Renderers use the native `readonly` attribute where HTML has one and `aria-readonly` plus refusing the change where it does not, which is select and checkbox. `disabled` remains part of the node API, but the compiler no longer derives it from `readOnly`, so compiled nodes currently resolve it to false.

### Patch Changes

- Updated dependencies [e7c00ce]
  - @texaryn/core@0.6.0

## 0.1.2

### Patch Changes

- Updated dependencies [8b20b6e]
  - @texaryn/core@0.5.0

## 0.1.1

### Patch Changes

- Updated dependencies [ffae9f1]
  - @texaryn/core@0.4.0

## 0.1.0

### Minor Changes

- f002477: First release of `@texaryn/vue`: Vue 3 bindings over the same core the React packages use.
  
  Composables (`useForm`, `useField`, `useFieldArray`, `useStore`), provide/inject context, `FormRoot` and `NodeRenderer`, and a default widget set matching the React registry's tests and ranks.
  
  Two things work differently from `@texaryn/react`, and both follow from `setup` running once where a hook re-runs per render. `useStore` accepts a store or a getter and watches it. `useField` and `useFieldArray` take the node id as a ref or getter, which is what keeps a field attached to its own array item across a move rather than to the position it left. `useForm` and `useStore` require an active scope, because each owns something only teardown releases.
  
  The whole example catalog runs through this package in the conformance matrix, and the playground renders it over the same `FormRuntime` instance the React shell owns.

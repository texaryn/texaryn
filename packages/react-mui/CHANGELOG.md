# @texaryn/react-mui

## 0.2.0

### Minor Changes

- 3545378: Expose a titled nested object as a named group in React and Vue, closing the last gap the DOM accessibility contract declared.
  
  A nested object rendered as a plain `div` gives no indication where one group of fields ends and the next begins. It is now a `fieldset` named by its `legend`, matching what `@texaryn/web-components` already did. The element is chosen once at mount and only the grouping semantics are re-derived, because a conditional subschema can add or drop a title on any recompile and swapping `div` for `fieldset` at that moment would remount the subtree and take the caret with it. An untitled nested object stays a `fieldset` but carries `role="none"`, since an unnamed group is noise in the accessibility tree.
  
  The decision is shared through a new `useObjectGroup` hook, so the three React widget sets cannot drift apart on it. The root object is still a plain container: it is the form itself, not a group inside one.
- 3e53ca9: Keep each field's error container mounted as a live region instead of inserting it with the message already inside.
  
  A region that appears together with its content is not reliably announced, which is what every binding did: React and Vue rendered nothing until an error existed, and Web Components kept the node but hid it, which takes it out of the accessibility tree just the same. The container now exists from mount, stays empty while the field is valid, and only its contents change.
  
  It is `aria-live="polite" aria-atomic="true"` rather than `role="alert"`. This is a public semantic change: `ErrorProps` promised `role: 'alert'` and now carries the live-region attributes instead. Alert is assertive, and validation runs on change, blur and submit, so keeping it would have interrupted typing and spoken once per failing field on submit. `aria-describedby` stays conditional, pointing at the region only while it has something to say. `ErrorSummary` loses its `role="alert"` and keeps rendering conditionally, because the fields now announce their own errors and an aggregate region would repeat the same validation event.
- e7c00ce: Render a schema's `readOnly` as read-only rather than disabled, and enforce it in the runtime.
  
  A disabled control is not focusable and is announced differently; a read-only one stays focusable and selectable, which is what `readOnly` means. Compiled nodes now carry a resolved `readOnly` that a read-only object or array passes to everything beneath it, because editing a descendant changes the ancestor's value. The runtime refuses `SetValue`, `InsertItem`, `RemoveItem` and `MoveItem` on a read-only node, so a custom widget set cannot write past the restriction; `Reset` stays allowed as the owning authority replacing state. Renderers use the native `readonly` attribute where HTML has one and `aria-readonly` plus refusing the change where it does not, which is select and checkbox. `disabled` remains part of the node API, but the compiler no longer derives it from `readOnly`, so compiled nodes currently resolve it to false.

### Patch Changes

- Updated dependencies [3545378]
- Updated dependencies [3e53ca9]
- Updated dependencies [4a161b2]
- Updated dependencies [e7c00ce]
  - @texaryn/react@0.3.0
  - @texaryn/core@0.6.0

## 0.1.4

### Patch Changes

- Updated dependencies [8b20b6e]
  - @texaryn/core@0.5.0
  - @texaryn/react@0.2.4

## 0.1.3

### Patch Changes

- Updated dependencies [ffae9f1]
  - @texaryn/core@0.4.0
  - @texaryn/react@0.2.3

## 0.1.2

### Patch Changes

- f0ab713: `MuiSelect` no longer sets `aria-invalid` on MUI's native input. That element carries `aria-hidden="true"` and `tabindex="-1"`, so the attribute was never reachable by assistive technology. The invalid state was already correct and remains so: for a Select, MUI puts `aria-invalid` on the `role="combobox"` element from the `error` prop, and omits it entirely while valid. No rendered behaviour changes.

## 0.1.1

### Patch Changes

- Updated dependencies [cd13f98]
- Updated dependencies [3172a01]
  - @texaryn/core@0.3.0
  - @texaryn/react@0.2.2

## 0.1.0

### Minor Changes

- 7778ff2: First release: Material UI v9 widgets for Texaryn. `createMuiRegistry()` renders MUI TextField, Checkbox, MenuItem, FormControl, Stack, and Button components on top of `@texaryn/react`. The package expects MUI v9 and its styling engine on the page and never loads them itself.

### Patch Changes

- eb1ae23: `MuiSelect` now sets `aria-required` on the element that exposes `role="combobox"`. It previously landed on MUI's native input, which carries `aria-hidden="true"` and `tabindex="-1"`, so assistive technology never saw the required state.

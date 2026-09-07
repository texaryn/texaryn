# @texaryn/web-components

## 0.2.0

### Minor Changes

- 3e53ca9: Keep each field's error container mounted as a live region instead of inserting it with the message already inside.
  
  A region that appears together with its content is not reliably announced, which is what every binding did: React and Vue rendered nothing until an error existed, and Web Components kept the node but hid it, which takes it out of the accessibility tree just the same. The container now exists from mount, stays empty while the field is valid, and only its contents change.
  
  It is `aria-live="polite" aria-atomic="true"` rather than `role="alert"`. This is a public semantic change: `ErrorProps` promised `role: 'alert'` and now carries the live-region attributes instead. Alert is assertive, and validation runs on change, blur and submit, so keeping it would have interrupted typing and spoken once per failing field on submit. `aria-describedby` stays conditional, pointing at the region only while it has something to say. `ErrorSummary` loses its `role="alert"` and keeps rendering conditionally, because the fields now announce their own errors and an aggregate region would repeat the same validation event.
- e7c00ce: Render a schema's `readOnly` as read-only rather than disabled, and enforce it in the runtime.
  
  A disabled control is not focusable and is announced differently; a read-only one stays focusable and selectable, which is what `readOnly` means. Compiled nodes now carry a resolved `readOnly` that a read-only object or array passes to everything beneath it, because editing a descendant changes the ancestor's value. The runtime refuses `SetValue`, `InsertItem`, `RemoveItem` and `MoveItem` on a read-only node, so a custom widget set cannot write past the restriction; `Reset` stays allowed as the owning authority replacing state. Renderers use the native `readonly` attribute where HTML has one and `aria-readonly` plus refusing the change where it does not, which is select and checkbox. `disabled` remains part of the node API, but the compiler no longer derives it from `readOnly`, so compiled nodes currently resolve it to false.

### Patch Changes

- Updated dependencies [e7c00ce]
  - @texaryn/core@0.6.0

## 0.1.0

### Minor Changes

- b87dd23: First release. A `<texaryn-form>` custom element over the unchanged `FormRuntime`, rendering native controls in light DOM and usable from any framework or none. Registration is explicit through `defineTexarynForm()`. The element either creates a runtime from a `port` and destroys it on removal, or borrows one assigned through `runtime` and never destroys it. Native events are left alone and the element adds only `texaryn-data-change` and `texaryn-submission-change`. One `<form novalidate>` turns its submit into the `Submit` command, and every DOM id carries a per-element prefix so two forms on one page share none.

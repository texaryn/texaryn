# @texaryn/web-components

## 0.1.0

### Minor Changes

- b87dd23: First release. A `<texaryn-form>` custom element over the unchanged `FormRuntime`, rendering native controls in light DOM and usable from any framework or none. Registration is explicit through `defineTexarynForm()`. The element either creates a runtime from a `port` and destroys it on removal, or borrows one assigned through `runtime` and never destroys it. Native events are left alone and the element adds only `texaryn-data-change` and `texaryn-submission-change`. One `<form novalidate>` turns its submit into the `Submit` command, and every DOM id carries a per-element prefix so two forms on one page share none.

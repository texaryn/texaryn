# @texaryn/web-components

A `<texaryn-form>` custom element over the Texaryn runtime, rendering native form controls in light DOM.

> Status: unpublished scaffold. The package is private and not on npm. Its first release follows the playground, conformance and browser work.

## What is here

- `defineTexarynForm()` registers `<texaryn-form>` explicitly; importing the package registers nothing.
- Two ownership modes: `element.runtime` renders a runtime the element borrows and never destroys; `element.port` plus `element.options` makes the element create a runtime it destroys when it is removed from the document. The two are mutually exclusive. `options` is read when the managed runtime is created, so set it before `port`; setting `port` again rebuilds the runtime with the current options.
- One `<form novalidate>` in light DOM whose `submit` becomes the `Submit` command; `texaryn-data-change` and `texaryn-submission-change` events carry store snapshots.
- `createDefaultRegistry()` with the same testers and ranks as the React and Vue defaults, and `mountForm()` for rendering without the element.
- Every DOM id is `<prefix>-<nodeId>-<suffix>`, where the prefix is the element's own `id` attribute when it has one, else one allocated per instance, so two forms on one page share no ids.

## Not yet

Shadow DOM, `formAssociated`, nesting inside another form, group and layout containers, text and action nodes, focus management after a failed submit, the playground surface, the conformance suites, the browser suite and the docs.

## License

Apache-2.0

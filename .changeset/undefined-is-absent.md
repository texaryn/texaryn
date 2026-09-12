---
---

`@texaryn/schema-json-hyperjump`: read `undefined` in an instance as absence
rather than refusing it. Clearing a number field made the binding dispatch
`SetValue(nodeId, undefined)`, and the adapter threw
`Not a JSON compatible type: undefined` synchronously out of `dispatch`, into
the host's render, on a keystroke.

The package is unpublished, so no released version carried this.
`@texaryn/schema-json` already behaved this way and is unchanged; the two now
agree, under a shared conformance suite.

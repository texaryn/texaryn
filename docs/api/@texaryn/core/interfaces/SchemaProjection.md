[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / SchemaProjection

# Interface: SchemaProjection

## Properties

### diagnostics?

> `optional` **diagnostics?**: readonly [`ProjectionDiagnostic`](ProjectionDiagnostic.md)[]

Every place the adapter could not choose a shape to render, and why.

A pointer absent from `nodes` renders no field, and without this the
caller cannot tell an intentional omission from a schema the adapter did
not understand. That distinction is not cosmetic: a schema declaring a
field the form silently never collects is the failure mode this exists to
make visible.

The rule the codes divide up: an explicit `type` is used, an unambiguous
structural shape is derived, and a schema that yields neither is reported
here. Nothing is guessed and no schema disappears without a word.

The boundary worth stating, because it is what keeps this channel worth
reading: these describe schemas, not data. A schema whose `oneOf` or
`anyOf` branches the current value happens not to match is not reported,
because that same schema projects a shape for a value that does match one.
Whether the value is acceptable is validation's subject, and a form's data
fails to match for most of the time someone is filling it in, so
reporting it here would mean a diagnostic that flaps on every keystroke.

Optional, so an adapter that reports nothing stays valid, and empty rather
than absent means "nothing to report".

***

### nodes

> **nodes**: `Map`\<[`JsonPointer`](../type-aliases/JsonPointer.md), [`NodeProjection`](NodeProjection.md)\>

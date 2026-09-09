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
structural shape is derived, and everything else is reported here. Nothing
is guessed and nothing disappears without a word.

Optional, so an adapter that reports nothing stays valid, and empty rather
than absent means "nothing to report".

***

### nodes

> **nodes**: `Map`\<[`JsonPointer`](../type-aliases/JsonPointer.md), [`NodeProjection`](NodeProjection.md)\>

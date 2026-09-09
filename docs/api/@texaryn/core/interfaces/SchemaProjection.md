[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / SchemaProjection

# Interface: SchemaProjection

## Properties

### diagnostics?

> `optional` **diagnostics?**: readonly [`ProjectionDiagnostic`](ProjectionDiagnostic.md)[]

Places the adapter could not derive a shape for, and why.

A pointer absent from `nodes` renders no field, and without this the caller
cannot tell an intentional omission from a schema the adapter did not
understand. That distinction is not cosmetic: a schema declaring a field
the form silently never collects is the failure mode this exists to make
visible.

Optional, so an adapter that reports nothing stays valid, and empty rather
than absent means "nothing to report".

***

### nodes

> **nodes**: `Map`\<[`JsonPointer`](../type-aliases/JsonPointer.md), [`NodeProjection`](NodeProjection.md)\>

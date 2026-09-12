[**Documentation**](../../../README.md)

***

[Documentation](../../../README.md) / [@texaryn/core](../README.md) / SchemaProjection

# Interface: SchemaProjection

## Properties

### diagnostics?

> `optional` **diagnostics?**: readonly [`ProjectionDiagnostic`](ProjectionDiagnostic.md)[]

Every place the adapter could not choose, and why.

A pointer absent from `nodes` renders no field, and an annotation absent
from a node states less than the schema does. Without this the caller
cannot tell an intentional omission from a schema the adapter did not
understand. That distinction is not cosmetic: a schema declaring a field
the form silently never collects is the failure mode this exists to make
visible.

The rule the shape codes divide up: an explicit `type` is used, an
unambiguous structural shape is derived, and a schema that yields neither
is reported here. `ambiguous-default` is the same rule one level down, for
a value rather than a shape. Nothing is guessed and nothing the schema
declares disappears without a word.

The boundary worth stating, because it is what keeps this channel worth
reading: these describe schemas, not data.

Two cases are therefore not reported here, and only two.

A `oneOf` or `anyOf` whose branches the current value does not match, where
some branch would have rendered for a value that did. That same schema
projects a shape for such a value, whether the value is acceptable is
validation's subject, and a form's data fails to match for most of the time
someone is filling it in, so reporting it would mean a diagnostic that
flaps on every keystroke.

A disagreement between `default` declarations that a conditional branch
carries, which holds exactly while that branch is selected and so flaps for
the same reason. It is reported on `NodeProjection.defaultConflict`, which
describes this projection rather than the schema and which also carries the
unconditional case, so a consumer acting on a location reads one place.
`ambiguous-default` here is the subset that holds whatever the instance is:
a contradiction in the schema wherever it is used, which is worth telling
whoever wrote it.

Everything else about a composition is reported, including a branch that
the value does match and that still supplies no shape, and a composition
with no renderable branch at all. Both are limitations of the adapter
rather than states of the data, and being inside a composition does not
excuse them.

Optional, so an adapter that reports nothing stays valid, and empty rather
than absent means "nothing to report".

"Nothing to report" is per code rather than per adapter, and the
conformance suite is what says which codes an adapter detects. An empty
array is therefore not a claim that no code applies, only that none of the
ones this adapter detects did.

***

### nodes

> **nodes**: `Map`\<[`JsonPointer`](../type-aliases/JsonPointer.md), [`NodeProjection`](NodeProjection.md)\>

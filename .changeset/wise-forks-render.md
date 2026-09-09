---
'@texaryn/schema-json': minor
'@texaryn/core': minor
---

Derive a form shape for schemas that declare structure without `type`

A schema is not obliged to declare `type`, and one that declares `properties`
without it is both valid and widespread: not one parameter step in a Backstage
Software Template declares `type: object`. Every such schema used to project no
node at all, which threw at the root and, one level down, dropped the field
from the form with no error at all.

The projection now derives a shape from type-specific structural keywords when
exactly one JSON type's keywords are present, and reports the pointer as
ambiguous when more than one type's are. Nothing scalar is inferred, because
`minimum` cannot distinguish `number` from `integer` and a wrong guess selects
the wrong widget.

This is a projection decision and not a type assertion. No `type` is written
into the schema and the schema is never mutated, so
`{ properties: { name: … } }` continues to accept a string, a number and null,
exactly as JSON Schema says it should, while the form renders as an object.

`SchemaProjection` gains an optional `diagnostics` array, with the
`ProjectionDiagnostic` and `ProjectionDiagnosticCode` types, so a pointer that
could not be given a shape is reported rather than silently absent. Two codes:
`ambiguous-projection-shape` where keywords from more than one type conflict,
and `unresolved-projection-shape` where there is nothing to go on at all. An
`enum` without a `type` is the common case of the second, and deliberately not
read as a string, because JSON Schema permits members of different types.

Diagnostics describe schemas rather than data. One case is not reported: a
`oneOf` or `anyOf` whose branches the current value does not match, where some
branch would have rendered for a value that did. Whether the value is
acceptable is validation's subject. A branch the value does match and that
still supplies no shape is reported, as is a composition with no renderable
branch at all, because those are limitations rather than data states.

The rule in full: an explicit `type` is used, an unambiguous structural shape
is derived, and everything else is reported. Nothing is guessed and nothing
disappears without a word.

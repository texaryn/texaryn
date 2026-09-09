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
could not be given a shape is reported rather than silently absent.

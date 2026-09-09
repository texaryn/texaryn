---
'@texaryn/schema-json': minor
---

Project conditional fields declared inside nested applicators

A property that only a nested branch declares was never projected, so the form
could not collect a value its own validation demanded. Given the conditional
idiom Backstage's documentation tells template authors to write,
`dependencies` containing `allOf` containing `if`/`then`, the validator
reported `/lastName` as required and the projection had no `/lastName` at all:
a step that cannot be completed or corrected.

Candidate discovery now recurses through the applicators that act on the same
instance location (`if`, `then`, `else`, `allOf`, `anyOf`, `oneOf`,
`dependentSchemas`, and `$ref` targets) rather than reading one level of each.
It does not follow `not`, whose subschema describes what an instance must not
be, nor the values of `properties` or `items`, which describe other locations.

The defect was never specific to `dependencies`: a top-level `allOf` containing
`if`/`then` failed the same way.

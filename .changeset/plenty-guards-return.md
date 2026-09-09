---
'@texaryn/schema-json': patch
---

Stop throwing while a dependent `oneOf` matches no branch

Projecting a schema whose dependent subschema used `oneOf` threw a `TypeError`
out of `json-schema-library` exactly while the data satisfied none of the
branches. For a form that is the normal path rather than an edge case: the
revealed branch requires a field which has no value at the moment it is
revealed, so the keystroke that set the discriminator took the render down.
It is also the conditional idiom Backstage recommends, so real templates are
written this way.

An unresolved reduction now reports itself the way the projection already
handles, leaving the node's own declared properties active and every candidate
a branch contributed inactive. Validation is unchanged, and no diagnostic is
raised: the schema projects perfectly well for data that satisfies a branch, so
the condition tracks the value rather than the schema.

The guard is scoped to that one upstream defect, identified from the library's
documented `{ node: undefined, error }` contract rather than from the error's
class or message, and anything it cannot account for is re-thrown.

This does not make such a form usable yet. A branch that the data identifies
but leaves incomplete still hides the field that would complete it, which is
tracked separately.
